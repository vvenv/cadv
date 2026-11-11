/*
	Sound level meter. The per-sample work (A/Z weighting, Fast/Slow time
	weighting, window energy) runs in C (slm.c); this side only sees one
	result per WINDOW samples. Shown as dB = dBFS + offset. The offset is a
	user calibration; nothing here knows the mic's real sensitivity.
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
import { slmFeed, slmReset } from "slm";
import { asMeter, HISTORY } from "view";

const store = pref("db");
/** 1/8 s at 16 kHz. */
const WINDOW = 2000;
const OFFSET_DEFAULT = 100;
const OFFSET_MIN = 60;
const OFFSET_MAX = 140;
/** IEC 61672 time constants, seconds. */
const TAU_FAST = 0.125;
const TAU_SLOW = 1;
/** Windows dropped after (re)start: codec pop and filter settling (~0.5 s). */
const SETTLE = 4;
/** One history bar every this many windows (~0.25 s). */
const BAR_EVERY = 2;
const FLOOR_DB = -90;
const FLOOR_MS = Math.pow(10, FLOOR_DB / 10);

function toDbfs(ms: number): number {
	return ms > FLOOR_MS ? 10 * Math.log10(ms) : FLOOR_DB;
}

type Mode = "run" | "help";

export class AppBehavior extends Behavior {
	mode: Mode = "run";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	mic: MicFeed | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	offset = OFFSET_DEFAULT;
	/** A weighting (else Z). */
	aWeight = true;
	/** Slow time weighting (else Fast). */
	slow = false;
	paused = false;
	note = "";
	/** First R arms, second R clears the statistics. */
	resetArmed = false;
	/** [window ms, weighted ms now, weighted ms max], written by slmFeed. */
	out = new Float32Array(3);
	/** Latest time-weighted dBFS, or null before the first window. */
	level: number | null = null;
	/* Stats in dBFS / energy (mean square, full scale = 1). */
	maxDbfs = FLOOR_DB;
	energySum = 0;
	energyN = 0;
	history: number[] = [];
	barTick = 0;
	barEnergy = 0;
	dirty = false;
	helpIndex = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.offset = store.getInt("offset", OFFSET_DEFAULT, OFFSET_MIN, OFFSET_MAX);
		this.aWeight = store.getInt("weight", 1, 0, 1) === 1;
		this.slow = store.getInt("slow", 0, 0, 1) === 1;
		this.restart();
		this.power = new Power("dim");
		this.paint(app);
		Timer.set(() => this.boot(app), 1);
	}

	boot(app: AppHost) {
		this.mic = openMic(pcm => this.onPcm(pcm), { peak: false });
		if (!this.mic)
			this.note = micFault() || "无麦克风";
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.paint(app);
	}

	/** Reset the native filters; the first SETTLE windows are dropped. */
	restart() {
		slmReset(this.aWeight, this.slow ? TAU_SLOW : TAU_FAST, WINDOW, SETTLE);
		this.barTick = 0;
		this.barEnergy = 0;
	}

	onPcm(pcm: Int16Array) {
		if (this.paused)
			return;
		const out = this.out;
		const done = slmFeed(pcm.buffer, pcm.byteOffset, pcm.length, out.buffer);
		if (done > 0)
			this.addWindow(out[0], out[1], out[2], done);
	}

	/** windowMs: mean square of the window(s); now/peak: time-weighted. */
	addWindow(windowMs: number, now: number, peak: number, count: number) {
		this.level = toDbfs(now);
		const peakDb = toDbfs(peak);
		if (peakDb > this.maxDbfs)
			this.maxDbfs = peakDb;
		this.energySum += windowMs * count;
		this.energyN += count;
		this.barEnergy += windowMs * count;
		this.barTick += count;
		if (this.barTick >= BAR_EVERY) {
			/* Each bar is the Leq of its slot, so short bangs still show. */
			this.history.push(toDbfs(this.barEnergy / this.barTick));
			if (this.history.length > HISTORY)
				this.history.shift();
			this.barTick = 0;
			this.barEnergy = 0;
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
			/* Filter state is stale after a gap; settle again on resume. */
			if (!this.paused)
				this.restart();
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
				if (!this.resetArmed) {
					this.resetArmed = true;
					this.paint(app);
					return;
				}
				this.resetArmed = false;
				this.clearStats();
				this.paint(app);
				return;
			}
			if (ch === "a" || ch === "A") {
				this.aWeight = !this.aWeight;
				try { store.set("weight", this.aWeight ? 1 : 0); } catch { /* */ }
				/* A and Z readings don't mix: start the statistics over. */
				this.restart();
				this.level = null;
				this.clearStats();
				this.paint(app);
				return;
			}
			if (ch === "s" || ch === "S") {
				this.slow = !this.slow;
				try { store.set("slow", this.slow ? 1 : 0); } catch { /* */ }
				this.restart();
				this.level = null;
				this.clearStats();
				this.paint(app);
				return;
			}
		}
	}

	clearStats() {
		this.maxDbfs = this.level ?? FLOOR_DB;
		this.energySum = 0;
		this.energyN = 0;
		this.history = [];
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
		const status = this.resetArmed ? "再按R清空" : this.note ? this.note : this.paused ? { kind: "pause" as const } : "";
		const g = titleGlyph(this.power, status);
		const have = this.level !== null;
		const leq = this.energyN ? toDbfs(this.energySum / this.energyN) : FLOOR_DB;
		const bars: number[] = [];
		for (const v of this.history)
			bars.push(this.db(v));
		const offsetNote = this.offset === OFFSET_DEFAULT ? "" : " 校" + (this.offset > OFFSET_DEFAULT ? "+" : "") + (this.offset - OFFSET_DEFAULT);
		view.setState(face, {
			title: (this.paused ? "暂停" : "分贝") + (this.slow ? " 慢" : " 快") + offsetNote,
			unit: this.aWeight ? "dBA" : "dBZ",
			value: have && this.level !== null ? this.db(this.level) : -1,
			avg: this.energyN ? this.db(leq) : -1,
			max: have ? this.db(this.maxDbfs) : -1,
			bars,
			mark: g.kind,
			level: g.level === undefined ? 0 : g.level,
		});
	}
}
