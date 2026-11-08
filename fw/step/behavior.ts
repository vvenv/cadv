/*
	BMI270 hardware step counter. The chip count resets on power-up,
	so the day total is the saved count plus the new raw delta.
*/

import {} from "piu/MC";
import Timer from "timer";
import Preference from "preference";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir } from "keys";
import { asMenu } from "menu-view";
import { imuError, openImu, type ImuHandle } from "imu";
import { Power } from "power";
import { acceptStroke, titleWithPower } from "session";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asStep } from "view";

const PREF = "step";

type Mode = "step" | "help";

function today(): string {
	const t = new Date();
	const m = t.getMonth() + 1;
	const d = t.getDate();
	return t.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (d < 10 ? "0" + d : d);
}

function readNum(name: string, fallback: number): number {
	try {
		const v = Preference.get(PREF, name);
		if (typeof v === "number" && v === v)
			return v;
		if (typeof v === "string") {
			const n = parseInt(v, 10);
			if (n === n)
				return n;
		}
	}
	catch {
		/* */
	}
	return fallback;
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
	hostEnterDown = false;

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
		this.saved = storedDay === this.day ? readNum("count", 0) : 0;
		this.steps = this.saved;
		this.stride = readNum("stride", 70);
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
		try {
			Preference.set(PREF, "day", this.day);
			Preference.set(PREF, "count", this.steps);
			Preference.set(PREF, "stride", this.stride);
		}
		catch {
			/* */
		}
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (isLauncher(stroke)) {
			bootLauncher();
			return;
		}
		if (isHelp(stroke) && this.mode !== "help") {
			this.mode = "help";
			this.paint(app);
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke))
				this.mode = "step";
			this.paint(app);
			return;
		}
		const dir = navDir(stroke);
		if (dir !== 0) {
			this.stride = Math.max(30, Math.min(120, this.stride + dir * 5));
			try { Preference.set(PREF, "stride", this.stride); } catch { /* */ }
		}
		if (stroke.chars.some(ch => ch === "r" || ch === "R")) {
			this.saved = 0;
			this.base = this.imu?.sample()?.steps ?? 0;
			this.steps = 0;
			try {
				Preference.set(PREF, "count", 0);
				Preference.set(PREF, "day", this.day);
			}
			catch {
				/* */
			}
		}
		this.paint(app);
	}

	paint(app: AppHost) {
		const list = contentByName(app, "listPort");
		const face = contentByName(app, "facePort");
		if (this.mode === "help") {
			setVisibleProp(face, false);
			setVisibleProp(list, true);
			const view = asMenu(list);
			if (view)
				view.setList(list, helpTitle(), helpFor().map(row => ({ text: row.key, right: row.action, selected: false })), "");
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(face, true);
		const view = asStep(face);
		if (!view)
			return;
		const meters = Math.round(this.steps * this.stride / 100);
		const title = this.power ? titleWithPower(this.power, this.note || this.day) : (this.note || this.day);
		view.setStep(face, title, this.steps, meters, this.stride);
	}
}
