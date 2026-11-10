/*
	Manual tally or listen-for-sound tally.
	Speaker and mic share I2S1, so listen mode closes the click tones.
*/

import {} from "piu/MC";
import Timer from "timer";
import Preference from "preference";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { helpList } from "help-ui";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir, volumeDelta } from "keys";
import { asMenu } from "menu-view";
import { micFault, openMic, type MicFeed } from "mic";
import { pref } from "pref";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { ClockSound, releaseMic } from "sound";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { asSevenSeg } from "sevenseg";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asCountFooter, asCountTop, type Gain, type Sense } from "view";

const PREF = "count";
const store = pref(PREF);
const STEPS = Object.freeze([1, 2, 5, 10, 20, 50, 100]);
const COUNT_MAX = 999999;
/** Hit when peak clearly rises above a slow ambient floor. */
const FLOOR_ALPHA = 0.06;
const HIT_GAP_MS = 280;

type Mode = "run" | "pick" | "help";

type GainTune = { id: Gain; rise: number; mult: number; minOn: number };

const GAINS = Object.freeze([
	{ id: "high" as Gain, rise: 5, mult: 1.5, minOn: 3 },
	{ id: "mid" as Gain, rise: 8, mult: 1.8, minOn: 5 },
	{ id: "low" as Gain, rise: 14, mult: 2.5, minOn: 12 },
], true);

const PICK_ROWS = Object.freeze([
	{ sense: "hand" as Sense, gain: "mid" as Gain, text: "手动", right: "按键", glyph: "caps" as const },
	{ sense: "ear" as Sense, gain: "high" as Gain, text: "听响 · 高", right: "灵敏", glyph: "rec" as const },
	{ sense: "ear" as Sense, gain: "mid" as Gain, text: "听响 · 中", right: "灵敏", glyph: "rec" as const },
	{ sense: "ear" as Sense, gain: "low" as Gain, text: "听响 · 低", right: "灵敏", glyph: "rec" as const },
], true);

function tuneFor(gain: Gain): GainTune {
	for (let i = 0; i < GAINS.length; i++) {
		if (GAINS[i].id === gain)
			return GAINS[i];
	}
	return GAINS[1];
}

function pickIndexFor(sense: Sense, gain: Gain): number {
	if (sense !== "ear")
		return 0;
	for (let i = 1; i < PICK_ROWS.length; i++) {
		if (PICK_ROWS[i].gain === gain)
			return i;
	}
	return 2;
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

function readGain(): Gain {
	try {
		const v = Preference.get(PREF, "gain");
		if (v === "high" || v === "low" || v === "mid")
			return v;
		if (v === 0 || v === "0")
			return "high";
		if (v === 2 || v === "2")
			return "low";
	}
	catch {
		/* */
	}
	return "mid";
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
	gain: Gain = "mid";
	armed = false;
	peak = 0;
	floor = 0;
	loud = false;
	lastHit = 0;
	pickIndex = 0;
	helpIndex = 0;
	note = "";
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.count = clampCount(store.getNum("value", 0));
		this.step = nearestStep(store.getNum("step", 1));
		this.volume = Math.max(VOL_MIN, Math.min(VOL_MAX, store.getNum("volume", VOL_DEFAULT)));
		this.sense = readSense();
		this.gain = readGain();
		this.power = new Power("blank");
		// Wipe launcher "校验…" before mic/speaker I2C / I2S work.
		this.paint(app);
		Timer.set(() => this.boot(app), 1);
	}

	boot(app: AppHost) {
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
		this.floor = 0;
		this.loud = false;
		this.note = "";
		if (this.sense === "ear") {
			this.mic = openMic();
			if (!this.mic)
				this.note = micFault() || "无麦克风";
			this.armed = armDefault && !!this.mic;
			if (this.armed && this.mic) {
				this.mic.takePeak();
				this.floor = this.mic.peak();
				this.peak = this.floor;
				this.loud = false;
			}
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
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(app);
		if (stroke)
			this.handleStroke(app, stroke);
		else if (this.mode === "run" && this.sense === "ear" && this.armed)
			this.paint(app);
	}

	pollEar(app: AppHost) {
		const peak = this.mic?.takePeak() ?? 0;
		this.peak = peak;
		const tune = tuneFor(this.gain);
		if (this.loud) {
			const off = Math.max(3, this.floor + tune.rise * 0.4, this.floor * 1.25);
			if (peak < off)
				this.loud = false;
			return;
		}
		this.floor += (peak - this.floor) * FLOOR_ALPHA;
		const on = Math.max(tune.minOn, this.floor + tune.rise, Math.ceil(this.floor * tune.mult));
		if (peak < on)
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
				this.pickIndex = Math.max(0, Math.min(PICK_ROWS.length - 1, this.pickIndex + dir));
				this.paint(app);
				return;
			}
			if (isConfirm(stroke)) {
				const row = PICK_ROWS[this.pickIndex] ?? PICK_ROWS[0];
				this.mode = "run";
				const senseChanged = row.sense !== this.sense;
				const gainChanged = row.gain !== this.gain;
				this.sense = row.sense;
				if (row.sense === "ear")
					this.gain = row.gain;
				if (senseChanged || gainChanged)
					this.save();
				if (senseChanged)
					this.applySense(app, row.sense === "ear");
				else
					this.paint(app);
				return;
			}
			this.paint(app);
			return;
		}

		for (const ch of stroke.chars) {
			if (ch === "m" || ch === "M") {
				this.pickIndex = pickIndexFor(this.sense, this.gain);
				this.mode = "pick";
				this.paint(app);
				return;
			}
			if (ch === "s" || ch === "S") {
				if (this.sense !== "ear")
					continue;
				let at = 1;
				for (let i = 0; i < GAINS.length; i++) {
					if (GAINS[i].id === this.gain) {
						at = i;
						break;
					}
				}
				this.gain = GAINS[(at + 1) % GAINS.length].id;
				this.save();
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
				if (this.armed)
					this.mic.takePeak();
				this.peak = this.mic.peak();
				this.floor = this.peak;
				this.loud = false;
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
			store.set("value", this.count);
			store.set("step", this.step);
			store.set("volume", this.volume);
			store.set("sense", this.sense);
			store.set("gain", this.gain);
		}
		catch {
			/* */
		}
	}

	paint(app: AppHost) {
		const list = contentByName(app, "listPort");
		const titlePort = contentByName(app, "titlePort");
		const face = contentByName(app, "facePort");
		const footer = contentByName(app, "footerPort");
		if (this.mode === "help" || this.mode === "pick") {
			setVisibleProp(titlePort, false);
			setVisibleProp(face, false);
			setVisibleProp(footer, false);
			setVisibleProp(list, true);
			const view = asMenu(list);
			if (!view)
				return;
			if (this.mode === "help") {
				const page = helpList(helpFor(), this, helpTitle());
				view.setList(list, page.title, page.lines, "");
				return;
			}
			const lines = [];
			for (let i = 0; i < PICK_ROWS.length; i++) {
				const row = PICK_ROWS[i];
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
		setVisibleProp(titlePort, true);
		setVisibleProp(face, true);
		setVisibleProp(footer, true);
		const heading = this.sense === "ear" ? "听声" : "计数";
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
		const top = asCountTop(titlePort);
		if (top) {
			top.setTop(
				titlePort,
				heading,
				this.volume,
				g.kind,
				g.level === undefined ? 0 : g.level,
				this.sense,
				this.armed,
			);
		}
		const seg = asSevenSeg(face);
		if (seg)
			seg.setFace(face, String(this.count < 0 ? 0 : this.count), this.flash !== 0);
		const foot = asCountFooter(footer);
		if (foot) {
			foot.setFooter(
				footer,
				this.step,
				stepIndex < 0 ? 0 : stepIndex,
				STEPS.length,
				this.flash,
				this.sense,
				this.gain,
				this.armed,
				this.peak,
			);
		}
	}
}
