/*
	Sound level meter. PCM from the mic is reduced to an RMS level every
	WINDOW samples (DC removed), shown as dB = dBFS + offset. The offset is
	a user calibration; nothing here knows the mic's real sensitivity.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { helpList } from "help-ui";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir, sideDir } from "keys";
import { asMenu } from "menu-view";
import { micFault, openMic, type MicFeed } from "mic";
import { pref } from "pref";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asMeter, HISTORY } from "view";

const store = pref("db");
/** 1/8 s at 16 kHz. */
const WINDOW = 2000;
const OFFSET_DEFAULT = 100;
const OFFSET_MIN = 60;
const OFFSET_MAX = 140;
/** Readout smoothing per window (about "fast" weighting). */
const SMOOTH = 0.35;
/** One history bar every this many windows (~0.25 s). */
const BAR_EVERY = 2;
const FLOOR_DB = -90;

type Mode = "run" | "help";

export class AppBehavior extends Behavior {
	mode: Mode = "run";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	mic: MicFeed | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	offset = OFFSET_DEFAULT;
	paused = false;
	note = "";
	/* Window accumulators (filled from the mic callback). */
	accN = 0;
	accSum = 0;
	accSq = 0;
	/** Latest smoothed dBFS, or null before the first window. */
	level: number | null = null;
	/* Stats in dBFS / energy. */
	maxDbfs = FLOOR_DB;
	energySum = 0;
	energyN = 0;
	history: number[] = [];
	barTick = 0;
	dirty = false;
	helpIndex = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.offset = store.getInt("offset", OFFSET_DEFAULT, OFFSET_MIN, OFFSET_MAX);
		this.power = new Power("dim");
		this.paint(app);
		Timer.set(() => this.boot(app), 1);
	}

	boot(app: AppHost) {
		this.mic = openMic(pcm => this.onPcm(pcm));
		if (!this.mic)
			this.note = micFault() || "无麦克风";
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.paint(app);
	}

	onPcm(pcm: Int16Array) {
		if (this.paused)
			return;
		let sum = this.accSum;
		let sq = this.accSq;
		let n = this.accN;
		for (let i = 0; i < pcm.length; i++) {
			const v = pcm[i];
			sum += v;
			sq += v * v;
			n++;
			if (n >= WINDOW) {
				const mean = sum / n;
				const power = Math.max(0, sq / n - mean * mean);
				this.addWindow(power);
				sum = 0;
				sq = 0;
				n = 0;
			}
		}
		this.accSum = sum;
		this.accSq = sq;
		this.accN = n;
	}

	addWindow(power: number) {
		const rms = Math.sqrt(power);
		const dbfs = rms > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(rms / 32768)) : FLOOR_DB;
		this.level = this.level === null ? dbfs : this.level + (dbfs - this.level) * SMOOTH;
		if (dbfs > this.maxDbfs)
			this.maxDbfs = dbfs;
		this.energySum += power;
		this.energyN++;
		this.barTick++;
		if (this.barTick >= BAR_EVERY) {
			this.barTick = 0;
			this.history.push(this.level);
			if (this.history.length > HISTORY)
				this.history.shift();
		}
		this.dirty = true;
	}

	onKeyboardTick(app: AppHost) {
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(app);
		if (stroke)
			this.handleStroke(app, stroke);
		else if (this.dirty && this.mode === "run") {
			this.dirty = false;
			this.paint(app);
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
			try { this.mic?.close(); } catch { /* */ }
			this.mic = null;
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
		if (isConfirm(stroke)) {
			this.paused = !this.paused;
			this.paint(app);
			return;
		}
		const side = sideDir(stroke);
		if (side !== 0) {
			this.setOffset(this.offset + side);
			this.paint(app);
			return;
		}
		for (const ch of stroke.chars) {
			if (ch === "0") {
				this.setOffset(OFFSET_DEFAULT);
				this.paint(app);
				return;
			}
			if (ch === "r" || ch === "R") {
				this.maxDbfs = this.level ?? FLOOR_DB;
				this.energySum = 0;
				this.energyN = 0;
				this.history = [];
				this.paint(app);
				return;
			}
		}
	}

	setOffset(n: number) {
		const next = Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, n));
		if (next === this.offset)
			return;
		this.offset = next;
		try { store.set("offset", next); } catch { /* */ }
	}

	db(dbfs: number): number {
		return Math.max(0, Math.round(dbfs + this.offset));
	}

	paint(app: AppHost) {
		const list = contentByName(app, "listPort");
		const face = contentByName(app, "facePort");
		if (this.mode === "help") {
			setVisibleProp(face, false);
			setVisibleProp(list, true);
			const view = asMenu(list);
			if (view) {
				const page = helpList(helpFor(), this, helpTitle());
				view.setList(list, page.title, page.lines, "");
			}
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(face, true);
		const view = asMeter(face);
		if (!view)
			return;
		const status = this.note ? this.note : this.paused ? { kind: "pause" as const } : "";
		const g = titleGlyph(this.power, status);
		const have = this.level !== null;
		const leq = this.energyN ? 10 * Math.log10(Math.max(1e-9, this.energySum / this.energyN) / (32768 * 32768)) : FLOOR_DB;
		const bars: number[] = [];
		for (const v of this.history)
			bars.push(this.db(v));
		const offsetNote = this.offset === OFFSET_DEFAULT ? "" : " 校" + (this.offset > OFFSET_DEFAULT ? "+" : "") + (this.offset - OFFSET_DEFAULT);
		view.setState(face, {
			title: (this.paused ? "暂停" : "分贝") + offsetNote,
			value: have && this.level !== null ? this.db(this.level) : -1,
			avg: this.energyN ? this.db(leq) : -1,
			max: have ? this.db(this.maxDbfs) : -1,
			bars,
			mark: g.kind,
			level: g.level === undefined ? 0 : g.level,
		});
	}
}
