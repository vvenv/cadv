/*
	Manual tally or listen-for-sound tally.
	Speaker and mic share I2S1, so listen mode closes the click tones.
*/

import {} from "piu/MC";
import Timer from "timer";
import Preference from "preference";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir, volumeDelta } from "keys";
import { MENU_VISIBLE } from "list";
import { asMenu } from "menu-view";
import { micFault, openMic, type MicFeed } from "mic";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { ClockSound, releaseMic } from "sound";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asCount, type Sense } from "view";

const PREF = "count";
const STEPS = Object.freeze([1, 2, 5, 10, 20, 50, 100]);
const COUNT_MAX = 999999;
const LOUD_ON = 42;
const LOUD_OFF = 28;
const HIT_GAP_MS = 280;

type Mode = "run" | "pick" | "help";

const SENSE_ROWS = Object.freeze([
	{ id: "hand" as Sense, text: "手动", right: "按键", glyph: "caps" as const },
	{ id: "ear" as Sense, text: "听响声", right: "麦克", glyph: "rec" as const },
], true);

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

function readSense(): Sense {
	try {
		const v = Preference.get(PREF, "sense");
		if (v === "ear" || v === 1 || v === "1")
			return "ear";
	}
	catch {
		/* */
	}
	return "hand";
}

function clampCount(n: number): number {
	if (n < 0)
		return 0;
	if (n > COUNT_MAX)
		return COUNT_MAX;
	return n | 0;
}

function nearestStep(n: number): number {
	let best = STEPS[0];
	let dist = Math.abs(n - best);
	for (let i = 1; i < STEPS.length; i++) {
		const d = Math.abs(n - STEPS[i]);
		if (d < dist) {
			best = STEPS[i];
			dist = d;
		}
	}
	return best;
}

export class AppBehavior extends Behavior {
	mode: Mode = "run";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	sound: ClockSound | null = null;
	mic: MicFeed | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	flashTimer: ReturnType<typeof Timer.set> | null = null;
	count = 0;
	step = 1;
	volume = VOL_DEFAULT;
	flash = 0;
	sense: Sense = "hand";
	armed = false;
	peak = 0;
	loud = false;
	lastHit = 0;
	pickIndex = 0;
	helpIndex = 0;
	note = "";
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.count = clampCount(readNum("value", 0));
		this.step = nearestStep(readNum("step", 1));
		this.volume = Math.max(VOL_MIN, Math.min(VOL_MAX, readNum("volume", VOL_DEFAULT)));
		this.sense = readSense();
		this.power = new Power("blank");
		this.applySense(app, false);
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.paint(app);
	}

	applySense(app: AppHost, armDefault: boolean) {
		this.closeMic();
		this.closeSound();
		this.armed = false;
		this.peak = 0;
		this.loud = false;
		this.note = "";
		if (this.sense === "ear") {
			this.mic = openMic();
			if (!this.mic)
				this.note = micFault() || "无麦克风";
			this.armed = armDefault && !!this.mic;
			if (this.armed)
				this.loud = (this.mic?.peak() ?? 0) >= LOUD_OFF;
		}
		else {
			releaseMic();
			this.sound = new ClockSound();
			this.sound.setVolume(this.volume);
		}
		this.paint(app);
	}

	closeMic() {
		try { this.mic?.close(); } catch { /* */ }
		this.mic = null;
	}

	closeSound() {
		try { this.sound?.close(); } catch { /* */ }
		this.sound = null;
	}

	onKeyboardTick(app: AppHost) {
		if (this.mode === "run" && this.sense === "ear" && this.armed)
			this.pollEar(app);
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		if (stroke)
			this.handleStroke(app, stroke);
		else if (this.mode === "run" && this.sense === "ear")
			this.paint(app);
	}

	pollEar(app: AppHost) {
		const peak = this.mic?.peak() ?? 0;
		this.peak = peak;
		if (this.loud) {
			if (peak < LOUD_OFF)
				this.loud = false;
			return;
		}
		if (peak < LOUD_ON)
			return;
		this.loud = true;
		const now = Date.now();
		if (now - this.lastHit < HIT_GAP_MS)
			return;
		this.lastHit = now;
		this.add(app, this.step, true);
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

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (isLauncher(stroke)) {
			this.closeMic();
			this.closeSound();
			bootLauncher();
			return;
		}
		if (isHelp(stroke) && this.mode !== "help") {
			this.helpIndex = 0;
			this.mode = "help";
			this.paint(app);
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke)) {
				this.mode = "run";
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.helpIndex += dir;
			this.paint(app);
			return;
		}
		if (this.mode === "pick") {
			if (isBack(stroke)) {
				this.mode = "run";
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0) {
				this.pickIndex = Math.max(0, Math.min(SENSE_ROWS.length - 1, this.pickIndex + dir));
				this.paint(app);
				return;
			}
			if (isConfirm(stroke)) {
				const next = SENSE_ROWS[this.pickIndex]?.id ?? "hand";
				this.mode = "run";
				if (next !== this.sense) {
					this.sense = next;
					this.save();
					this.applySense(app, next === "ear");
				}
				else
					this.paint(app);
				return;
			}
			this.paint(app);
			return;
		}

		for (const ch of stroke.chars) {
			if (ch === "m" || ch === "M") {
				this.pickIndex = this.sense === "ear" ? 1 : 0;
				this.mode = "pick";
				this.paint(app);
				return;
			}
		}

		const vol = volumeDelta(stroke.chars);
		if (vol !== 0) {
			this.volume = Math.max(VOL_MIN, Math.min(VOL_MAX, this.volume + vol));
			this.sound?.setVolume(this.volume);
			this.save();
			this.paint(app);
			return;
		}

		if (isConfirm(stroke)) {
			if (this.sense === "ear") {
				if (!this.mic) {
					this.note = micFault() || "无麦克风";
					this.paint(app);
					return;
				}
				this.armed = !this.armed;
				this.loud = this.armed && (this.mic.peak() >= LOUD_OFF);
				this.peak = this.mic.peak();
				this.note = "";
				this.paint(app);
				return;
			}
			this.add(app, this.step, false);
			return;
		}
		if (isBack(stroke)) {
			this.add(app, -this.step, this.sense === "ear");
			return;
		}

		const dir = navDir(stroke);
		if (dir !== 0) {
			const at = STEPS.indexOf(this.step);
			const next = at < 0 ? 0 : Math.max(0, Math.min(STEPS.length - 1, at - dir));
			this.step = STEPS[next];
			this.save();
			this.paint(app);
			return;
		}

		for (const ch of stroke.chars) {
			if (ch === "r" || ch === "R") {
				this.count = 0;
				this.pulse(app, 2);
				if (this.sense === "hand")
					this.sound?.play([{ hz: 660, ms: 36 }]);
				this.save();
				this.paint(app);
				return;
			}
		}
		this.paint(app);
	}

	add(app: AppHost, delta: number, silent: boolean) {
		const next = clampCount(this.count + delta);
		if (next === this.count && delta !== 0) {
			if (!silent)
				this.sound?.play([{ hz: 220, ms: 28 }]);
			this.paint(app);
			return;
		}
		this.count = next;
		this.pulse(app, delta > 0 ? 1 : delta < 0 ? -1 : 0);
		if (!silent) {
			if (delta > 0)
				this.sound?.play([{ hz: 1320, ms: 22 }]);
			else if (delta < 0)
				this.sound?.play([{ hz: 880, ms: 22 }]);
		}
		this.save();
		this.paint(app);
	}

	pulse(app: AppHost, flash: number) {
		this.flash = flash;
		if (this.flashTimer)
			Timer.clear(this.flashTimer);
		this.flashTimer = Timer.set(() => {
			this.flashTimer = null;
			this.flash = 0;
			this.paint(app);
		}, 120);
	}

	save() {
		try {
			Preference.set(PREF, "value", this.count);
			Preference.set(PREF, "step", this.step);
			Preference.set(PREF, "volume", this.volume);
			Preference.set(PREF, "sense", this.sense);
		}
		catch {
			/* */
		}
	}

	paint(app: AppHost) {
		const list = contentByName(app, "listPort");
		const face = contentByName(app, "facePort");
		if (this.mode === "help" || this.mode === "pick") {
			setVisibleProp(face, false);
			setVisibleProp(list, true);
			const view = asMenu(list);
			if (!view)
				return;
			if (this.mode === "help") {
				view.setList(list, helpTitle(), helpPage(helpFor(), this), "");
				return;
			}
			const lines = [];
			for (let i = 0; i < SENSE_ROWS.length; i++) {
				const row = SENSE_ROWS[i];
				lines.push({
					text: row.text,
					right: row.right,
					selected: i === this.pickIndex,
					glyph: row.glyph,
				});
			}
			const g = titleGlyph(this.power);
			view.setList(list, "模式", lines, "", g.kind, g.level === undefined ? 0 : g.level);
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(face, true);
		const view = asCount(face);
		if (!view)
			return;
		const title = this.sense === "ear" ? "听声" : "计数";
		const status =
			this.flash > 0 && this.flash !== 2
				? { kind: "ok" as const }
				: this.flash < 0
					? { kind: "miss" as const }
					: this.flash === 2
						? { kind: "retry" as const }
						: this.note
							? this.note
							: this.sense === "ear"
								? (this.armed ? { kind: "rec" as const } : { kind: "pause" as const })
								: "";
		const g = titleGlyph(this.power, status);
		const stepIndex = STEPS.indexOf(this.step);
		if (this.sense === "ear" && this.mic && !this.armed)
			this.peak = this.mic.peak();
		view.setRun(
			face,
			title,
			this.count,
			this.step,
			stepIndex < 0 ? 0 : stepIndex,
			STEPS.length,
			this.volume,
			this.flash,
			g.kind,
			g.level === undefined ? 0 : g.level,
			this.sense,
			this.armed,
			this.peak,
		);
	}
}

function helpPage(rows: readonly { key: string; action: string }[], host: { helpIndex: number }) {
	const n = rows.length;
	const vis = MENU_VISIBLE;
	let start = host.helpIndex;
	const max = n > vis ? n - vis : 0;
	if (start < 0)
		start = 0;
	if (start > max)
		start = max;
	host.helpIndex = start;
	const lines = [];
	for (let i = 0; i < vis; i++) {
		const row = rows[start + i];
		if (row)
			lines.push({ text: row.key, right: row.action, selected: false });
	}
	return lines;
}
