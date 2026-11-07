/*
	Device info. K/J scrolls. Readings that move (heap, uptime, temperature,
	battery) refresh every second. R reads again immediately.
*/

import {} from "piu/MC";
import Timer from "timer";
import { readBoard } from "board";
import { cardSpace } from "card";
import { openImu, type ImuHandle } from "imu";
import { openMic, type MicFeed } from "mic";
import { Power } from "power";
import { acceptStroke, titleWithPower } from "session";
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

function countPair(free: number, total: number): string {
	const one = (n: number) => {
		if (n >= 1024 * 1024)
			return (n / (1024 * 1024)).toFixed(1) + "MB";
		return Math.round(n / 1024) + "KB";
	};
	return one(free) + "/" + one(total);
}

function axisText(x: number, y: number, z: number): string {
	return x.toFixed(1) + " " + y.toFixed(1) + " " + z.toFixed(1);
}

function errorText(e: unknown): string {
	if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string")
		return (e as { message: string }).message;
	return "读取失败";
}

export class AppBehavior extends Behavior {
	mode: Mode = "info";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	imu: ImuHandle | null = null;
	mic: MicFeed | null = null;
	sdFree = -1;
	sdTotal = -1;
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
		this.power = new Power("blank");
		this.reload(false);
		this.imu = openImu();
		this.kb = new CardputerKeyboard();
		this.mic = openMic();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.tickTimer = Timer.repeat(() => this.onSecond(app), 1000);
		this.paint(app);
	}

	reload(mark: boolean) {
		try {
			this.snap = readBoard();
			const space = cardSpace();
			this.sdFree = space ? space.free : -1;
			this.sdTotal = space ? space.total : -1;
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
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const note = this.power?.takeNote() ?? "";
		if (note) {
			this.note = note;
			this.noteUntil = Date.now() + 700;
			this.paint(app);
		}
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
		const app = content as AppHost;
		const use = this.power ? acceptStroke(this.power, stroke, true) : stroke;
		const note = this.power?.takeNote() ?? "";
		if (note) {
			this.note = note;
			this.noteUntil = Date.now() + 700;
			this.paint(app);
		}
		if (use)
			this.handleStroke(app, use);
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

	sdText(): string {
		if (this.sdTotal <= 0)
			return "无";
		return countPair(this.sdFree, this.sdTotal);
	}

	rows() {
		if (!this.snap)
			return [{ label: "读取", value: this.error || "失败" }];
		const rows = infoRows(this.snap);
		rows.push({ label: "SD", value: this.sdText() });
		rows.push({ label: "麦克", value: this.mic ? this.mic.peak() + "%" : "无" });
		const sample = this.imu?.sample();
		rows.push({ label: "加速度", value: sample ? axisText(sample.x, sample.y, sample.z) : "无" });
		rows.push({ label: "角速度", value: sample ? axisText(sample.gx, sample.gy, sample.gz) : "无" });
		rows.push({ label: "亮度", value: this.power ? String(this.power.step()) : "无" });
		return rows;
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
		const title = this.power ? titleWithPower(this.power, this.note || `设备信息 ${start + 1}/${n}`) : (this.note || `设备信息 ${start + 1}/${n}`);
		view.setRows(port, title, lines);
	}
}
