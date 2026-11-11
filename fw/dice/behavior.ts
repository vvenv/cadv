/*
	Dice, coin, 1–100. Enter rolls; so does a shake on the BMI270.
	A roll tumbles for ROLL_MS with random faces and soft ticks, then lands.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { helpList } from "help-ui";
import { imuError, openImu, type ImuHandle } from "imu";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir, volumeDelta } from "keys";
import { asMenu } from "menu-view";
import { pref } from "pref";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { ClockSound } from "sound";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asDice, type DiceKind } from "view";

const store = pref("dice");
const KINDS: readonly DiceKind[] = Object.freeze(["dice", "coin", "number"]);
const DICE_MAX = 3;
const HISTORY = 6;
const ROLL_MS = 700;
const FRAME_MS = 70;
/** |a| this far from 1 g counts as a shake. */
const SHAKE_G = 0.9;
/** A shake inside this window after a landing is ignored (the board is still moving). */
const SHAKE_QUIET_MS = 900;

type Mode = "run" | "help";

function rand(n: number): number {
	return Math.floor(Math.random() * n);
}

export class AppBehavior extends Behavior {
	mode: Mode = "run";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	sound: ClockSound | null = null;
	imu: ImuHandle | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	rollTimer: ReturnType<typeof Timer.repeat> | null = null;
	kind: DiceKind = "dice";
	count = 2;
	volume = VOL_DEFAULT;
	faces: number[] = [1, 1];
	rolling = false;
	rollUntil = 0;
	landedAt = 0;
	/** Results as display strings, newest first. */
	history: string[] = [];
	note = "";
	/** First R arms, second R clears the history. */
	resetArmed = false;
	helpIndex = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		const k = store.getString("kind", "dice");
		this.kind = KINDS.indexOf(k as DiceKind) >= 0 ? k as DiceKind : "dice";
		this.count = store.getInt("count", 2, 1, DICE_MAX);
		this.volume = store.getInt("volume", VOL_DEFAULT, VOL_MIN, VOL_MAX);
		this.resetFaces();
		this.power = new Power("blank");
		this.paint(app);
		Timer.set(() => this.boot(app), 1);
	}

	boot(app: AppHost) {
		this.sound = new ClockSound();
		this.sound.setVolume(this.volume);
		this.imu = openImu();
		if (!this.imu)
			this.note = imuError() || "无传感器";
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.paint(app);
	}

	resetFaces() {
		if (this.kind === "dice") {
			this.faces = [];
			for (let i = 0; i < this.count; i++)
				this.faces.push(0);
		}
		else
			this.faces = [0];
	}

	onKeyboardTick(app: AppHost) {
		this.pollShake(app);
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(app);
		if (stroke)
			this.handleStroke(app, stroke);
	}

	pollShake(app: AppHost) {
		if (!this.imu || this.rolling || this.mode !== "run")
			return;
		if (Date.now() - this.landedAt < SHAKE_QUIET_MS)
			return;
		const s = this.imu.sample();
		if (!s)
			return;
		const g = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
		if (Math.abs(g - 1) < SHAKE_G)
			return;
		/* A shake also counts as activity so a dark panel lights for the result. */
		this.power?.activity();
		this.roll(app);
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
			this.close();
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
		const vol = volumeDelta(stroke.chars);
		if (vol !== 0) {
			this.volume = Math.max(VOL_MIN, Math.min(VOL_MAX, this.volume + vol));
			this.sound?.setVolume(this.volume);
			this.save();
			this.paint(app);
			return;
		}
		if (isConfirm(stroke)) {
			this.roll(app);
			return;
		}
		if (this.rolling)
			return;
		const dir = navDir(stroke);
		if (dir !== 0 && this.kind === "dice") {
			const next = Math.max(1, Math.min(DICE_MAX, this.count - dir));
			if (next !== this.count) {
				this.count = next;
				this.resetFaces();
				this.save();
			}
			this.paint(app);
			return;
		}
		for (const ch of stroke.chars) {
			const c = ch.toLowerCase();
			if (c === "m") {
				this.kind = KINDS[(KINDS.indexOf(this.kind) + 1) % KINDS.length];
				this.resetFaces();
				this.save();
				this.paint(app);
				return;
			}
			if (c === "r") {
				if (!this.resetArmed) {
					this.resetArmed = true;
					this.paint(app);
					return;
				}
				this.resetArmed = false;
				this.history = [];
				this.resetFaces();
				this.paint(app);
				return;
			}
		}
	}

	roll(app: AppHost) {
		if (this.rolling)
			return;
		this.rolling = true;
		this.rollUntil = Date.now() + ROLL_MS;
		this.tumble();
		this.paint(app);
		this.rollTimer = Timer.repeat(() => {
			if (Date.now() >= this.rollUntil) {
				this.land(app);
				return;
			}
			this.tumble();
			this.sound?.play([{ hz: 1500 + rand(600), ms: 12 }]);
			this.paint(app);
		}, FRAME_MS);
	}

	tumble() {
		this.faces = this.faces.map(() => this.randomFace());
	}

	randomFace(): number {
		if (this.kind === "dice")
			return 1 + rand(6);
		if (this.kind === "coin")
			return 1 + rand(2);
		return 1 + rand(100);
	}

	land(app: AppHost) {
		if (this.rollTimer)
			Timer.clear(this.rollTimer);
		this.rollTimer = null;
		this.rolling = false;
		this.landedAt = Date.now();
		this.tumble();
		this.history.unshift(this.resultText());
		if (this.history.length > HISTORY)
			this.history.length = HISTORY;
		this.sound?.play([{ hz: 880, ms: 50 }, { hz: 1320, ms: 90 }]);
		this.paint(app);
	}

	resultText(): string {
		if (this.kind === "coin")
			return this.faces[0] === 1 ? "正" : "反";
		if (this.kind === "number")
			return String(this.faces[0]);
		return String(this.total());
	}

	total(): number {
		let sum = 0;
		for (const f of this.faces)
			sum += f;
		return sum;
	}

	save() {
		try {
			store.set("kind", this.kind);
			store.set("count", this.count);
			store.set("volume", this.volume);
		}
		catch {
			/* */
		}
	}

	close() {
		if (this.rollTimer)
			Timer.clear(this.rollTimer);
		this.rollTimer = null;
		try { this.imu?.close(); } catch { /* */ }
		this.imu = null;
		try { this.sound?.close(); } catch { /* */ }
		this.sound = null;
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
		const view = asDice(face);
		if (!view)
			return;
		let title = this.kind === "dice" ? this.count + "颗骰子" : this.kind === "coin" ? "硬币" : "1-100";
		const landed = !this.rolling && this.faces[0] > 0;
		if (this.kind === "dice" && landed && this.count > 1)
			title += " 合计" + this.total();
		if (this.resetArmed)
			title = "再按R清空";
		const g = titleGlyph(this.power, this.note);
		view.setState(face, {
			title,
			kind: this.kind,
			faces: this.faces.slice(),
			rolling: this.rolling,
			history: this.history.join(" "),
			volume: this.volume,
			mark: g.kind,
			level: g.level === undefined ? 0 : g.level,
		});
	}
}
