/*
	Word-quiz behavior. Boots into the puzzle.
	Empty Enter opens the function list. A partial answer confirms with Enter.
	Space toggles the top line between gloss and phonetic.
	BS, Esc, and ← delete one letter.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import Timer from "timer";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { asMenu } from "menu-view";
import { helpFor, helpTitle, helpTopic } from "help";
import { clampHelpIndex, helpList } from "help-ui";
import { bootLauncher } from "boot";
import { isBack, isConfirm, isHelp, isLauncher, isPageBack, navDir, volumeDelta } from "keys";
import { menuStep } from "list";
import { menuItems } from "menu";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { ClockSound } from "sound";
import { loadSettings, saveSettings, VOL_MAX, VOL_MIN, type WordSettings } from "settings";
import { asMarquee, MARQUEE_MS, setMarqueeMark, setMarqueeText } from "marquee";
import { FONT_UI, FONT_WORD, ON, noteGlyph, type Glyph } from "ink";
import { themeGeneration } from "theme";
import { contentByName, setStringProp, setVisibleProp, type AppHost } from "ui";
import { flushProgress, loadProgress, setDone, unfinishedFirst } from "progress";
import { WORD_LEVEL_NAME, bankCount, bankSignature, clampBank, clampWordLevel, hiddenIndices, listWordSources, puzzleCorrect, quizOrder, renderPuzzle, selectWordSource, wordAt, wordCount, wordSourceId, wordSourceLost } from "words";
import { SOURCE_FLASH } from "wordbank";

type Mode = "play" | "menu" | "help";

function isSpace(stroke: KeyStroke): boolean {
	for (let i = 0; i < stroke.chars.length; i++) {
		if (stroke.chars[i] === " ")
			return true;
	}
	return false;
}

/** Enter only. Space toggles gloss/phone on the play screen. */
function isEnter(stroke: KeyStroke): boolean {
	return stroke.enter;
}

function dayKey(): string {
	const t = new Date();
	const m = t.getMonth() + 1;
	const d = t.getDate();
	return t.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (d < 10 ? "0" + d : d);
}

function missSet(raw: string): Set<string> {
	const set = new Set<string>();
	for (const part of raw.split(",")) {
		if (part)
			set.add(part);
	}
	return set;
}

function addMiss(raw: string, word: string): string {
	const parts = raw ? raw.split(",").filter(part => part && part !== word) : [];
	parts.push(word);
	while (parts.length > 40)
		parts.shift();
	return parts.join(",");
}

function dropMiss(raw: string, word: string): string {
	if (!raw)
		return "";
	return raw.split(",").filter(part => part && part !== word).join(",");
}

const WORD_HOLD_MS = 700;

let valueStyleWord: object | undefined;
let valueStyleFit: object | undefined;
let valueStyleGen = -1;
let phoneFaceStyle: object | undefined;
let phoneFaceGen = -1;
let glossFaceStyle: object | undefined;
let glossFaceGen = -1;

function refreshValueStyles(): void {
	const gen = themeGeneration();
	if (valueStyleGen === gen && valueStyleWord && valueStyleFit)
		return;
	valueStyleFit = new Style({ font: FONT_UI, color: ON, horizontal: "center", vertical: "middle" });
	valueStyleWord = new Style({ font: FONT_WORD, color: ON, horizontal: "center", vertical: "middle" });
	valueStyleGen = gen;
}

/** Bold 48px fits 7 letters in 240px. Longer headwords use 20px. */
function puzzleStyle(letters: number): object {
	refreshValueStyles();
	return letters > 7 ? valueStyleFit! : valueStyleWord!;
}

/** Phonetic only. Arial Bold; Source Han has no IPA. */
function phoneFace(): object {
	const gen = themeGeneration();
	if (!phoneFaceStyle || phoneFaceGen !== gen) {
		phoneFaceStyle = new Style({ font: "bold 20px Ipa", color: ON, horizontal: "left", vertical: "middle" });
		phoneFaceGen = gen;
	}
	return phoneFaceStyle;
}

/** Top-line gloss. Same UI face, bright ink for the taller band. */
function glossFace(): object {
	const gen = themeGeneration();
	if (!glossFaceStyle || glossFaceGen !== gen) {
		glossFaceStyle = new Style({ font: FONT_UI, color: ON, horizontal: "left", vertical: "middle" });
		glossFaceGen = gen;
	}
	return glossFaceStyle;
}

function hasStyle(target: unknown): target is { style: object } {
	return !!target && typeof target === "object" && "style" in target;
}

export class AppBehavior extends Behavior {
	mode: Mode = "play";
	kb: CardputerKeyboard | null = null;
	sound: ClockSound | null = null;
	power: Power | null = null;
	settings: WordSettings = {
		sound: true,
		volume: 6,
		wordLevel: 0,
		wordBank: 0,
		wordSource: SOURCE_FLASH,
		shuffle: false,
		phone: true,
		onlyMiss: false,
		misses: "",
		streak: 0,
		today: 0,
		todayKey: "",
	};
	sessionOk = 0;
	sessionBad = 0;
	kbTimer: unknown = null;
	tickTimer: unknown = null;
	marqueeTimer: unknown = null;
	menuIndex = 0;
	helpIndex = 0;
	helpTopicId = "play";
	helpFrom: Mode = "play";
	/** Position in the current quiz sequence. */
	wordIndex = 0;
	/** Lex indexes for the current bank / shuffle setting. */
	wordOrder: number[] = [];
	wordTyped = "";
	wordHidden: number[] = [];
	wordMaskLevel = -1;
	wordNote = "";
	wordNoteUntil = 0;
	wordAdvance = false;
	/** Play screen: false = gloss, true = phonetic. */
	showPhone = false;
	hostEnterDown = false;
	/** Last check failed; the wrong tail is cleared on the next letter or when the flash ends. */
	wordWrong = false;
	/** wordSourceLost() seen last; a change means the SD pack was dropped. */
	sourceLost = 0;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.settings = loadSettings();
		/*
			Card pack missing this boot: run on flash without touching the saved
			wordSource / wordBank, so the next boot with the card goes back to it.
		*/
		if (!selectWordSource(this.settings.wordSource, false))
			selectWordSource(SOURCE_FLASH, false);
		this.sourceLost = wordSourceLost();
		this.power = new Power("blank");
		this.kb = new CardputerKeyboard();
		this.sound = new ClockSound();
		this.sound.setVolume(this.settings.volume);
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.tickTimer = Timer.repeat(() => this.onTick(app), 250);
		this.marqueeTimer = Timer.repeat(() => this.tickMarquees(app), MARQUEE_MS);
		this.rebuildOrder();
		this.loadWord();
		this.showPlay(app);
	}

	menuList() {
		const s = this.settings;
		return menuItems(s.sound, s.wordLevel, s.wordBank, wordSourceId(), s.shuffle, s.phone, s.onlyMiss);
	}

	lexIndex(): number {
		const order = this.wordOrder;
		if (this.wordIndex >= 0 && this.wordIndex < order.length)
			return order[this.wordIndex];
		return 0;
	}

	rebuildOrder(keepLex = -1) {
		const n = wordCount(this.settings.wordBank);
		loadProgress(wordSourceId(), clampBank(this.settings.wordBank), n, () => bankSignature(this.settings.wordBank));
		const salt = Date.now() + this.settings.wordBank * 131 + (this.settings.shuffle ? 1 : 0);
		let order = quizOrder(n, this.settings.shuffle, salt);
		if (this.settings.onlyMiss) {
			const miss = missSet(this.settings.misses);
			order = order.filter(index => miss.has(wordAt(this.settings.wordBank, index).word.toLowerCase()));
		}
		this.wordOrder = unfinishedFirst(order);
		if (keepLex >= 0 && n > 0) {
			for (let i = 0; i < this.wordOrder.length; i++) {
				if (this.wordOrder[i] === keepLex) {
					this.wordIndex = i;
					return;
				}
			}
		}
		this.wordIndex = 0;
	}

	onKeyboardTick(app: AppHost) {
		const kb = this.kb;
		if (!kb)
			return;
		const raw = kb.poll();
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const note = this.power?.takeNote() ?? "";
		if (note) {
			this.wordNote = note;
			this.wordNoteUntil = Date.now() + 700;
			if (this.mode === "play")
				this.paintWord(app);
		}
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
		const note = this.power?.takeNote() ?? "";
		if (note) {
			this.wordNote = note;
			this.wordNoteUntil = Date.now() + 700;
			if (this.mode === "play")
				this.paintWord(app);
		}
		if (use)
			this.handleStroke(app, use);
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
		if (isHelp(stroke) && this.mode !== "help") {
			this.enterHelp(app);
			this.maybeBeep();
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke)) {
				this.exitHelp(app);
				this.maybeBeep();
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0) {
				const next = clampHelpIndex(this.helpIndex + dir, helpFor(this.helpTopicId).length);
				if (next !== this.helpIndex) {
					this.helpIndex = next;
					this.paintHelp(app);
					this.maybeBeep();
				}
			}
			return;
		}
		if (this.mode === "menu") {
			if (isBack(stroke)) {
				this.showPlay(app);
				this.maybeBeep();
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0) {
				const n = this.menuList().length;
				this.menuIndex = menuStep(this.menuIndex, n, dir);
				this.paintMenu(app);
				this.maybeBeep();
				return;
			}
			if (isConfirm(stroke))
				this.activateMenu(app);
			return;
		}
		const vol = volumeDelta(stroke.chars);
		if (vol !== 0) {
			this.nudgeVolume(app, vol);
			return;
		}
		this.onWordStroke(app, stroke);
	}

	maybeBeep() {
		if (this.settings.sound)
			this.sound?.click();
	}

	nudgeVolume(app: AppHost, delta: number) {
		let v = this.settings.volume + delta;
		if (v < VOL_MIN)
			v = VOL_MIN;
		if (v > VOL_MAX)
			v = VOL_MAX;
		if (v === this.settings.volume)
			return;
		this.settings.volume = v;
		saveSettings(this.settings);
		this.sound?.setVolume(v);
		this.maybeBeep();
		if (this.mode === "play") {
			this.wordNote = "音量 " + v;
			this.wordNoteUntil = Date.now() + 700;
			this.paintWord(app);
		}
	}

	showPlay(app: AppHost) {
		this.mode = "play";
		setVisibleProp(contentByName(app, "listPort"), false);
		setVisibleProp(contentByName(app, "puzzleLabel"), true);
		this.paintWord(app);
	}

	showList(app: AppHost) {
		setVisibleProp(contentByName(app, "listPort"), true);
		setVisibleProp(contentByName(app, "puzzleLabel"), false);
	}

	setTopLine(app: AppHost, text: string, face?: object, mark: Glyph = "", level?: number) {
		const g = mark ? { kind: mark, level } : titleGlyph(this.power);
		if (g.kind && !text) {
			setMarqueeMark(contentByName(app, "glossLabel"), g.kind, g.level);
			return;
		}
		setMarqueeText(contentByName(app, "glossLabel"), text, face, undefined, undefined, undefined, g.kind, g.level);
	}

	tickMarquees(app: AppHost) {
		const port = contentByName(app, "glossLabel");
		const b = asMarquee(port);
		if (b)
			b.tick(port as PortContent);
	}

	enterMenu(app: AppHost) {
		this.mode = "menu";
		this.showList(app);
		this.paintMenu(app);
		this.maybeBeep();
	}

	paintMenu(app: AppHost) {
		const items = this.menuList();
		if (this.menuIndex < 0 || this.menuIndex >= items.length)
			this.menuIndex = 0;
		const lines = [];
		for (let i = 0; i < items.length; i++)
			lines.push({ text: items[i].label, selected: i === this.menuIndex, glyph: items[i].glyph });
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		const g = titleGlyph(this.power);
		if (view)
			view.setList(port, `功能 ${this.menuIndex + 1}/${items.length}`, lines, "", g.kind, g.level);
	}

	enterHelp(app: AppHost) {
		if (this.mode === "help")
			return;
		this.helpFrom = this.mode;
		this.helpTopicId = helpTopic(this.mode);
		this.helpIndex = 0;
		this.mode = "help";
		this.showList(app);
		this.paintHelp(app);
	}

	exitHelp(app: AppHost) {
		if (this.helpFrom === "menu") {
			this.mode = "menu";
			this.showList(app);
			this.paintMenu(app);
			return;
		}
		this.showPlay(app);
	}

	paintHelp(app: AppHost) {
		const page = helpList(helpFor(this.helpTopicId), this, helpTitle(this.helpTopicId));
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (view)
			view.setList(port, page.title, page.lines, "");
	}

	activateMenu(app: AppHost) {
		const items = this.menuList();
		const id = items[this.menuIndex] ? items[this.menuIndex].id : "";
		this.maybeBeep();
		if (id === "source") {
			this.cycleWordSource(app);
			return;
		}
		if (id === "level") {
			this.setWordLevel(app, this.settings.wordLevel + 1);
			return;
		}
		if (id === "bank") {
			this.setWordBank(app, this.settings.wordBank + 1);
			return;
		}
		if (id === "shuffle") {
			this.settings.shuffle = !this.settings.shuffle;
			saveSettings(this.settings);
			this.rebuildOrder(this.lexIndex());
			this.paintMenu(app);
			return;
		}
		if (id === "phone") {
			this.settings.phone = !this.settings.phone;
			saveSettings(this.settings);
			this.paintMenu(app);
			return;
		}
		if (id === "miss") {
			this.settings.onlyMiss = !this.settings.onlyMiss;
			saveSettings(this.settings);
			this.rebuildOrder();
			this.wordTyped = "";
			this.wordNote = "";
			this.paintMenu(app);
			return;
		}
		if (id === "snd") {
			this.settings.sound = !this.settings.sound;
			saveSettings(this.settings);
			this.paintMenu(app);
		}
	}

	cycleWordSource(app: AppHost) {
		const sources = listWordSources();
		if (sources.length <= 0)
			return;
		const cur = wordSourceId();
		let at = 0;
		for (let i = 0; i < sources.length; i++) {
			if (sources[i].id === cur) {
				at = i;
				break;
			}
		}
		const next = sources[(at + 1) % sources.length];
		if (!selectWordSource(next.id))
			return;
		this.settings.wordSource = wordSourceId();
		this.settings.wordBank = 0;
		saveSettings(this.settings);
		this.rebuildOrder();
		this.wordAdvance = false;
		this.wordNote = "";
		this.wordHidden = [];
		this.wordMaskLevel = -1;
		if (this.mode === "play") {
			this.loadWord();
			this.paintWord(app);
			return;
		}
		this.paintMenu(app);
	}

	loadWord() {
		const n = this.wordOrder.length;
		if (n <= 0) {
			this.wordHidden = [];
			this.wordTyped = "";
			this.wordWrong = false;
			this.showPhone = false;
			return;
		}
		if (this.wordIndex < 0 || this.wordIndex >= n)
			this.wordIndex = 0;
		const lex = this.lexIndex();
		const entry = wordAt(this.settings.wordBank, lex);
		this.wordMaskLevel = clampWordLevel(this.settings.wordLevel);
		this.wordHidden = hiddenIndices(entry.word, lex, this.wordMaskLevel);
		this.wordTyped = "";
		this.wordWrong = false;
		this.showPhone = false;
	}

	setWordBank(app: AppHost, bank: number) {
		const count = bankCount();
		if (count <= 0)
			return;
		let b = (bank | 0) % count;
		if (b < 0)
			b += count;
		this.settings.wordBank = b;
		saveSettings(this.settings);
		this.rebuildOrder();
		this.wordAdvance = false;
		this.wordNote = "";
		this.wordHidden = [];
		this.wordMaskLevel = -1;
		if (this.mode === "play") {
			this.loadWord();
			this.paintWord(app);
			return;
		}
		this.paintMenu(app);
	}

	setWordLevel(app: AppHost, level: number) {
		const n = WORD_LEVEL_NAME.length;
		let lv = (level | 0) % n;
		if (lv < 0)
			lv += n;
		this.settings.wordLevel = lv;
		saveSettings(this.settings);
		this.wordAdvance = false;
		this.wordNote = "";
		if (this.mode === "play") {
			this.loadWord();
			this.paintWord(app);
			return;
		}
		this.paintMenu(app);
	}

	stepWord(app: AppHost, dir: -1 | 1) {
		const n = this.wordOrder.length;
		if (n <= 0)
			return;
		this.wordIndex = (this.wordIndex + dir + n) % n;
		this.wordAdvance = false;
		this.wordNote = "";
		this.loadWord();
		this.paintWord(app);
		this.maybeBeep();
	}

	paintWord(app: AppHost) {
		if (!this.wordOrder.length) {
			/* Misses are kept per headword across packs; say when they live elsewhere. */
			const top = wordCount(this.settings.wordBank) <= 0 ? "无词库" : (missSet(this.settings.misses).size > 0 ? "本词库无错题" : "无错题");
			this.setTopLine(app, top, glossFace());
			setStringProp(contentByName(app, "puzzleLabel"), "");
			return;
		}
		const entry = wordAt(this.settings.wordBank, this.lexIndex());
		const note = this.wordNote && Date.now() < this.wordNoteUntil ? this.wordNote : "";
		const value = contentByName(app, "puzzleLabel");
		if (hasStyle(value))
			value.style = puzzleStyle(entry.word ? entry.word.length : 0);
		const view = entry.word ? renderPuzzle(entry.word, this.wordHidden, this.wordTyped) : "";
		setStringProp(contentByName(app, "puzzleLabel"), view);
		const flash = note ? noteGlyph(note) : { kind: "" as Glyph };
		if (flash.kind === "ok" || flash.kind === "bad" || flash.kind === "bright" || flash.kind === "vol" || flash.kind === "mute") {
			this.setTopLine(app, "", undefined, flash.kind, flash.level);
			return;
		}
		let top = !entry.word ? "无词库" : (note || entry.gloss);
		let face = glossFace();
		if (!note && entry.word && this.showPhone && this.settings.phone) {
			top = entry.phone || entry.gloss;
			face = entry.phone ? phoneFace() : glossFace();
		}
		this.setTopLine(app, top, face);
	}

	advanceSolved(app: AppHost) {
		this.wordAdvance = false;
		this.wordNote = "";
		/* Miss drill: a solved word left the miss list, so drop it from this round too. */
		if (this.settings.onlyMiss && this.wordIndex >= 0 && this.wordIndex < this.wordOrder.length) {
			this.wordOrder.splice(this.wordIndex, 1);
			if (this.wordIndex >= this.wordOrder.length)
				this.wordIndex = 0;
			this.loadWord();
			this.paintWord(app);
			return;
		}
		const n = this.wordOrder.length;
		this.wordIndex = n > 0 ? (this.wordIndex + 1) % n : 0;
		this.loadWord();
		this.paintWord(app);
	}

	onWordStroke(app: AppHost, stroke: KeyStroke) {
		const chars = stroke.chars;
		if (this.wordAdvance) {
			if (isBack(stroke) || isEnter(stroke) || isConfirm(stroke))
				this.advanceSolved(app);
			return;
		}
		if (isSpace(stroke) && !stroke.enter) {
			if (this.settings.phone) {
				this.showPhone = !this.showPhone;
				this.paintWord(app);
				this.maybeBeep();
			}
			return;
		}
		if (chars.some(ch => ch === "[" || ch === "{")) {
			this.setWordLevel(app, this.settings.wordLevel - 1);
			this.maybeBeep();
			return;
		}
		if (chars.some(ch => ch === "]" || ch === "}")) {
			this.setWordLevel(app, this.settings.wordLevel + 1);
			this.maybeBeep();
			return;
		}
		if (chars.some(ch => ch === "\\" || ch === "|")) {
			this.setWordBank(app, this.settings.wordBank + 1);
			this.maybeBeep();
			return;
		}
		if (stroke.up || chars.some(ch => ch === ",")) {
			this.stepWord(app, -1);
			return;
		}
		if (stroke.down || chars.some(ch => ch === ".")) {
			this.stepWord(app, 1);
			return;
		}
		const entry = wordAt(this.settings.wordBank, this.lexIndex());
		if (!entry.word) {
			if (isEnter(stroke))
				this.enterMenu(app);
			return;
		}
		let typed = false;
		for (const ch of chars) {
			const c = ch.toLowerCase();
			if (c < "a" || c > "z")
				continue;
			if (this.wordWrong) {
				this.settleWrong(entry.word);
				typed = true;
			}
			if (this.wordTyped.length >= this.wordHidden.length)
				break;
			this.wordTyped += c;
			typed = true;
		}
		if ((stroke.del || isPageBack(stroke)) && this.wordWrong) {
			this.settleWrong(entry.word);
			typed = true;
		}
		else if ((stroke.del || isPageBack(stroke)) && this.wordTyped.length > 0) {
			this.wordTyped = this.wordTyped.slice(0, -1);
			typed = true;
		}
		/* Enter right after a miss would re-judge the same letters (and log another miss). */
		if (isEnter(stroke) && this.wordWrong && !typed) {
			this.settleWrong(entry.word);
			this.paintWord(app);
			return;
		}
		const filled = typed && this.wordTyped.length === this.wordHidden.length && this.wordHidden.length > 0;
		if (isEnter(stroke) || filled) {
			if (this.wordTyped.length === 0) {
				this.enterMenu(app);
				return;
			}
			if (puzzleCorrect(entry.word, this.wordHidden, this.wordTyped)) {
				this.wordNote = "ok";
				this.wordNoteUntil = Date.now() + WORD_HOLD_MS;
				this.wordAdvance = true;
				this.noteResult(entry.word, true);
				this.paintWord(app);
				this.maybeBeep();
			}
			else {
				this.wordNote = "bad";
				this.wordNoteUntil = Date.now() + WORD_HOLD_MS;
				this.wordWrong = true;
				this.noteResult(entry.word, false);
				this.paintWord(app);
			}
			return;
		}
		if (typed) {
			this.wordNote = "";
			this.paintWord(app);
		}
	}

	noteResult(word: string, ok: boolean) {
		const key = word.toLowerCase();
		const today = dayKey();
		if (this.settings.todayKey !== today) {
			this.settings.todayKey = today;
			this.settings.today = 0;
		}
		this.settings.today += 1;
		if (ok) {
			this.sessionOk += 1;
			this.settings.streak += 1;
			this.settings.misses = dropMiss(this.settings.misses, key);
			setDone(this.lexIndex(), true);
		}
		else {
			this.sessionBad += 1;
			this.settings.streak = 0;
			this.settings.misses = addMiss(this.settings.misses, key);
			setDone(this.lexIndex(), false);
		}
		flushProgress();
		saveSettings(this.settings);
	}

	onTick(app: AppHost) {
		const lost = wordSourceLost();
		if (lost !== this.sourceLost) {
			this.sourceLost = lost;
			this.onSourceLost(app);
			return;
		}
		if (this.mode !== "play")
			return;
		if (!this.wordNote || Date.now() < this.wordNoteUntil)
			return;
		if (this.wordAdvance) {
			this.advanceSolved(app);
			return;
		}
		this.wordNote = "";
		if (this.wordWrong)
			this.settleWrong(wordAt(this.settings.wordBank, this.lexIndex()).word);
		this.paintWord(app);
	}

	/** Keep the correct leading letters of a wrong answer; retype from the first mistake. */
	settleWrong(word: string) {
		this.wordWrong = false;
		let keep = 0;
		while (keep < this.wordTyped.length && keep < this.wordHidden.length && this.wordTyped.charAt(keep) === word.charAt(this.wordHidden[keep]))
			keep += 1;
		this.wordTyped = this.wordTyped.slice(0, keep);
		if (this.wordNote === "bad")
			this.wordNote = "";
	}

	/* SD pack failed mid-session; wordbank already fell back to flash. Saved choice is kept. */
	onSourceLost(app: AppHost) {
		this.rebuildOrder();
		this.wordAdvance = false;
		this.loadWord();
		this.wordNote = "读卡失败 已用内置";
		this.wordNoteUntil = Date.now() + 2000;
		if (this.mode === "play") {
			this.paintWord(app);
			return;
		}
		if (this.mode === "menu")
			this.paintMenu(app);
	}
}
