/*
	Device info. K/J scrolls. Readings that move (heap, uptime, temperature,
	battery) refresh every second. R reads again immediately.
*/

import {} from "piu/MC";
import Timer from "timer";
import { readBoard } from "board";
import { bootLauncher } from "boot";
import { infoRows, type BoardSnap } from "format";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir } from "keys";
import { MENU_VISIBLE } from "list";
import { asMenu } from "menu-view";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asInfo } from "view";

type Mode = "info" | "help";

function errorText(e: unknown): string {
	if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string")
		return (e as { message: string }).message;
	return "读取失败";
}

export class AppBehavior extends Behavior {
	mode: Mode = "info";
	kb: CardputerKeyboard | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	tickTimer: ReturnType<typeof Timer.repeat> | null = null;
	snap: BoardSnap | null = null;
	error = "";
	rowIndex = 0;
	helpIndex = 0;
	note = "";
	noteUntil = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.reload(false);
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.tickTimer = Timer.repeat(() => this.onSecond(app), 1000);
		this.paint(app);
	}

	reload(mark: boolean) {
		try {
			this.snap = readBoard();
			this.error = "";
			if (mark) {
				this.note = "已刷新";
				this.noteUntil = Date.now() + 700;
			}
		}
		catch (e) {
			this.error = errorText(e);
			if (mark) {
				this.note = "失败";
				this.noteUntil = Date.now() + 700;
			}
		}
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

	onSecond(app: AppHost) {
		if (this.note && this.noteUntil && Date.now() >= this.noteUntil)
			this.note = "";
		this.reload(false);
		if (this.mode === "info")
			this.paint(app);
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (isLauncher(stroke)) {
			bootLauncher();
			return;
		}
		if (isHelp(stroke) && this.mode !== "help") {
			this.helpIndex = 0;
			this.mode = "help";
			this.showHelp(app);
			this.paint(app);
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke)) {
				this.mode = "info";
				this.showInfo(app);
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.stepHelp(app, dir);
			return;
		}
		for (let i = 0; i < stroke.chars.length; i++) {
			const ch = stroke.chars[i];
			if (ch === "r" || ch === "R") {
				this.reload(true);
				this.paint(app);
				return;
			}
		}
		const dir = navDir(stroke);
		if (dir !== 0)
			this.stepRows(app, dir);
	}

	stepRows(app: AppHost, dir: -1 | 1) {
		const n = this.rows().length;
		const max = n > MENU_VISIBLE ? n - MENU_VISIBLE : 0;
		let next = this.rowIndex + dir;
		if (next < 0)
			next = 0;
		if (next > max)
			next = max;
		if (next === this.rowIndex)
			return;
		this.rowIndex = next;
		this.paint(app);
	}

	stepHelp(app: AppHost, dir: -1 | 1) {
		const n = helpFor().length;
		const max = n > MENU_VISIBLE ? n - MENU_VISIBLE : 0;
		let next = this.helpIndex + dir;
		if (next < 0)
			next = 0;
		if (next > max)
			next = max;
		if (next === this.helpIndex)
			return;
		this.helpIndex = next;
		this.paint(app);
	}

	rows() {
		if (!this.snap)
			return [{ label: "读取", value: this.error || "失败" }];
		return infoRows(this.snap);
	}

	showInfo(app: AppHost) {
		setVisibleProp(contentByName(app, "infoPort"), true);
		setVisibleProp(contentByName(app, "listPort"), false);
	}

	showHelp(app: AppHost) {
		setVisibleProp(contentByName(app, "infoPort"), false);
		setVisibleProp(contentByName(app, "listPort"), true);
	}

	paint(app: AppHost) {
		if (this.note && this.noteUntil && Date.now() >= this.noteUntil)
			this.note = "";
		if (this.mode === "help") {
			const port = contentByName(app, "listPort");
			const view = asMenu(port);
			if (!view)
				return;
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
			view.setList(port, `${helpTitle()} ${start + 1}/${n}`, lines, "");
			return;
		}
		const port = contentByName(app, "infoPort");
		const view = asInfo(port);
		if (!view)
			return;
		const page = this.rows();
		const n = page.length;
		const vis = MENU_VISIBLE;
		let start = this.rowIndex;
		const max = n > vis ? n - vis : 0;
		if (start < 0)
			start = 0;
		if (start > max)
			start = max;
		this.rowIndex = start;
		const lines = [];
		for (let i = 0; i < vis && start + i < n; i++)
			lines.push(page[start + i]);
		const title = this.note || `设备信息 ${start + 1}/${n}`;
		view.setRows(port, title, lines);
	}
}
