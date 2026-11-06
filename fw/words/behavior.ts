/*
	Word-quiz behavior. Boots into the puzzle. Esc opens the function list.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import Timer from "timer";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { asMenu } from "menu-view";
import { helpFor, helpTitle, helpTopic } from "help";
import { MENU_VISIBLE, menuDirFromChars, menuStep } from "list";
import { menuItems } from "menu";
import { ClockSound } from "sound";
import { loadSettings, saveSettings, VOL_MAX, VOL_MIN, type WordSettings } from "settings";
import { asMarquee, MARQUEE_MS, setMarqueeText } from "marquee";
import { contentByName, setStringProp, setVisibleProp, type AppHost } from "ui";
import { WORD_LEVEL_NAME, bankCount, bankName, clampWordLevel, hiddenIndices, puzzleCorrect, renderPuzzle, wordAt, wordCount } from "words";

type Mode = "play" | "menu" | "help";

const WORD_HOLD_MS = 700;

let valueStyleWord: object | undefined;
let valueStyleFit: object | undefined;

/** Bold 48px fits 7 letters in 240px. Longer headwords use 20px. */
function puzzleStyle(letters: number): object {
	if (letters > 7) {
		if (!valueStyleFit)
			valueStyleFit = new Style({ font: "bold 20px UI", color: "#39FF14", horizontal: "center", vertical: "middle" });
		return valueStyleFit;
	}
	if (!valueStyleWord)
		valueStyleWord = new Style({ font: "bold 48px Word", color: "#39FF14", horizontal: "center", vertical: "middle" });
	return valueStyleWord;
}

function hasStyle(target: unknown): target is { style: object } {
	return !!target && typeof target === "object" && "style" in target;
}

export class AppBehavior extends Behavior {
	mode: Mode = "play";
	kb: CardputerKeyboard | null = null;
	sound: ClockSound | null = null;
	settings: WordSettings = { sound: true, volume: 6, wordLevel: 0, wordBank: 0 };
	kbTimer: unknown = null;
	tickTimer: unknown = null;
	marqueeTimer: unknown = null;
	menuIndex = 0;
	helpIndex = 0;
	helpTopicId = "play";
	helpFrom: Mode = "play";
	wordIndex = 0;
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
		this.kb = new CardputerKeyboard();
		this.sound = new ClockSound();
		this.sound.setVolume(this.settings.volume);
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.tickTimer = Timer.repeat(() => this.onTick(app), 250);
		this.marqueeTimer = Timer.repeat(() => this.tickMarquees(app), MARQUEE_MS);
		this.loadWord();
		this.showPlay(app);
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
		const chars = stroke.chars;
		if (chars.some(ch => ch === "?" || ch === "/")) {
			if (this.mode !== "help")
				this.enterHelp(app);
			return;
		}
		if (this.mode === "help") {
			if (stroke.esc || stroke.del) {
				this.exitHelp(app);
				this.maybeBeep();
				return;
			}
			let dir: -1 | 0 | 1 = menuDirFromChars(chars);
			if (stroke.up)
				dir = -1;
			if (stroke.down)
				dir = 1;
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
			if (stroke.esc || stroke.del) {
				this.showPlay(app);
				this.maybeBeep();
				return;
			}
			let dir: -1 | 0 | 1 = menuDirFromChars(chars);
			if (stroke.up)
				dir = -1;
			if (stroke.down)
				dir = 1;
			if (dir !== 0) {
				const n = menuItems(this.settings.sound, this.settings.wordLevel, this.settings.wordBank).length;
				this.menuIndex = menuStep(this.menuIndex, n, dir);
				this.paintMenu(app);
				this.maybeBeep();
				return;
			}
			if (stroke.enter)
				this.activateMenu(app);
			return;
		}
		if (chars.some(ch => ch === "-" || ch === "_")) {
			this.nudgeVolume(app, -1);
			return;
		}
		if (chars.some(ch => ch === "=" || ch === "+")) {
			this.nudgeVolume(app, 1);
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
		setVisibleProp(contentByName(app, "valueLabel"), true);
		this.paintWord(app);
	}

	showList(app: AppHost) {
		setVisibleProp(contentByName(app, "listPort"), true);
		setVisibleProp(contentByName(app, "valueLabel"), false);
	}

	setLabels(app: AppHost, top: string, bottom: string) {
		setMarqueeText(contentByName(app, "dateLabel"), top);
		setMarqueeText(contentByName(app, "lunarLabel"), bottom);
	}

	tickMarquees(app: AppHost) {
		for (const name of ["dateLabel", "lunarLabel"]) {
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
		const items = menuItems(this.settings.sound, this.settings.wordLevel, this.settings.wordBank);
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
			const text = page[start + i];
			if (text)
				lines.push({ text, selected: false });
		}
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (view)
			view.setList(port, `${helpTitle(this.helpTopicId)} ${start + 1}/${n}`, lines, "");
	}

	activateMenu(app: AppHost) {
		const items = menuItems(this.settings.sound, this.settings.wordLevel, this.settings.wordBank);
		const id = items[this.menuIndex] ? items[this.menuIndex].id : "";
		this.maybeBeep();
		if (id === "level") {
			this.setWordLevel(app, this.settings.wordLevel + 1);
			return;
		}
		if (id === "bank") {
			this.setWordBank(app, this.settings.wordBank + 1);
			return;
		}
		if (id === "snd") {
			this.settings.sound = !this.settings.sound;
			saveSettings(this.settings);
			this.paintMenu(app);
		}
	}

	loadWord() {
		const n = wordCount(this.settings.wordBank);
		if (n <= 0) {
			this.wordHidden = [];
			this.wordTyped = "";
			return;
		}
		if (this.wordIndex < 0 || this.wordIndex >= n)
			this.wordIndex = 0;
		const entry = wordAt(this.settings.wordBank, this.wordIndex);
		this.wordMaskLevel = clampWordLevel(this.settings.wordLevel);
		this.wordHidden = hiddenIndices(entry.word, this.wordIndex, this.wordMaskLevel);
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
		this.wordIndex = 0;
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
		const entry = wordAt(this.settings.wordBank, this.wordIndex);
		const note = this.wordNote && Date.now() < this.wordNoteUntil ? this.wordNote : "";
		const level = WORD_LEVEL_NAME[clampWordLevel(this.settings.wordLevel)];
		const n = wordCount(this.settings.wordBank);
		const top = !entry.word
			? "无词库"
			: note
				? `${level} ${note}`
				: `${level} ${this.wordIndex + 1}/${n}`;
		this.setLabels(app, top, entry.word ? bankName(this.settings.wordBank) : "");
		const value = contentByName(app, "valueLabel");
		if (hasStyle(value))
			value.style = puzzleStyle(entry.word ? entry.word.length : 0);
		const view = entry.word ? renderPuzzle(entry.word, this.wordHidden, this.wordTyped) : "";
		setStringProp(contentByName(app, "valueLabel"), view);
	}

	onWordStroke(app: AppHost, stroke: KeyStroke) {
		const chars = stroke.chars;
		if (stroke.esc) {
			if (this.wordAdvance) {
				this.wordAdvance = false;
				const n = wordCount(this.settings.wordBank);
				this.wordIndex = n > 0 ? (this.wordIndex + 1) % n : 0;
				this.loadWord();
			}
			this.enterMenu(app);
			return;
		}
		if (this.wordAdvance)
			return;
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
		const entry = wordAt(this.settings.wordBank, this.wordIndex);
		if (!entry.word)
			return;
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
		if (stroke.del && this.wordTyped.length > 0) {
			this.wordTyped = this.wordTyped.slice(0, -1);
			typed = true;
		}
		const filled = typed && this.wordTyped.length === this.wordHidden.length && this.wordHidden.length > 0;
		if (stroke.enter || filled) {
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
			this.wordAdvance = false;
			this.wordNote = "";
			const n = wordCount(this.settings.wordBank);
			this.wordIndex = n > 0 ? (this.wordIndex + 1) % n : 0;
			this.loadWord();
			this.paintWord(app);
			return;
		}
		this.wordNote = "";
		this.paintWord(app);
	}
}
