/*
	Lists every file on the card. Enter reads the selected file in chunks.
*/

import {} from "piu/MC";
import Timer from "timer";
import { READ_MAX, loadCatalog, readFile, type SdCatalog, type SdEntry } from "catalog";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, navDir } from "keys";
import { MENU_VISIBLE, menuStep } from "list";
import { asMenu } from "menu-view";
import { contentByName, type AppHost } from "ui";

type Mode = "list" | "help";

const ROW_CHARS = 18;
const ERROR_CHARS = 16;

function formatCount(n: number): string {
	if (n < 1024)
		return n + "B";
	if (n < 1024 * 1024)
		return Math.floor(n / 1024) + "K";
	return Math.floor(n / (1024 * 1024)) + "M";
}

function rowText(entry: SdEntry): string {
	let text = entry.directory ? entry.path + "/" : entry.path;
	if (entry.error)
		text = "!" + text;
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
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	catalog: SdCatalog = { root: null, error: "", entries: [], truncated: false };
	index = 0;
	helpIndex = 0;
	note = "";
	scanning = false;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.startScan(app);
	}

	onKeyboardTick(app: AppHost) {
		const stroke = this.kb?.poll();
		if (stroke)
			this.handleStroke(app, stroke);
	}

	onKeyDown(content: unknown, key: string) {
		if (key === "\r" || key === "\n") {
			if (this.hostEnterDown)
				return;
			this.hostEnterDown = true;
		}
		const stroke = hostStroke(key);
		if (stroke)
			this.handleStroke(content as AppHost, stroke);
	}

	onKeyUp(_content: unknown, key: string) {
		if (key === "\r" || key === "\n")
			this.hostEnterDown = false;
	}

	startScan(app: AppHost) {
		if (this.scanning)
			return;
		this.scanning = true;
		this.note = "";
		this.mode = "list";
		this.paint(app);
		Timer.set(() => this.finishScan(app), 0);
	}

	finishScan(app: AppHost) {
		this.catalog = loadCatalog();
		this.index = 0;
		this.scanning = false;
		this.paint(app);
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (this.scanning)
			return;
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
			this.startScan(app);
			return;
		}
		const dir = navDir(stroke);
		if (dir !== 0) {
			const n = this.catalog.entries.length;
			if (n > 0) {
				this.note = "";
				this.index = menuStep(this.index, n, dir);
				this.paint(app);
			}
			return;
		}
		if (isConfirm(stroke))
			this.readSelected(app);
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

	readSelected(app: AppHost) {
		const entry = this.catalog.entries[this.index];
		const root = this.catalog.root;
		if (!entry || !root)
			return;
		if (entry.directory) {
			this.note = "目录";
			this.paint(app);
			return;
		}
		try {
			const got = readFile(root, entry.path, READ_MAX);
			entry.size = got.size;
			entry.error = "";
			if (got.read === got.size)
				this.note = "已读 " + formatCount(got.read);
			else
				this.note = "已读 " + formatCount(got.read) + "/" + formatCount(got.size);
		}
		catch (e) {
			const message = e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
				? (e as { message: string }).message
				: "读失败";
			entry.error = message;
			this.note = message.length > ERROR_CHARS ? message.slice(0, ERROR_CHARS) : message;
		}
		this.paint(app);
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
			return "空卡";
		if (this.index < 0 || this.index >= n)
			this.index = 0;
		const entry = entries[this.index];
		const pos = (this.index + 1) + "/" + n + (this.catalog.truncated ? "+" : "");
		if (entry.directory)
			return pos + " 目录";
		if (entry.error)
			return pos + " 失败";
		return pos + " " + formatCount(entry.size);
	}

	paint(app: AppHost) {
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (!view)
			return;
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
				const text = page[start + i];
				if (text)
					lines.push({ text, selected: false });
			}
			view.setList(port, `${helpTitle()} ${start + 1}/${n}`, lines, "");
			return;
		}
		const entries = this.catalog.entries;
		if (this.scanning) {
			view.setList(port, "扫描", [{ text: "扫描", selected: false }], "");
			return;
		}
		if (this.catalog.error && entries.length === 0) {
			const lines = wrapText(this.catalog.error, ERROR_CHARS).map(text => ({ text, selected: false }));
			view.setList(port, "无卡", lines, "");
			return;
		}
		if (entries.length === 0) {
			view.setList(port, "空卡", [{ text: "空卡", selected: false }], "");
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
