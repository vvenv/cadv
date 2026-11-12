/*
	Lists firmware images in cadv/ as a horizontal icon grid.
	Enter writes the chosen image into the other flash slot and reboots;
	when that slot already holds the same image it boots it without writing.
	BS while the bar is filling cancels. If the app restarted before it
	confirmed itself, the bootloader came back here and the title says so. The last app loaded is selected
	again on the next visit. Arrows move in the grid; a letter jumps to the
	next app whose id starts with it (H/J/K/L stay movement keys).
*/

import {} from "piu/MC";
import Preference from "preference";
import Timer from "timer";
import { bootCrashed, bootInstalled, openInstaller, type Installer } from "boot";
import { loadCatalog, openRead, type SdCatalog, type SdEntry } from "catalog";
import { cardSpace } from "card";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { builtForSmallFlash, fitsSlot } from "slot";
import { pollLink, setLinkBusy, type LinkEvent } from "link";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, navDir, sideDir } from "keys";
import { clampHelpIndex, helpList } from "help-ui";
import { menuStep } from "list";
import { asMenu } from "menu-view";
import { asHome, HOME_COLS, type HomeTile } from "view";
import { noteGlyph } from "ink";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import type { File } from "embedded:storage/files";

type Mode = "list" | "help" | "load" | "recv";

const PREF = "sd";
const PREF_LAST = "last";

function loadLast(): string {
	try {
		const v = Preference.get(PREF, PREF_LAST);
		return typeof v === "string" ? v : "";
	}
	catch {
		return "";
	}
}

function saveLast(id: string) {
	try {
		if (loadLast() !== id)
			Preference.set(PREF, PREF_LAST, id);
	}
	catch {
		/* */
	}
}

/** Grid move: ←/→ step one tile (wrapping), ↑/↓ step one row (clamped to the ends). */
function gridStep(index: number, count: number, dx: -1 | 0 | 1, dy: -1 | 0 | 1): number {
	if (count <= 0)
		return 0;
	if (dx !== 0)
		return menuStep(index, count, dx);
	if (dy === 0)
		return index;
	const n = index + dy * HOME_COLS;
	if (n < 0)
		return index === 0 ? count - 1 : 0;
	if (n >= count)
		return index === count - 1 ? 0 : count - 1;
	return n;
}

/** Lowercase a-z typed in this stroke, except the H/J/K/L movement keys. */
function jumpLetter(stroke: KeyStroke): string {
	for (let i = 0; i < stroke.chars.length; i++) {
		const c = stroke.chars[i].toLowerCase();
		if (c >= "a" && c <= "z" && c !== "h" && c !== "j" && c !== "k" && c !== "l")
			return c;
	}
	return "";
}

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

function entryId(entry: SdEntry): string {
	const path = entry.path;
	if (path.length > 4 && path.endsWith(".bin"))
		return path.slice(0, -4);
	return path;
}

function homeTiles(entries: SdEntry[]): HomeTile[] {
	const tiles: HomeTile[] = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		tiles.push({
			id: entryId(entry),
			label: entry.label,
			icon: entry.icon,
			big: entry.size > 0 && !fitsSlot(entry.size),
			bad: !!entry.error,
		});
	}
	return tiles;
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
	crashChecked = false;

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
		const note = this.power?.takeNote() ?? "";
		if (note) {
			this.note = note;
			this.paint(app);
		}
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
		const note = this.power?.takeNote() ?? "";
		if (note) {
			this.note = note;
			this.paint(content as AppHost);
		}
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
		const last = loadLast();
		if (last) {
			const entries = this.catalog.entries;
			for (let i = 0; i < entries.length; i++) {
				if (entryId(entries[i]) === last) {
					this.index = i;
					break;
				}
			}
		}
		this.scanning = false;
		if (!this.crashChecked) {
			this.crashChecked = true;
			try {
				if (bootCrashed())
					this.note = "上回没跑起来";
			}
			catch { /* */ }
		}
		this.paint(app);
		if (!this.rescan || this.mode === "load")
			return;
		this.rescan = false;
		this.startScan(app);
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (this.scanning)
			return;
		if (this.mode === "load") {
			if (isBack(stroke))
				this.cancelLoad(app);
			return;
		}
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
		// ← moves in the grid here, so only BS / Esc rescan.
		if (stroke.del || stroke.esc) {
			this.startScan(app);
			return;
		}
		const n = this.catalog.entries.length;
		const dx = sideDir(stroke);
		const dy = dx === 0 ? navDir(stroke) : 0;
		if (dx !== 0 || dy !== 0) {
			if (n > 0)
				this.select(app, gridStep(this.index, n, dx, dy));
			return;
		}
		if (isConfirm(stroke)) {
			this.confirm(app);
			return;
		}
		const letter = jumpLetter(stroke);
		if (letter && n > 0) {
			const entries = this.catalog.entries;
			for (let k = 1; k <= n; k++) {
				const i = (this.index + k) % n;
				if (entryId(entries[i]).toLowerCase().charAt(0) === letter) {
					this.select(app, i);
					return;
				}
			}
		}
	}

	select(app: AppHost, index: number) {
		this.mode = "list";
		this.note = "";
		this.index = index;
		this.paint(app);
	}

	/** BS while the bar fills. Too late once the last chunk is written. */
	cancelLoad(app: AppHost) {
		if (!this.installer || this.offset >= this.loadSize)
			return;
		setLinkBusy(false);
		try { this.installer.abort(); } catch { /* */ }
		this.installer = null;
		this.closeFile();
		this.mode = "list";
		this.note = "已取消";
		this.paint(app);
	}

	stepHelp(app: AppHost, dir: -1 | 1) {
		const next = clampHelpIndex(this.helpIndex + dir, helpFor().length);
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
		if (this.smallFlashImage(entry)) {
			this.note = "旧镜像需重编";
			this.paint(app);
			return;
		}
		saveLast(entryId(entry));
		this.tryInstalled(app, entry);
	}

	/** Built for the old 4MB table; see builtForSmallFlash. */
	smallFlashImage(entry: SdEntry): boolean {
		const root = this.catalog.root;
		if (!root || entry.size < 4)
			return false;
		let file: File | null = null;
		try {
			file = openRead(root, entry.path);
			const head = file.read(4, 0);
			file.close();
			file = null;
			return builtForSmallFlash(head);
		}
		catch {
			try { file?.close(); } catch { /* */ }
			return false; // let the load report the read error
		}
	}

	/** Same image already in the slot: boot it as is. Otherwise write it. */
	tryInstalled(app: AppHost, entry: SdEntry) {
		const root = this.catalog.root;
		if (!root || entry.size <= 32) {
			this.beginLoad(app, entry);
			return;
		}
		this.mode = "load";
		this.note = "启动";
		this.paint(app);
		// Yield so the label shows while the slot image is verified.
		Timer.set(() => {
			let file: File | null = null;
			try {
				file = openRead(root, entry.path);
				const tail = file.read(32, entry.size - 32);
				file.close();
				file = null;
				if (tail.byteLength === 32)
					bootInstalled(tail, entry.size); // never returns on a match
			}
			catch { /* fall back to writing */ }
			try { file?.close(); } catch { /* */ }
			this.mode = "list";
			this.beginLoad(app, entry);
		}, 30);
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
		if (this.mode !== "load")
			return; // cancelled while this chunk was queued
		const file = this.file;
		const installer = this.installer;
		if (!file || !installer) {
			this.failLoad(app, "载入失败");
			return;
		}
		if (this.offset >= this.loadSize) {
			this.shownPct = 100;
			this.note = "校验…";
			this.paint(app);
			Timer.set(() => this.finishLoad(app), 50);
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
		// Cap the bar at 99% until the last byte is in; 100% is easy to miss
		// because finish() verifies then reboots without returning.
		if (this.offset >= this.loadSize) {
			this.shownPct = 100;
			this.note = "校验…";
			this.paint(app);
			// Yield so the label reaches the screen before esp_ota_end blocks.
			Timer.set(() => this.finishLoad(app), 50);
			return;
		}
		const pct = Math.floor(this.offset * 100 / this.loadSize);
		const shown = pct >= 100 ? 99 : pct;
		if (shown !== this.shownPct) {
			this.shownPct = shown;
			this.note = "载入 " + shown + "%";
			this.paint(app);
		}
		Timer.set(() => this.loadChunk(app), 0);
	}

	finishLoad(app: AppHost) {
		const installer = this.installer;
		this.closeFile();
		this.installer = null;
		try {
			// Never returns on success: sets boot slot and esp_restart().
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

	showHome(app: AppHost, on: boolean) {
		setVisibleProp(contentByName(app, "homePort"), on);
		setVisibleProp(contentByName(app, "listPort"), !on);
	}

	paint(app: AppHost) {
		const listPort = contentByName(app, "listPort");
		const list = asMenu(listPort);
		const homePort = contentByName(app, "homePort");
		const home = asHome(homePort);
		if (!list || !home)
			return;
		if (this.mode === "recv") {
			this.showHome(app, false);
			let text = this.linkName || "cadv";
			if (text.length > ROW_CHARS)
				text = "..." + text.slice(text.length - (ROW_CHARS - 3));
			const recvTitle = this.note || "USB";
			const recvG = noteGlyph(recvTitle).kind ? noteGlyph(recvTitle) : { kind: "usb" as const, level: undefined };
			list.setList(listPort, recvTitle, [{ text, selected: true }], "", recvG.kind, recvG.level);
			return;
		}
		if (this.mode === "help") {
			this.showHome(app, false);
			const page = helpList(helpFor(), this, helpTitle());
			list.setList(listPort, page.title, page.lines, "");
			return;
		}
		const entries = this.catalog.entries;
		if (this.scanning) {
			this.showHome(app, false);
			list.setList(listPort, "扫描", [{ text: "读取目录", selected: false }], "");
			return;
		}
		if (this.catalog.error && entries.length === 0) {
			this.showHome(app, false);
			const lines = wrapText(this.catalog.error, ERROR_CHARS).map(text => ({ text, selected: false }));
			list.setList(listPort, "无卡", lines, "", "sd");
			return;
		}
		if (entries.length === 0) {
			this.showHome(app, false);
			list.setList(listPort, "cadv 空", [{ text: "没有固件", selected: false }], "", "bad");
			return;
		}
		if (this.index < 0 || this.index >= entries.length)
			this.index = 0;
		this.showHome(app, true);
		const head = this.heading();
		const fromNote = noteGlyph(this.note);
		const g = fromNote.kind
			? fromNote
			: (entries[this.index]?.error ? { kind: "bad" as const } : titleGlyph(this.power));
		home.setHome(homePort, head, homeTiles(entries), this.index, g.kind, g.level);
	}
}
