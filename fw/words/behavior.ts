/*
	Word-quiz behavior. Boots into the puzzle.
	Empty Enter/Space opens the function list. A partial answer confirms with Enter/Space.
	BS, Esc, and ← delete one letter.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import Timer from "timer";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { asMenu } from "menu-view";
import { helpFor, helpTitle, helpTopic } from "help";
import { bootLauncher } from "boot";
import { isBack, isConfirm, isHelp, isLauncher, isPageBack, navDir, volumeDelta } from "keys";
import { MENU_VISIBLE, menuStep } from "list";
import { menuItems } from "menu";
import { ClockSound } from "sound";
import { loadSettings, saveSettings, VOL_MAX, VOL_MIN, type WordSettings } from "settings";
import { asMarquee, MARQUEE_MS, setMarqueeText } from "marquee";
import { FONT_UI, FONT_WORD, INK, ON } from "ink";
import { contentByName, setStringProp, setVisibleProp, type AppHost } from "ui";
import { WORD_LEVEL_NAME, bankCount, clampWordLevel, hiddenIndices, listWordSources, puzzleCorrect, quizOrder, renderPuzzle, selectWordSource, wordAt, wordCount, wordSourceId } from "words";
import { SOURCE_FLASH } from "wordbank";

type Mode = "play" | "menu" | "help";

const WORD_HOLD_MS = 700;

let valueStyleWord: object | undefined;
let valueStyleFit: object | undefined;

/** Bold 48px fits 7 letters in 240px. Longer headwords use 20px. */
function puzzleStyle(letters: number): object {
	if (letters > 7) {
		if (!valueStyleFit)
			valueStyleFit = new Style({ font: FONT_UI, color: ON, horizontal: "center", vertical: "middle" });
		return valueStyleFit;
	}
	if (!valueStyleWord)
		valueStyleWord = new Style({ font: FONT_WORD, color: ON, horizontal: "center", vertical: "middle" });
	return valueStyleWord;
}

let phoneFaceStyle: object | undefined;

/** Bottom bar. Arial Bold; Source Han has no IPA. */
function phoneFace(): object {
	if (!phoneFaceStyle)
		phoneFaceStyle = new Style({ font: "bold 20px Ipa", color: INK, horizontal: "left", vertical: "middle" });
	return phoneFaceStyle;
}

function hasStyle(target: unknown): target is { style: object } {
	return !!target && typeof target === "object" && "style" in target;
}

export class AppBehavior extends Behavior {
	mode: Mode = "play";
	kb: CardputerKeyboard | null = null;
	sound: ClockSound | null = null;
	settings: WordSettings = {
		sound: true,
		volume: 6,
		wordLevel: 0,
		wordBank: 0,
		wordSource: SOURCE_FLASH,
		shuffle: false,
		phone: true,
	};
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
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.settings = loadSettings();
		const wantSource = this.settings.wordSource;
		if (!selectWordSource(wantSource))
			selectWordSource(SOURCE_FLASH);
		this.settings.wordSource = wordSourceId();
		if (this.settings.wordSource !== wantSource) {
			this.settings.wordBank = 0;
			saveSettings(this.settings);
		}
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
		return menuItems(s.sound, s.wordLevel, s.wordBank, s.wordSource, s.shuffle, s.phone);
	}

	lexIndex(): number {
		const order = this.wordOrder;
		if (this.wordIndex >= 0 && this.wordIndex < order.length)
			return order[this.wordIndex];
		return 0;
	}

	rebuildOrder(keepLex = -1) {
		const n = wordCount(this.settings.wordBank);
		const salt = Date.now() + this.settings.wordBank * 131 + (this.settings.shuffle ? 1 : 0);
		this.wordOrder = quizOrder(n, this.settings.shuffle, salt);
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
		const stroke = kb.poll();
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
		if (stroke)
			this.handleStroke(content as AppHost, stroke);
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
				const max = helpFor(this.helpTopicId).length - MENU_VISIBLE;
				let next = this.helpIndex + dir;
				if (next < 0)
					next = 0;
				if (max < 0)
					next = 0;
				else if (next > max)
					next = max;
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
		if (this.mode === "play")
			this.paintWord(app);
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

	setLabels(app: AppHost, top: string, bottom: string) {
		setMarqueeText(contentByName(app, "glossLabel"), top);
		setMarqueeText(contentByName(app, "phoneLabel"), bottom, bottom ? phoneFace() : undefined);
	}

	tickMarquees(app: AppHost) {
		for (const name of ["glossLabel", "phoneLabel"]) {
			const port = contentByName(app, name);
			const b = asMarquee(port);
			if (b)
				b.tick(port as PortContent);
		}
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
			lines.push({ text: items[i].label, selected: i === this.menuIndex });
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (view)
			view.setList(port, `功能 ${this.menuIndex + 1}/${items.length}`, lines, "");
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
		const page = helpFor(this.helpTopicId);
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
			view.setList(port, `${helpTitle(this.helpTopicId)} ${start + 1}/${n}`, lines, "");
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
		const n = wordCount(this.settings.wordBank);
		if (n <= 0) {
			this.wordHidden = [];
			this.wordTyped = "";
			return;
		}
		if (this.wordOrder.length !== n)
			this.rebuildOrder();
		if (this.wordIndex < 0 || this.wordIndex >= n)
			this.wordIndex = 0;
		const lex = this.lexIndex();
		const entry = wordAt(this.settings.wordBank, lex);
		this.wordMaskLevel = clampWordLevel(this.settings.wordLevel);
		this.wordHidden = hiddenIndices(entry.word, lex, this.wordMaskLevel);
		this.wordTyped = "";
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
		const n = wordCount(this.settings.wordBank);
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
		const entry = wordAt(this.settings.wordBank, this.lexIndex());
		const note = this.wordNote && Date.now() < this.wordNoteUntil ? this.wordNote : "";
		const top = !entry.word ? "无词库" : (note || entry.gloss);
		const bottom = entry.word && this.settings.phone ? entry.phone : "";
		this.setLabels(app, top, bottom);
		const value = contentByName(app, "puzzleLabel");
		if (hasStyle(value))
			value.style = puzzleStyle(entry.word ? entry.word.length : 0);
		const view = entry.word ? renderPuzzle(entry.word, this.wordHidden, this.wordTyped) : "";
		setStringProp(contentByName(app, "puzzleLabel"), view);
	}

	advanceSolved(app: AppHost) {
		this.wordAdvance = false;
		this.wordNote = "";
		const n = wordCount(this.settings.wordBank);
		this.wordIndex = n > 0 ? (this.wordIndex + 1) % n : 0;
		this.loadWord();
		this.paintWord(app);
	}

	onWordStroke(app: AppHost, stroke: KeyStroke) {
		const chars = stroke.chars;
		if (this.wordAdvance) {
			if (isBack(stroke) || isConfirm(stroke))
				this.advanceSolved(app);
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
			if (isConfirm(stroke))
				this.enterMenu(app);
			return;
		}
		let typed = false;
		for (const ch of chars) {
			const c = ch.toLowerCase();
			if (c < "a" || c > "z")
				continue;
			if (this.wordTyped.length >= this.wordHidden.length)
				break;
			this.wordTyped += c;
			typed = true;
		}
		if ((stroke.del || isPageBack(stroke)) && this.wordTyped.length > 0) {
			this.wordTyped = this.wordTyped.slice(0, -1);
			typed = true;
		}
		const filled = typed && this.wordTyped.length === this.wordHidden.length && this.wordHidden.length > 0;
		if (isConfirm(stroke) || filled) {
			if (this.wordTyped.length === 0) {
				this.enterMenu(app);
				return;
			}
			if (puzzleCorrect(entry.word, this.wordHidden, this.wordTyped)) {
				this.wordNote = "正确";
				this.wordNoteUntil = Date.now() + WORD_HOLD_MS;
				this.wordAdvance = true;
				this.paintWord(app);
				this.maybeBeep();
			}
			else {
				this.wordNote = "不对";
				this.wordNoteUntil = Date.now() + WORD_HOLD_MS;
				this.paintWord(app);
			}
			return;
		}
		if (typed) {
			this.wordNote = "";
			this.paintWord(app);
		}
	}

	onTick(app: AppHost) {
		if (this.mode !== "play")
			return;
		if (!this.wordNote || Date.now() < this.wordNoteUntil)
			return;
		if (this.wordAdvance) {
			this.advanceSolved(app);
			return;
		}
		this.wordNote = "";
		this.paintWord(app);
	}
}
