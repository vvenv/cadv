/*
	Manual tally or listen-for-sound tally.
	Speaker and mic share I2S1, so listen mode closes the click tones.
	Listening runs a native hit detector (onset.c) on every PCM chunk;
	this side only collects the hit count and a level for the bar.
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
import { onsetFeed, onsetLevel, onsetReset } from "onset";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asCountFooter, asCountTop, type Gain, type Sense } from "view";

const PREF = "count";
const store = pref(PREF);
const STEPS = Object.freeze([1, 2, 5, 10, 20, 50, 100]);
const COUNT_MAX = 999999;
/** Shortest spacing between two hits. */
const HIT_GAP_MS = 180;
/** A hit's level must fall this far before the next can count. */
const RELEASE_DB = 8;
/** Start-up spent only learning the noise floor (codec pop, filters). */
const SETTLE_MS = 300;
/** Level bar range, high-passed dBFS. */
const BAR_LO_DB = -70;
const BAR_HI_DB = -10;
/** Persist the count at most this often while listening (flash writes stall audio). */
const SAVE_DELAY_MS = 1500;

type Mode = "run" | "pick" | "help";

/** thr: dB over the noise floor; rise: dB jump within 8 ms; minDb: absolute floor. */
type GainTune = { id: Gain; thr: number; rise: number; minDb: number };

const GAINS = Object.freeze([
	{ id: "high" as Gain, thr: 8, rise: 6, minDb: -65 },
	{ id: "mid" as Gain, thr: 11, rise: 6, minDb: -55 },
	{ id: "low" as Gain, thr: 16, rise: 7, minDb: -45 },
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
	/** Level bar, 0..100. */
	peak = 0;
	/** Hits found in the mic callback, not yet added. */
	hits = 0;
	saveTimer: ReturnType<typeof Timer.set> | null = null;
	pickIndex = 0;
	helpIndex = 0;
	note = "";
	/** First R arms the reset; a second R clears the count. Other keys disarm. */
	resetArmed = false;
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
		this.hits = 0;
		this.note = "";
		if (this.sense === "ear") {
			this.mic = openMic(pcm => this.onPcm(pcm), { peak: false });
			if (!this.mic)
				this.note = micFault() || "无麦克风";
			this.setArmed(armDefault && !!this.mic);
		}
		else {
			releaseMic();
			this.sound = new ClockSound();
			this.sound.setVolume(this.volume);
		}
		this.paint(app);
	}

	/** Start or stop listening; starting restarts the detector. */
	setArmed(on: boolean) {
		this.armed = on;
		this.hits = 0;
		this.peak = 0;
		if (on)
			this.restartDetector();
	}

	restartDetector() {
		const tune = tuneFor(this.gain);
		onsetReset(tune.thr, tune.rise, tune.minDb, RELEASE_DB, HIT_GAP_MS, SETTLE_MS);
	}

	onPcm(pcm: Int16Array) {
		if (!this.armed)
			return;
		this.hits += onsetFeed(pcm.buffer, pcm.byteOffset, pcm.length);
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
		const level = onsetLevel()[0];
		this.peak = Math.round((level - BAR_LO_DB) * 100 / (BAR_HI_DB - BAR_LO_DB));
		const hits = this.hits;
		if (hits > 0) {
			this.hits = 0;
			this.add(app, this.step * hits, true);
		}
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
			this.flushSave();
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
				else {
					if (gainChanged && this.armed)
						this.restartDetector();
					this.paint(app);
				}
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
				if (this.armed)
					this.restartDetector();
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
				this.setArmed(!this.armed);
				this.save();
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

		const wantsReset = stroke.chars.some(ch => ch === "r" || ch === "R");
		if (!wantsReset)
			this.resetArmed = false;
		for (const ch of stroke.chars) {
			if (ch === "r" || ch === "R") {
				if (!this.resetArmed) {
					this.resetArmed = true;
					this.paint(app);
					return;
				}
				this.resetArmed = false;
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
		if (this.armed)
			this.saveSoon();
		else
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

	/** While listening, batch writes so a flash write can't stall the mic. */
	saveSoon() {
		if (this.saveTimer)
			return;
		this.saveTimer = Timer.set(() => {
			this.saveTimer = null;
			this.save();
		}, SAVE_DELAY_MS);
	}

	flushSave() {
		if (!this.saveTimer)
			return;
		Timer.clear(this.saveTimer);
		this.saveTimer = null;
		this.save();
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
		const heading = this.resetArmed ? "再按R清零" : (this.sense === "ear" ? "听声" : "计数");
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
