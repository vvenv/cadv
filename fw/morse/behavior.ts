/*
	Morse keyer and Koch copy trainer.
	AudioOut only queues 8 elements, so each dit / dah is its own tone and a
	Timer chain walks the gaps. The board LED follows the key.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { ditMs, isMorseChar, KOCH, KOCH_MIN, morseOf } from "code";
import { helpFor, helpTitle } from "help";
import { helpList } from "help-ui";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isConfirm, isHelp, isLauncher, isPageBack, navDir, sideDir, volumeDelta } from "keys";
import { asMenu } from "menu-view";
import { pref } from "pref";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { ClockSound } from "sound";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asMorse, type Verdict } from "view";

const store = pref("morse");
const TONE_HZ = 700;
const WPM_MIN = 5;
const WPM_MAX = 30;
const TEXT_KEEP = 40;
const SCORE_WINDOW = 20;
const NEXT_AFTER_OK_MS = 500;

type Mode = "send" | "copy";

/** One step of the keyer: a tone (on) or a gap, in dits. */
type Step = { on: boolean; dits: number; char: number; element: number };

export class AppBehavior extends Behavior {
	mode: Mode = "send";
	help = false;
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	sound: ClockSound | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	stepTimer: ReturnType<typeof Timer.set> | null = null;
	nextTimer: ReturnType<typeof Timer.set> | null = null;
	wpm = 15;
	volume = VOL_DEFAULT;
	koch = KOCH_MIN;
	/** Send mode: everything typed (played and pending). */
	text = "";
	/** Index into text of the next char to key. */
	sent = 0;
	steps: Step[] = [];
	/** Char index in `text` (send) or 0 (copy) being keyed, and its element. */
	keyChar = -1;
	keyElement = -1;
	keyDown = false;
	/** Copy mode. */
	target = "";
	verdict: Verdict = "";
	answer = "";
	results: boolean[] = [];
	helpIndex = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.wpm = store.getInt("wpm", 15, WPM_MIN, WPM_MAX);
		this.volume = store.getInt("volume", VOL_DEFAULT, VOL_MIN, VOL_MAX);
		this.koch = store.getInt("koch", KOCH_MIN, KOCH_MIN, KOCH.length);
		this.mode = store.getString("mode", "send") === "copy" ? "copy" : "send";
		this.power = new Power("blank");
		this.paint(app);
		Timer.set(() => this.boot(app), 1);
	}

	boot(app: AppHost) {
		this.sound = new ClockSound();
		this.sound.setVolume(this.volume);
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		if (this.mode === "copy")
			this.nextTarget(app);
		this.paint(app);
	}

	onKeyboardTick(app: AppHost) {
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(app);
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
			this.stopKeying();
			try { this.sound?.close(); } catch { /* */ }
			bootLauncher();
			return;
		}
		if (isHelp(stroke) && !this.help) {
			this.helpIndex = 0;
			this.help = true;
			this.paint(app);
			return;
		}
		if (this.help) {
			if (stroke.del || stroke.esc || stroke.left || isConfirm(stroke)) {
				this.help = false;
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.helpIndex += dir;
			this.paint(app);
			return;
		}
		if (stroke.tab) {
			this.switchMode(app);
			return;
		}
		/* Speed: arrow flags only (Fn+K/J), since ; and . would be letters elsewhere. */
		if (stroke.up || stroke.down) {
			const next = Math.max(WPM_MIN, Math.min(WPM_MAX, this.wpm + (stroke.up ? 1 : -1)));
			if (next !== this.wpm) {
				this.wpm = next;
				this.save();
			}
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
		if (this.mode === "send")
			this.handleSend(app, stroke);
		else
			this.handleCopy(app, stroke);
	}

	switchMode(app: AppHost) {
		this.stopKeying();
		this.clearNext();
		this.mode = this.mode === "send" ? "copy" : "send";
		this.text = "";
		this.sent = 0;
		this.verdict = "";
		this.answer = "";
		this.save();
		if (this.mode === "copy")
			this.nextTarget(app);
		this.paint(app);
	}

	handleSend(app: AppHost, stroke: KeyStroke) {
		if (isPageBack(stroke)) {
			this.stopKeying();
			this.text = "";
			this.sent = 0;
			this.paint(app);
			return;
		}
		if (stroke.del) {
			/* Only pending chars can go; what was keyed is on the air already. */
			const floor = this.keyChar >= 0 ? this.keyChar + 1 : this.sent;
			if (this.text.length > floor)
				this.text = this.text.slice(0, -1);
			this.paint(app);
			return;
		}
		let added = false;
		for (const ch of stroke.chars) {
			if (ch === " ") {
				if (this.text.length && this.text.charAt(this.text.length - 1) !== " ") {
					this.text += " ";
					added = true;
				}
				continue;
			}
			if (!isMorseChar(ch))
				continue;
			this.text += ch.toUpperCase();
			added = true;
		}
		if (stroke.enter && this.text.length && this.text.charAt(this.text.length - 1) !== " ") {
			this.text += " ";
			added = true;
		}
		if (added) {
			this.trimText();
			if (this.keyChar < 0 && !this.stepTimer)
				this.keyNextChar(app);
		}
		this.paint(app);
	}

	/** Drop played text off the front so the strip stays short. */
	trimText() {
		const over = this.text.length - TEXT_KEEP;
		if (over <= 0)
			return;
		const cut = Math.min(over, this.sent);
		if (cut <= 0)
			return;
		this.text = this.text.slice(cut);
		this.sent -= cut;
		if (this.keyChar >= 0)
			this.keyChar -= cut;
	}

	/** Send mode: queue the next pending char (or a word gap) and start the chain. */
	keyNextChar(app: AppHost) {
		while (this.sent < this.text.length) {
			const at = this.sent;
			const ch = this.text.charAt(at);
			this.sent++;
			if (ch === " ") {
				/* Word gap is 7 dits; the 3-dit char gap already ran. */
				this.keyChar = at;
				this.steps = [{ on: false, dits: 4, char: at, element: -1 }];
				this.runStep(app);
				return;
			}
			const code = morseOf(ch);
			if (!code)
				continue;
			this.steps = this.stepsFor(code, at);
			this.keyChar = at;
			this.runStep(app);
			return;
		}
		this.keyChar = -1;
		this.keyElement = -1;
		this.paint(app);
	}

	stepsFor(code: string, char: number): Step[] {
		const out: Step[] = [];
		for (let i = 0; i < code.length; i++) {
			out.push({ on: true, dits: code.charAt(i) === "-" ? 3 : 1, char, element: i });
			out.push({ on: false, dits: i + 1 < code.length ? 1 : 3, char, element: -1 });
		}
		return out;
	}

	runStep(app: AppHost) {
		this.stepTimer = null;
		const step = this.steps.shift();
		if (!step) {
			this.keyUp();
			if (this.mode === "send")
				this.keyNextChar(app);
			else {
				this.keyChar = -1;
				this.keyElement = -1;
				this.paint(app);
			}
			return;
		}
		const ms = step.dits * ditMs(this.wpm);
		if (step.on) {
			this.keyDown = true;
			this.keyElement = step.element;
			this.power?.lamp("flash");
			this.sound?.play([{ hz: TONE_HZ, ms }]);
		}
		else
			this.keyUp();
		this.paint(app);
		this.stepTimer = Timer.set(() => this.runStep(app), ms);
	}

	keyUp() {
		this.keyDown = false;
		this.keyElement = -1;
		this.power?.lamp("off");
	}

	stopKeying() {
		if (this.stepTimer)
			Timer.clear(this.stepTimer);
		this.stepTimer = null;
		this.steps = [];
		this.keyChar = -1;
		this.keyUp();
		this.sound?.play([{ hz: 0, ms: 1 }]);
	}

	clearNext() {
		if (this.nextTimer)
			Timer.clear(this.nextTimer);
		this.nextTimer = null;
	}

	handleCopy(app: AppHost, stroke: KeyStroke) {
		const side = sideDir(stroke);
		if (side !== 0) {
			const next = Math.max(KOCH_MIN, Math.min(KOCH.length, this.koch + side));
			if (next !== this.koch) {
				this.koch = next;
				this.results = [];
				this.save();
				this.clearNext();
				this.nextTarget(app);
			}
			this.paint(app);
			return;
		}
		if (stroke.enter) {
			this.clearNext();
			if (this.verdict)
				this.nextTarget(app);
			else
				this.playTarget(app);
			return;
		}
		if (this.verdict === "ok")
			return;
		for (const ch of stroke.chars) {
			if (!isMorseChar(ch))
				continue;
			const up = ch.toUpperCase();
			this.answer = up;
			const right = up === this.target;
			this.results.push(right);
			if (this.results.length > SCORE_WINDOW)
				this.results.shift();
			if (right) {
				this.verdict = "ok";
				/* Answering early cuts the rest of the character. */
				this.stopKeying();
				this.sound?.play([{ hz: 0, ms: 60 }, { hz: 1320, ms: 40 }]);
				this.nextTimer = Timer.set(() => {
					this.nextTimer = null;
					this.nextTarget(app);
				}, NEXT_AFTER_OK_MS);
			}
			else {
				this.verdict = "bad";
				this.stopKeying();
				this.sound?.play([{ hz: 220, ms: 120 }]);
			}
			this.paint(app);
			return;
		}
	}

	nextTarget(app: AppHost) {
		const pool = KOCH.slice(0, this.koch);
		let pick = pool.charAt(Math.floor(Math.random() * pool.length));
		/* Avoid the same char twice running while the pool allows it. */
		if (pick === this.target && pool.length > 1)
			pick = pool.charAt((pool.indexOf(pick) + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length);
		this.target = pick;
		this.verdict = "";
		this.answer = "";
		this.playTarget(app);
	}

	playTarget(app: AppHost) {
		this.stopKeying();
		const code = morseOf(this.target);
		if (!code)
			return;
		this.steps = this.stepsFor(code, 0);
		this.keyChar = 0;
		/* A short lead-in so the first dit is not swallowed by the key click. */
		this.stepTimer = Timer.set(() => this.runStep(app), 250);
		this.paint(app);
	}

	score(): string {
		if (!this.results.length)
			return "";
		let ok = 0;
		for (const r of this.results) {
			if (r)
				ok++;
		}
		return Math.round(ok * 100 / this.results.length) + "%";
	}

	save() {
		try {
			store.set("wpm", this.wpm);
			store.set("volume", this.volume);
			store.set("koch", this.koch);
			store.set("mode", this.mode);
		}
		catch {
			/* */
		}
	}

	paint(app: AppHost) {
		const list = contentByName(app, "listPort");
		const face = contentByName(app, "facePort");
		if (this.help) {
			setVisibleProp(face, false);
			setVisibleProp(list, true);
			const view = asMenu(list);
			if (view) {
				const page = helpList(helpFor(this.mode === "copy"), this, helpTitle());
				view.setList(list, page.title, page.lines, "");
			}
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(face, true);
		const view = asMorse(face);
		if (!view)
			return;
		const g = titleGlyph(this.power);
		const copy = this.mode === "copy";
		let big = "";
		let code = "";
		if (copy) {
			/* The answer stays hidden until it is judged. */
			big = this.verdict ? this.target : "?";
			code = this.verdict ? morseOf(this.target) : "";
		}
		else if (this.keyChar >= 0 && this.keyChar < this.text.length) {
			big = this.text.charAt(this.keyChar);
			code = morseOf(big);
		}
		view.setState(face, {
			title: copy ? "抄收 " + this.koch + "字" : "发报",
			right: this.wpm + "WPM",
			score: copy ? this.score() : "",
			big,
			code,
			element: this.keyElement,
			keyDown: this.keyDown,
			text: copy ? KOCH.slice(0, this.koch) : this.text,
			sent: copy ? -1 : this.keyChar >= 0 ? this.keyChar : this.sent,
			verdict: copy ? this.verdict : "",
			answer: copy ? this.answer : "",
			volume: this.volume,
			mark: g.kind,
			level: g.level === undefined ? 0 : g.level,
		});
	}
}
