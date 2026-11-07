/*
	Lists firmware images in cadv/. Enter twice writes the chosen image
	into the other flash slot and reboots into it.
*/

import {} from "piu/MC";
import Timer from "timer";
import { openInstaller, type Installer } from "boot";
import { loadCatalog, openRead, type SdCatalog, type SdEntry } from "catalog";
import { cardSpace } from "card";
import { Power } from "power";
import { acceptStroke, titleWithPower } from "session";
import { fitsSlot } from "slot";
import { pollLink, setLinkBusy, type LinkEvent } from "link";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, navDir } from "keys";
import { MENU_VISIBLE, menuStep } from "list";
import { asMenu } from "menu-view";
import { contentByName, type AppHost } from "ui";
import type { File } from "embedded:storage/files";

type Mode = "list" | "help" | "arm" | "load" | "recv";

const ROW_CHARS = 18;
const ERROR_CHARS = 16;
const CHUNK = 4096;

function formatCount(n: number): string {
	if (n < 1024)
		return n + "B";
	if (n < 1024 * 1024)
		return Math.floor(n / 1024) + "K";
	return Math.floor(n / (1024 * 1024)) + "M";
}

function errorText(e: unknown): string {
	if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string")
		return (e as { message: string }).message;
	return "载入失败";
}

function installNote(message: string): string {
	if (message === "too big")
		return "镜像太大";
	if (message === "no slot" || message === "slot busy")
		return "没有分区";
	if (message === "仅真机")
		return "仅真机";
	if (message.length > ERROR_CHARS)
		return message.slice(0, ERROR_CHARS);
	return message;
}

function rowText(entry: SdEntry): string {
	const big = entry.size > 0 && !fitsSlot(entry.size);
	let text = (entry.error ? "!" : "") + (big ? "超 " : "") + entry.label;
	if (text.length <= ROW_CHARS)
		return text;
	return "..." + text.slice(text.length - (ROW_CHARS - 3));
}

function wrapText(text: string, width: number): string[] {
	const lines: string[] = [];
	let i = 0;
	while (i < text.length && lines.length < 8) {
		lines.push(text.slice(i, i + width));
		i += width;
	}
	if (!lines.length)
		lines.push(text);
	return lines;
}

export class AppBehavior extends Behavior {
	mode: Mode = "list";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	freeBytes = -1;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	catalog: SdCatalog = { root: null, error: "", entries: [] };
	index = 0;
	helpIndex = 0;
	note = "";
	scanning = false;
	rescan = false;
	hostEnterDown = false;
	file: File | null = null;
	installer: Installer | null = null;
	offset = 0;
	loadSize = 0;
	shownPct = -1;
	linkName = "";
	linkWait = 0;
	linkArmed = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.power = new Power("blank");
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.startScan(app);
	}

	onKeyboardTick(app: AppHost) {
		this.onLink(app, false);
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		if (stroke)
			this.handleStroke(app, stroke);
	}

	armLink(app: AppHost) {
		if (this.linkArmed || this.mode !== "recv")
			return;
		this.linkArmed = true;
		Timer.set(() => {
			this.linkArmed = false;
			this.onLink(app, true);
		}, 10);
	}

	onLink(app: AppHost, fromFast: boolean) {
		if (this.mode === "load") {
			try { pollLink(); } catch { /* the host is told this device is busy */ }
			return;
		}
		if (this.scanning)
			return;
		let ev: LinkEvent | null = null;
		try {
			ev = pollLink();
		}
		catch {
			ev = null;
		}
		if (!ev) {
			if (this.mode !== "recv")
				return;
			if (fromFast)
				this.linkWait += 1;
			if (this.linkWait > 500) {
				this.mode = "list";
				this.note = "";
				this.linkName = "";
				this.paint(app);
				return;
			}
			this.armLink(app);
			return;
		}
		this.linkWait = 0;
		if (ev.phase === "recv") {
			const pct = ev.total ? Math.floor(ev.got * 100 / ev.total) : 100;
			const note = "USB " + pct + "%";
			const changed = this.mode !== "recv" || this.note !== note || this.linkName !== ev.name;
			this.mode = "recv";
			this.note = note;
			this.linkName = ev.name;
			if (changed)
				this.paint(app);
			this.armLink(app);
			return;
		}
		if (ev.phase === "done") {
			this.linkName = "";
			this.mode = "list";
			this.note = "";
			this.startScan(app);
			return;
		}
		this.mode = "list";
		this.linkName = "";
		this.note = ev.message === "nocard" ? "无卡" : "失败";
		this.paint(app);
	}

	onKeyDown(content: unknown, key: string) {
		if (key === "\r" || key === "\n") {
			if (this.hostEnterDown)
				return;
			this.hostEnterDown = true;
		}
		const stroke = hostStroke(key);
		const use = this.power ? acceptStroke(this.power, stroke, true) : stroke;
		if (use)
			this.handleStroke(content as AppHost, use);
	}

	onKeyUp(_content: unknown, key: string) {
		if (key === "\r" || key === "\n")
			this.hostEnterDown = false;
	}

	startScan(app: AppHost) {
		if (this.mode === "load")
			return;
		if (this.scanning) {
			this.rescan = true;
			return;
		}
		this.scanning = true;
		this.rescan = false;
		this.note = "";
		this.mode = "list";
		this.paint(app);
		Timer.set(() => this.finishScan(app), 0);
	}

	finishScan(app: AppHost) {
		this.catalog = loadCatalog();
		const space = cardSpace();
		this.freeBytes = space ? space.free : -1;
		this.index = 0;
		this.scanning = false;
		this.paint(app);
		if (!this.rescan || this.mode === "load")
			return;
		this.rescan = false;
		this.startScan(app);
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (this.scanning || this.mode === "load")
			return;
		if (this.mode === "recv") {
			if (isBack(stroke)) {
				this.mode = "list";
				this.note = "";
				this.linkName = "";
				this.paint(app);
			}
			return;
		}
		if (isHelp(stroke) && this.mode !== "help") {
			this.enterHelp(app);
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke)) {
				this.mode = "list";
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.stepHelp(app, dir);
			return;
		}
		if (isBack(stroke)) {
			if (this.mode === "arm") {
				this.mode = "list";
				this.note = "";
				this.paint(app);
				return;
			}
			this.startScan(app);
			return;
		}
		const dir = navDir(stroke);
		if (dir !== 0) {
			const n = this.catalog.entries.length;
			if (n > 0) {
				this.mode = "list";
				this.note = "";
				this.index = menuStep(this.index, n, dir);
				this.paint(app);
			}
			return;
		}
		if (isConfirm(stroke))
			this.confirm(app);
	}

	stepHelp(app: AppHost, dir: -1 | 1) {
		const max = helpFor().length - MENU_VISIBLE;
		let next = this.helpIndex + dir;
		if (next < 0)
			next = 0;
		if (max < 0)
			next = 0;
		else if (next > max)
			next = max;
		if (next === this.helpIndex)
			return;
		this.helpIndex = next;
		this.paint(app);
	}

	enterHelp(app: AppHost) {
		this.helpIndex = 0;
		this.mode = "help";
		this.paint(app);
	}

	confirm(app: AppHost) {
		const entry = this.catalog.entries[this.index];
		if (!entry || !this.catalog.root)
			return;
		if (entry.error) {
			this.note = installNote(entry.error);
			this.paint(app);
			return;
		}
		if (this.mode !== "arm") {
			this.mode = "arm";
			this.note = "再按载入";
			this.paint(app);
			return;
		}
		this.beginLoad(app, entry);
	}

	beginLoad(app: AppHost, entry: SdEntry) {
		const root = this.catalog.root;
		if (!root)
			return;
		setLinkBusy(true);
		let installer: Installer | null = null;
		let file: File | null = null;
		try {
			installer = openInstaller();
			file = openRead(root, entry.path);
			installer.begin(entry.size);
		}
		catch (e) {
			try { file?.close(); } catch { /* */ }
			try { installer?.abort(); } catch { /* */ }
			this.failLoad(app, errorText(e));
			return;
		}
		if (!installer || !file) {
			this.failLoad(app, "载入失败");
			return;
		}
		this.installer = installer;
		this.file = file;
		this.offset = 0;
		this.loadSize = entry.size;
		this.shownPct = -1;
		this.mode = "load";
		this.note = entry.size ? "载入 0%" : "载入";
		this.paint(app);
		Timer.set(() => this.loadChunk(app), 0);
	}

	loadChunk(app: AppHost) {
		const file = this.file;
		const installer = this.installer;
		if (!file || !installer) {
			this.failLoad(app, "载入失败");
			return;
		}
		if (this.offset >= this.loadSize) {
			this.finishLoad(app);
			return;
		}
		let n = this.loadSize - this.offset;
		if (n > CHUNK)
			n = CHUNK;
		try {
			const buf = file.read(n, this.offset);
			if (buf.byteLength <= 0) {
				this.failLoad(app, "读断了");
				return;
			}
			installer.write(buf);
			this.offset += buf.byteLength;
		}
		catch (e) {
			this.failLoad(app, errorText(e));
			return;
		}
		const pct = this.loadSize ? Math.floor(this.offset * 100 / this.loadSize) : 100;
		if (pct !== this.shownPct) {
			this.shownPct = pct;
			this.note = "载入 " + pct + "%";
			this.paint(app);
		}
		if (this.offset >= this.loadSize)
			this.finishLoad(app);
		else
			Timer.set(() => this.loadChunk(app), 0);
	}

	finishLoad(app: AppHost) {
		const installer = this.installer;
		this.closeFile();
		try {
			installer?.finish();
		}
		catch (e) {
			this.failLoad(app, errorText(e));
			return;
		}
		this.note = "重启";
		this.paint(app);
	}

	failLoad(app: AppHost, message: string) {
		setLinkBusy(false);
		try { this.installer?.abort(); } catch { /* already closed */ }
		this.installer = null;
		this.closeFile();
		this.mode = "list";
		this.note = installNote(message);
		this.paint(app);
	}

	closeFile() {
		try { this.file?.close(); } catch { /* */ }
		this.file = null;
	}

	heading(): string {
		if (this.scanning)
			return "扫描";
		if (this.note)
			return this.note;
		const entries = this.catalog.entries;
		const n = entries.length;
		if (this.catalog.error && n === 0)
			return "无卡";
		if (n === 0)
			return "cadv 空";
		if (this.index < 0 || this.index >= n)
			this.index = 0;
		const entry = entries[this.index];
		const pos = (this.index + 1) + "/" + n;
		if (entry.error)
			return pos + " 失败";
		const free = this.freeBytes >= 0 ? " 余" + formatCount(this.freeBytes) : "";
		return pos + " " + formatCount(entry.size) + free;
	}

	paint(app: AppHost) {
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (!view)
			return;
		if (this.mode === "recv") {
			let text = this.linkName || "cadv";
			if (text.length > ROW_CHARS)
				text = "..." + text.slice(text.length - (ROW_CHARS - 3));
			view.setList(port, this.note || "USB", [{ text, selected: true }], "");
			return;
		}
		if (this.mode === "help") {
			const page = helpFor();
			const n = page.length;
			const vis = MENU_VISIBLE;
			let start = this.helpIndex;
			const max = n > vis ? n - vis : 0;
			if (start < 0)
				start = 0;
			if (start > max)
				start = max;
			this.helpIndex = start;
			const lines = [];
			for (let i = 0; i < vis; i++) {
				const row = page[start + i];
				if (row)
					lines.push({ text: row.key, right: row.action, selected: false });
			}
			const title = this.power ? titleWithPower(this.power, `${helpTitle()} ${start + 1}/${n}`) : `${helpTitle()} ${start + 1}/${n}`;
			view.setList(port, title, lines, "");
			return;
		}
		const entries = this.catalog.entries;
		if (this.scanning) {
			view.setList(port, "扫描", [{ text: "读取目录", selected: false }], "");
			return;
		}
		if (this.catalog.error && entries.length === 0) {
			const lines = wrapText(this.catalog.error, ERROR_CHARS).map(text => ({ text, selected: false }));
			view.setList(port, "无卡", lines, "");
			return;
		}
		if (entries.length === 0) {
			view.setList(port, "cadv 空", [{ text: "没有固件", selected: false }], "");
			return;
		}
		if (this.index < 0 || this.index >= entries.length)
			this.index = 0;
		const lines = [];
		for (let i = 0; i < entries.length; i++)
			lines.push({ text: rowText(entries[i]), selected: i === this.index });
		view.setList(port, this.heading(), lines, "");
	}
}
