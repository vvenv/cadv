/*
	BMI270 hardware step counter. The chip count resets on power-up,
	so the day total is the saved count plus the new raw delta.
*/

import {} from "piu/MC";
import Timer from "timer";
import Preference from "preference";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { helpList } from "help-ui";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir } from "keys";
import { asMenu } from "menu-view";
import { imuError, openImu, type ImuHandle } from "imu";
import { pref } from "pref";
import { Power } from "power";
import { acceptStroke } from "session";
import { asSevenSeg } from "sevenseg";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asStepFooter, asStepTop } from "view";

const PREF = "step";
const store = pref(PREF);
/* Walking changes the count every sample; NVS gets it at most this often. */
const STEP_SAVE_MS = 30_000;

type Mode = "step" | "help";

function today(): string {
	const t = new Date();
	const m = t.getMonth() + 1;
	const d = t.getDate();
	return t.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (d < 10 ? "0" + d : d);
}

export class AppBehavior extends Behavior {
	mode: Mode = "step";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	imu: ImuHandle | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	day = "";
	saved = 0;
	base = -1;
	steps = 0;
	stride = 70;
	note = "";
	/** First R arms, second R clears today. */
	resetArmed = false;
	helpIndex = 0;
	hostEnterDown = false;
	lastSaveMs = 0;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.power = new Power("blank");
		this.day = today();
		const storedDay = (() => {
			try {
				const v = Preference.get(PREF, "day");
				return typeof v === "string" ? v : "";
			}
			catch {
				return "";
			}
		})();
		this.saved = storedDay === this.day ? store.getNum("count", 0) : 0;
		this.steps = this.saved;
		this.stride = store.getNum("stride", 70);
		if (this.stride < 30)
			this.stride = 30;
		if (this.stride > 120)
			this.stride = 120;
		this.note = "读取";
		this.paint(app);
		/* Open the IMU before the keyboard so the BMI270 is the first device on the shared bus. */
		Timer.set(() => this.openSensor(app), 1);
	}

	openSensor(app: AppHost) {
		this.imu = openImu();
		if (!this.imu)
			this.note = imuError() || "无芯片";
		else if (!this.imu.pedometer)
			this.note = "计步器没开";
		else
			this.note = "";
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 200);
		this.paint(app);
	}

	onKeyboardTick(app: AppHost) {
		this.sample();
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(app);
		if (stroke)
			this.handleStroke(app, stroke);
		else
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
		if (note)
			this.paint(content as AppHost);
		if (use)
			this.handleStroke(content as AppHost, use);
	}

	onKeyUp(_content: unknown, key: string) {
		if (key === "\r" || key === "\n")
			this.hostEnterDown = false;
	}

	sample() {
		const now = today();
		if (now !== this.day) {
			this.day = now;
			this.saved = 0;
			this.base = -1;
			this.steps = 0;
			this.saveSteps(true);
		}
		const raw = this.imu?.sample()?.steps;
		if (typeof raw !== "number")
			return;
		if (this.base < 0 || raw < this.base)
			this.base = raw;
		const next = this.saved + (raw - this.base);
		if (next === this.steps)
			return;
		this.steps = next;
		this.saveSteps(false);
	}

	/** Day + count. Throttled unless forced (day change, reset, leaving). */
	saveSteps(force: boolean) {
		const now = Date.now();
		if (!force && now - this.lastSaveMs < STEP_SAVE_MS)
			return;
		this.lastSaveMs = now;
		try {
			store.set("day", this.day);
			store.set("count", this.steps);
		}
		catch {
			/* */
		}
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (isLauncher(stroke)) {
			this.saveSteps(true);
			bootLauncher();
			return;
		}
		const wantsReset = stroke.chars.some(ch => ch === "r" || ch === "R");
		if (!wantsReset)
			this.resetArmed = false;
		if (isHelp(stroke) && this.mode !== "help") {
			this.helpIndex = 0;
			this.mode = "help";
			this.paint(app);
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke))
				this.mode = "step";
			else {
				const dir = navDir(stroke);
				if (dir !== 0)
					this.helpIndex += dir;
			}
			this.paint(app);
			return;
		}
		const dir = navDir(stroke);
		if (dir !== 0) {
			this.stride = Math.max(30, Math.min(120, this.stride + dir * 5));
			try { store.set("stride", this.stride); } catch { /* */ }
		}
		if (wantsReset && !this.resetArmed)
			this.resetArmed = true;
		else if (wantsReset) {
			this.resetArmed = false;
			this.saved = 0;
			this.base = this.imu?.sample()?.steps ?? 0;
			this.steps = 0;
			this.saveSteps(true);
		}
		this.paint(app);
	}

	paint(app: AppHost) {
		const list = contentByName(app, "listPort");
		const titlePort = contentByName(app, "titlePort");
		const face = contentByName(app, "facePort");
		const footer = contentByName(app, "footerPort");
		if (this.mode === "help") {
			setVisibleProp(titlePort, false);
			setVisibleProp(face, false);
			setVisibleProp(footer, false);
			setVisibleProp(list, true);
			const view = asMenu(list);
			if (view) {
				const page = helpList(helpFor(), this, helpTitle());
				view.setList(list, page.title, page.lines, "");
			}
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(titlePort, true);
		setVisibleProp(face, true);
		setVisibleProp(footer, true);
		const meters = Math.round(this.steps * this.stride / 100);
		const heading = this.resetArmed ? "再按R清零" : (this.note || this.day);
		const top = asStepTop(titlePort);
		if (top)
			top.setTop(titlePort, heading);
		const seg = asSevenSeg(face);
		if (seg)
			seg.setFace(face, String(this.steps < 0 ? 0 : this.steps), true);
		const foot = asStepFooter(footer);
		if (foot)
			foot.setFooter(footer, meters, this.stride);
	}
}
