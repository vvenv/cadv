/*
	Type an English prefix. The screen shows one matching headword,
	part of speech then gloss, and its phonetic. ,/. or Fn+K/J move inside that prefix.
	j and k are letters.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { INK } from "ink";
import { isBack, isConfirm, isHelp, isLauncher, isPageBack, navDir } from "keys";
import { lexCount, lexGloss, lexLower, lexPhone, lexPrefixEnd, lexWord } from "lex";
import { MENU_VISIBLE, menuStep } from "list";
import { asMarquee, MARQUEE_MS, setMarqueeText } from "marquee";
import { asMenu } from "menu-view";
import { Power } from "power";
import { acceptStroke } from "session";
import { contentByName, setStringProp, setVisibleProp, type AppHost } from "ui";

type Mode = "look" | "help";

const QUERY_MAX = 16;

function listDir(stroke: KeyStroke): -1 | 0 | 1 {
	if (stroke.up)
		return -1;
	if (stroke.down)
		return 1;
	let dir: -1 | 0 | 1 = 0;
	for (let i = 0; i < stroke.chars.length; i++) {
		const ch = stroke.chars[i];
		if (ch === "," || ch === "<")
			dir = -1;
		else if (ch === "." || ch === ">")
			dir = 1;
	}
	return dir;
}

let phoneFaceStyle: object | undefined;

function phoneFace(): object {
	if (!phoneFaceStyle)
		phoneFaceStyle = new Style({ font: "bold 20px Ipa", color: INK, horizontal: "left", vertical: "middle" });
	return phoneFaceStyle;
}

export class AppBehavior extends Behavior {
	mode: Mode = "look";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	tickTimer: ReturnType<typeof Timer.repeat> | null = null;
	marqueeTimer: ReturnType<typeof Timer.repeat> | null = null;
	query = "";
	lo = 0;
	hi = 0;
	cursor = 0;
	helpIndex = 0;
	note = "";
	noteUntil = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.power = new Power("blank");
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.tickTimer = Timer.repeat(() => this.onTick(app), 250);
		this.marqueeTimer = Timer.repeat(() => this.tickMarquees(app), MARQUEE_MS);
		this.retarget();
		this.paintLook(app);
	}

	onKeyboardTick(app: AppHost) {
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		this.takePowerNote(app);
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
		const app = content as AppHost;
		const use = this.power ? acceptStroke(this.power, stroke, true) : stroke;
		this.takePowerNote(app);
		if (use)
			this.handleStroke(app, use);
	}

	onKeyUp(_content: unknown, key: string) {
		if (key === "\r" || key === "\n")
			this.hostEnterDown = false;
	}

	takePowerNote(app: AppHost) {
		const note = this.power?.takeNote() ?? "";
		if (!note)
			return;
		this.note = note;
		this.noteUntil = Date.now() + 700;
		if (this.mode === "look")
			this.paintLook(app);
	}

	onTick(app: AppHost) {
		if (this.mode !== "look" || !this.note || Date.now() < this.noteUntil)
			return;
		this.note = "";
		this.paintLook(app);
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (isLauncher(stroke)) {
			bootLauncher();
			return;
		}
		if (isHelp(stroke) && this.mode !== "help") {
			this.mode = "help";
			this.helpIndex = 0;
			this.showPanels(app, false);
			this.paintHelp(app);
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke)) {
				this.mode = "look";
				this.showPanels(app, true);
				this.paintLook(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.helpIndex += dir;
			this.paintHelp(app);
			return;
		}
		this.onLook(app, stroke);
	}

	onLook(app: AppHost, stroke: KeyStroke) {
		let edited = false;
		if (stroke.del && this.query.length > 0) {
			this.query = this.query.slice(0, -1);
			edited = true;
		}
		if (isPageBack(stroke) && this.query.length > 0) {
			this.query = "";
			edited = true;
		}
		for (let i = 0; i < stroke.chars.length; i++) {
			const c = stroke.chars[i].toLowerCase();
			if (c < "a" || c > "z")
				continue;
			if (this.query.length >= QUERY_MAX)
				break;
			this.query += c;
			edited = true;
		}
		if (edited)
			this.retarget();
		const dir = listDir(stroke);
		if (dir !== 0)
			this.step(dir);
		this.paintLook(app);
	}

	retarget() {
		this.lo = lexLower(this.query);
		this.hi = lexPrefixEnd(this.query);
		this.cursor = this.lo;
	}

	step(dir: -1 | 1) {
		const n = this.hi - this.lo;
		if (n <= 0)
			return;
		const rel = menuStep(this.cursor - this.lo, n, dir);
		this.cursor = this.lo + rel;
	}

	showPanels(app: AppHost, on: boolean) {
		setVisibleProp(contentByName(app, "queryLabel"), on);
		setVisibleProp(contentByName(app, "wordLabel"), on);
		setVisibleProp(contentByName(app, "glossLabel"), on);
		setVisibleProp(contentByName(app, "phoneLabel"), on);
		setVisibleProp(contentByName(app, "listPort"), !on);
	}

	tickMarquees(app: AppHost) {
		if (this.mode !== "look")
			return;
		for (const name of ["queryLabel", "glossLabel", "phoneLabel"]) {
			const port = contentByName(app, name);
			const b = asMarquee(port);
			if (b)
				b.tick(port as PortContent);
		}
	}

	paintLook(app: AppHost) {
		const n = this.hi - this.lo;
		const ready = lexCount() > 0;
		let word = "无词库";
		let gloss = "";
		let phone = "";
		if (ready && n > 0 && this.cursor >= this.lo && this.cursor < this.hi) {
			word = lexWord(this.cursor);
			gloss = lexGloss(this.cursor);
			phone = lexPhone(this.cursor);
		}
		else if (ready)
			word = "没有";
		let base = this.query || "查词";
		if (this.note && Date.now() < this.noteUntil)
			base = this.note;
		else if (n > 0)
			base = (this.query || "查词") + " " + (this.cursor - this.lo + 1) + "/" + n;
		setMarqueeText(contentByName(app, "queryLabel"), base);
		setStringProp(contentByName(app, "wordLabel"), word);
		setMarqueeText(contentByName(app, "glossLabel"), gloss);
		setMarqueeText(contentByName(app, "phoneLabel"), phone, phone ? phoneFace() : undefined);
	}

	paintHelp(app: AppHost) {
		const page = helpFor();
		const n = page.length;
		const vis = MENU_VISIBLE;
		let start = this.helpIndex;
		const max = n > vis ? n - vis : 0;
		if (start < 0)
			start = 0;
		if (start > max)
			start = max;
		this.helpIndex = start;
		const lines = [];
		for (let i = 0; i < vis; i++) {
			const row = page[start + i];
			if (row)
				lines.push({ text: row.key, right: row.action, selected: false });
		}
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (view)
			view.setList(port, helpTitle() + " " + (start + 1) + "/" + n, lines, "");
	}
}
