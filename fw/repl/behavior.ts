/*
	JS REPL. Every printable key is input, so help moves to Fn+Space and
	navigation to the Fn arrows:
	  Enter runs (or continues while brackets/strings are open),
	  Fn+K / Fn+J walk history, Fn+H / Fn+L move the caret,
	  Shift+Fn+K / J scroll the output, Esc clears the line,
	  Fn+Space opens help (Tab too, for the simulator, which has no Fn),
	  Fn+BS returns to the launcher.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { helpList } from "help-ui";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir } from "keys";
import { asMenu } from "menu-view";
import { Power } from "power";
import { acceptStroke } from "session";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { Repl, scan, type Kind } from "repl";
import { asTerm, COLS, ROWS, wrap, type Row } from "view";

type Mode = "term" | "help";

const MAX_ROWS = 240;
const MAX_HISTORY = 40;
const MAX_INPUT = 2000;
const PROMPT = "> ";
const MORE = ".. ";
const REPEAT_DELAY = 400;
const REPEAT_RATE = 50;

export class AppBehavior extends Behavior {
	mode: Mode = "term";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	app: AppHost | null = null;
	repl: Repl | null = null;
	rows: Row[] = [];
	line = "";
	cursor = 0;
	/** Earlier lines of an input whose brackets are still open. */
	pending: string[] = [];
	history: string[] = [];
	/** Index into history while browsing; history.length = the live line. */
	hpos = 0;
	/** Live line saved while browsing history. */
	draft = "";
	scroll = 0;
	helpIndex = 0;
	hostEnterDown = false;
	dirty = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.app = app;
		this.power = new Power("blank");
		this.kb = new CardputerKeyboard();
		this.kb.repeatDelay = REPEAT_DELAY;
		this.kb.repeatRate = REPEAT_RATE;
		this.repl = new Repl(
			(text, kind) => this.say(text, kind),
			() => {
				this.rows = [];
				this.scroll = 0;
			},
		);
		this.say("JS REPL  Fn+Space: help", "info");
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.paint(app);
	}

	/** Output from eval, print() and timers. Painted once per tick. */
	say(text: string, kind: Kind) {
		for (const r of wrap(text))
			this.rows.push({ text: r, kind });
		if (this.rows.length > MAX_ROWS)
			this.rows.splice(0, this.rows.length - MAX_ROWS);
		this.scroll = 0;
		this.dirty = true;
	}

	onKeyboardTick(app: AppHost) {
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.dirty = true;
		if (stroke)
			this.handleStroke(app, stroke);
		/* Timer callbacks and promise jobs print between keys. */
		if (this.dirty)
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
		this.paint(content as AppHost);
	}

	onKeyUp(_content: unknown, key: string) {
		if (key === "\r" || key === "\n")
			this.hostEnterDown = false;
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		this.dirty = true;
		if (isLauncher(stroke)) {
			this.repl?.stopAll();
			bootLauncher();
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke) || isHelp(stroke) || stroke.tab) {
				this.mode = "term";
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.helpIndex += dir;
			return;
		}
		if (stroke.help || stroke.tab) {
			this.helpIndex = 0;
			this.mode = "help";
			return;
		}
		if (stroke.up || stroke.down) {
			if (stroke.shift)
				this.scrollBy(stroke.up ? ROWS - 1 : -(ROWS - 1));
			else
				this.browse(stroke.up ? -1 : 1);
			return;
		}
		this.scroll = 0;
		if (stroke.left) {
			this.cursor = Math.max(0, this.cursor - 1);
			return;
		}
		if (stroke.right) {
			this.cursor = Math.min(this.line.length, this.cursor + 1);
			return;
		}
		if (stroke.esc) {
			if (this.line)
				this.setLine("");
			else if (this.pending.length) {
				this.pending = [];
				this.say("(cancelled)", "info");
			}
			return;
		}
		if (stroke.del) {
			if (this.cursor > 0) {
				this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor);
				this.cursor--;
			}
			return;
		}
		if (stroke.enter) {
			this.submit();
			return;
		}
		for (const ch of stroke.chars) {
			if (this.line.length >= MAX_INPUT)
				break;
			this.line = this.line.slice(0, this.cursor) + ch + this.line.slice(this.cursor);
			this.cursor++;
		}
	}

	setLine(text: string) {
		this.line = text;
		this.cursor = text.length;
	}

	browse(dir: -1 | 1) {
		if (!this.history.length)
			return;
		if (this.hpos === this.history.length)
			this.draft = this.line;
		const next = Math.max(0, Math.min(this.history.length, this.hpos + dir));
		if (next === this.hpos)
			return;
		this.hpos = next;
		this.setLine(next === this.history.length ? this.draft : this.history[next]);
	}

	scrollBy(n: number) {
		const max = Math.max(0, this.rows.length + this.inputRows().length - ROWS);
		this.scroll = Math.max(0, Math.min(max, this.scroll + n));
	}

	submit() {
		const text = this.line;
		this.say((this.pending.length ? MORE : PROMPT) + text, "in");
		if (text.trim() && this.history[this.history.length - 1] !== text) {
			this.history.push(text);
			if (this.history.length > MAX_HISTORY)
				this.history.shift();
		}
		this.hpos = this.history.length;
		this.draft = "";
		this.setLine("");
		const src = [...this.pending, text].join("\n");
		if (!src.trim()) {
			this.pending = [];
			return;
		}
		if (scan(src).open) {
			this.pending.push(text);
			return;
		}
		this.pending = [];
		this.repl?.run(src);
	}

	inputRows(): string[] {
		const full = (this.pending.length ? MORE : PROMPT) + this.line;
		const rows = wrap(full);
		/* Caret after a full last row starts a new one. */
		if (full.length % COLS === 0)
			rows.push("");
		return rows;
	}

	paint(app: AppHost) {
		this.dirty = false;
		const list = contentByName(app, "listPort");
		const term = contentByName(app, "termPort");
		if (this.mode === "help") {
			setVisibleProp(term, false);
			setVisibleProp(list, true);
			const view = asMenu(list);
			if (view) {
				const page = helpList(helpFor(), this, helpTitle());
				view.setList(list, page.title, page.lines, "");
			}
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(term, true);
		const view = asTerm(term);
		if (!view)
			return;
		const prompt = this.pending.length ? MORE : PROMPT;
		const at = prompt.length + this.cursor;
		const input = this.inputRows();
		const total = this.rows.length + input.length;
		view.setState(term, {
			rows: this.rows,
			input,
			caretRow: Math.floor(at / COLS),
			caretCol: at % COLS,
			scroll: this.scroll,
			badge: this.scroll ? `-${this.scroll}/${Math.max(0, total - ROWS)}` : "",
		});
	}
}
