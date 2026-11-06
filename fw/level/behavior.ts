/*
	Spirit level. BMI270 gravity → flat bubble or edge tube.
	G zeros the current mode; R clears offsets. ? opens help.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir } from "keys";
import { MENU_VISIBLE } from "list";
import { asMenu } from "menu-view";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { imuError, openImu, type ImuHandle } from "imu";
import { asLevel, TOLERANCE, type LevelMode } from "view";

type Mode = "level" | "help";

const LOWPASS = 0.18;
const MODE_G = 0.65;
const MODE_HOLD_MS = 250;
const TICK_MS = 50;
const RAD2DEG = 180 / Math.PI;

type Calib = {
	pitch: number;
	roll: number;
	edgeY: number;
	edgeX: number;
};

function abs(n: number): number {
	return n < 0 ? -n : n;
}

export class AppBehavior extends Behavior {
	mode: Mode = "level";
	kb: CardputerKeyboard | null = null;
	imu: ImuHandle | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	tickTimer: ReturnType<typeof Timer.repeat> | null = null;
	helpIndex = 0;
	hostEnterDown = false;
	note = "";
	noteUntil = 0;
	gx = 0;
	gy = 0;
	gz = 1;
	primed = false;
	levelMode: LevelMode = "flat";
	candidate: LevelMode = "flat";
	candidateSince = 0;
	calib: Calib = { pitch: 0, roll: 0, edgeY: 0, edgeX: 0 };

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.note = "读取";
		this.paint(app);
		Timer.set(() => this.openSensor(app), 1);
	}

	openSensor(app: AppHost) {
		this.imu = openImu();
		if (!this.imu)
			this.note = imuError() || "无芯片";
		else
			this.note = "";
		this.tickTimer = Timer.repeat(() => this.onTick(app), TICK_MS);
		this.paint(app);
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

	onTick(app: AppHost) {
		if (this.note && this.noteUntil && Date.now() >= this.noteUntil)
			this.note = "";
		if (this.mode !== "level")
			return;
		this.readImu();
		this.updateMode();
		this.paint(app);
	}

	readImu() {
		const sample = this.imu?.sample();
		if (!sample)
			return;
		if (!this.primed) {
			this.gx = sample.x;
			this.gy = sample.y;
			this.gz = sample.z;
			this.primed = true;
			return;
		}
		this.gx += LOWPASS * (sample.x - this.gx);
		this.gy += LOWPASS * (sample.y - this.gy);
		this.gz += LOWPASS * (sample.z - this.gz);
	}

	detectMode(): LevelMode {
		const ax = abs(this.gx);
		const ay = abs(this.gy);
		const az = abs(this.gz);
		if (az > MODE_G && az >= ax && az >= ay)
			return "flat";
		if (ay > MODE_G && ay >= ax)
			return "edgeY";
		if (ax > MODE_G)
			return "edgeX";
		return this.levelMode;
	}

	updateMode() {
		const detected = this.detectMode();
		if (detected === this.levelMode) {
			this.candidate = this.levelMode;
			return;
		}
		const now = Date.now();
		if (detected !== this.candidate) {
			this.candidate = detected;
			this.candidateSince = now;
		}
		else if (now - this.candidateSince >= MODE_HOLD_MS) {
			this.levelMode = this.candidate;
		}
	}

	pitchDeg(): number {
		return Math.atan2(this.gy, Math.sqrt(this.gx * this.gx + this.gz * this.gz)) * RAD2DEG - this.calib.pitch;
	}

	rollDeg(): number {
		return Math.atan2(this.gx, Math.sqrt(this.gy * this.gy + this.gz * this.gz)) * RAD2DEG - this.calib.roll;
	}

	edgeYDeg(): number {
		return Math.atan2(this.gx, abs(this.gy)) * RAD2DEG - this.calib.edgeY;
	}

	edgeXDeg(): number {
		return Math.atan2(this.gy, abs(this.gx)) * RAD2DEG - this.calib.edgeX;
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (isLauncher(stroke)) {
			bootLauncher();
			return;
		}
		if (isHelp(stroke) && this.mode !== "help") {
			this.enterHelp(app);
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke)) {
				this.mode = "level";
				this.showLevel(app);
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
			if (ch === "g" || ch === "G") {
				this.calibrate(app);
				return;
			}
			if (ch === "r" || ch === "R") {
				this.resetCalib(app);
				return;
			}
		}
	}

	calibrate(app: AppHost) {
		if (!this.imu) {
			this.flash(app, "无 IMU");
			return;
		}
		if (this.levelMode === "flat") {
			this.calib.pitch += this.pitchDeg();
			this.calib.roll += this.rollDeg();
		}
		else if (this.levelMode === "edgeY") {
			this.calib.edgeY += this.edgeYDeg();
		}
		else {
			this.calib.edgeX += this.edgeXDeg();
		}
		this.flash(app, "已置零");
	}

	resetCalib(app: AppHost) {
		this.calib = { pitch: 0, roll: 0, edgeY: 0, edgeX: 0 };
		this.flash(app, "已清除");
	}

	flash(app: AppHost, text: string) {
		this.note = text;
		this.noteUntil = Date.now() + 900;
		this.paint(app);
	}

	enterHelp(app: AppHost) {
		this.helpIndex = 0;
		this.mode = "help";
		this.showHelp(app);
		this.paint(app);
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

	showLevel(app: AppHost) {
		const level = contentByName(app, "levelPort");
		const list = contentByName(app, "listPort");
		setVisibleProp(level, true);
		setVisibleProp(list, false);
	}

	showHelp(app: AppHost) {
		const level = contentByName(app, "levelPort");
		const list = contentByName(app, "listPort");
		setVisibleProp(level, false);
		setVisibleProp(list, true);
	}

	paint(app: AppHost) {
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
		const port = contentByName(app, "levelPort");
		const view = asLevel(port);
		if (!view)
			return;
		if (!this.imu) {
			view.setFrame(port, {
				mode: "none",
				pitch: 0,
				roll: 0,
				edge: 0,
				level: false,
				note: this.note || "无芯片",
			});
			return;
		}
		const pitch = this.pitchDeg();
		const roll = this.rollDeg();
		const edge = this.levelMode === "edgeY" ? this.edgeYDeg() : this.edgeXDeg();
		let level = false;
		if (this.levelMode === "flat")
			level = abs(pitch) < TOLERANCE && abs(roll) < TOLERANCE;
		else
			level = abs(edge) < TOLERANCE;
		view.setFrame(port, {
			mode: this.levelMode,
			pitch,
			roll,
			edge,
			level,
			note: this.note,
		});
	}
}
