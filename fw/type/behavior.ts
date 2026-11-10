/*
	Typing practice. Every printable key is input here, so only Tab (source),
	Esc (restart), BS (back one), Enter (after the result) and ? (help) are commands.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { helpList } from "help-ui";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isConfirm, isHelp, isLauncher, navDir } from "keys";
import { asMenu } from "menu-view";
import { pref } from "pref";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { makeRound, SOURCES, sourceLabel, type Source } from "texts";
import { asType } from "view";

const store = pref("type");
const ROUND_LINES = 4;

type Mode = "type" | "done" | "help";

export class AppBehavior extends Behavior {
	mode: Mode = "type";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	clockTimer: ReturnType<typeof Timer.repeat> | null = null;
	source: Source = "words";
	lines: string[] = [];
	line = 0;
	typed = "";
	/** Per finished line: typed text, for scoring. */
	done: string[] = [];
	startedAt = 0;
	endedAt = 0;
	keystrokes = 0;
	errors = 0;
	/** Expected char → times it was missed this round. */
	misses: Record<string, number> = {};
	best = 0;
	newBest = false;
	helpIndex = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		const s = store.getString("source", "words");
		this.source = SOURCES.indexOf(s as Source) >= 0 ? s as Source : "words";
		this.power = new Power("blank");
		this.newRound();
		this.paint(app);
		Timer.set(() => {
			this.kb = new CardputerKeyboard();
			this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 20);
			/* Refresh the live WPM while a round runs. */
			this.clockTimer = Timer.repeat(() => {
				if (this.mode === "type" && this.startedAt)
					this.paint(app);
			}, 1000);
		}, 1);
	}

	newRound() {
		this.lines = makeRound(this.source, ROUND_LINES);
		this.line = 0;
		this.typed = "";
		this.done = [];
		this.startedAt = 0;
		this.endedAt = 0;
		this.keystrokes = 0;
		this.errors = 0;
		this.misses = {};
		this.newBest = false;
		this.best = store.getInt("best_" + this.source, 0, 0, 999);
		this.mode = "type";
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
			bootLauncher();
			return;
		}
		if (this.mode === "help") {
			if (stroke.del || stroke.esc || stroke.left || isConfirm(stroke)) {
				this.mode = this.endedAt ? "done" : "type";
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.helpIndex += dir;
			this.paint(app);
			return;
		}
		if (isHelp(stroke)) {
			this.helpIndex = 0;
			this.mode = "help";
			this.paint(app);
			return;
		}
		if (stroke.tab) {
			this.source = SOURCES[(SOURCES.indexOf(this.source) + 1) % SOURCES.length];
			try { store.set("source", this.source); } catch { /* */ }
			this.newRound();
			this.paint(app);
			return;
		}
		if (stroke.esc) {
			this.newRound();
			this.paint(app);
			return;
		}
		if (this.mode === "done") {
			if (stroke.enter) {
				this.newRound();
				this.paint(app);
			}
			return;
		}
		if (stroke.del) {
			if (this.typed.length)
				this.typed = this.typed.slice(0, -1);
			this.paint(app);
			return;
		}
		for (const ch of stroke.chars) {
			if (ch.length !== 1 || ch < " " || ch > "~")
				continue;
			this.type(ch);
			if (this.mode !== "type")
				break;
		}
		this.paint(app);
	}

	type(ch: string) {
		const target = this.lines[this.line] ?? "";
		const at = this.typed.length;
		if (at >= target.length)
			return;
		if (!this.startedAt)
			this.startedAt = Date.now();
		this.keystrokes++;
		const want = target.charAt(at);
		if (ch !== want) {
			this.errors++;
			const key = want === " " ? "空格" : want;
			this.misses[key] = (this.misses[key] ?? 0) + 1;
		}
		this.typed += ch;
		if (this.typed.length >= target.length) {
			this.done.push(this.typed);
			this.typed = "";
			this.line++;
			if (this.line >= this.lines.length)
				this.finish();
		}
	}

	finish() {
		this.endedAt = Date.now();
		this.mode = "done";
		const wpm = this.wpm();
		if (wpm > this.best) {
			this.best = wpm;
			this.newBest = true;
			try { store.set("best_" + this.source, wpm); } catch { /* */ }
		}
	}

	/** Correct chars in finished lines plus the current line. */
	correctChars(): number {
		let n = 0;
		const count = (typed: string, target: string) => {
			for (let i = 0; i < typed.length; i++) {
				if (typed.charAt(i) === target.charAt(i))
					n++;
			}
		};
		for (let i = 0; i < this.done.length; i++)
			count(this.done[i], this.lines[i] ?? "");
		if (this.mode === "type")
			count(this.typed, this.lines[this.line] ?? "");
		return n;
	}

	/** Net WPM: correct chars / 5 per minute. */
	wpm(): number {
		if (!this.startedAt)
			return 0;
		const end = this.endedAt || Date.now();
		const minutes = (end - this.startedAt) / 60000;
		if (minutes < 1 / 60)
			return 0;
		return Math.round(this.correctChars() / 5 / minutes);
	}

	accuracy(): number {
		if (!this.keystrokes)
			return 100;
		return Math.max(0, Math.round((this.keystrokes - this.errors) * 100 / this.keystrokes));
	}

	worstKeys(): string {
		const keys = Object.keys(this.misses);
		keys.sort((a, b) => this.misses[b] - this.misses[a]);
		return keys.slice(0, 3).join(" ");
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
		const view = asType(face);
		if (!view)
			return;
		const g = titleGlyph(this.power);
		const label = sourceLabel(this.source);
		if (this.mode === "done") {
			const worst = this.worstKeys();
			const secs = Math.round((this.endedAt - this.startedAt) / 1000);
			view.setState(face, {
				title: label + " 完成",
				right: secs + "秒",
				target: "",
				typed: "",
				next: "",
				progress: 100,
				result: [
					{ key: "速度", value: this.wpm() + " WPM" + (this.newBest ? " 新纪录" : "") },
					{ key: "正确率", value: this.accuracy() + "%" },
					{ key: "易错键", value: worst || "无" },
					{ key: "最好", value: this.best + " WPM" },
				],
				mark: g.kind,
				level: g.level === undefined ? 0 : g.level,
			});
			return;
		}
		const target = this.lines[this.line] ?? "";
		let total = 0;
		let doneChars = 0;
		for (let i = 0; i < this.lines.length; i++) {
			total += this.lines[i].length;
			if (i < this.line)
				doneChars += this.lines[i].length;
		}
		doneChars += this.typed.length;
		view.setState(face, {
			title: label + " " + (this.line + 1) + "/" + this.lines.length,
			right: this.startedAt ? this.wpm() + "WPM " + this.accuracy() + "%" : "最好" + this.best,
			target,
			typed: this.typed,
			next: this.lines[this.line + 1] ?? "",
			progress: total ? Math.floor(doneChars * 100 / total) : 0,
			result: [],
			mark: g.kind,
			level: g.level === undefined ? 0 : g.level,
		});
	}
}
