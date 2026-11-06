/*
	Application behavior: modes, keyboard, net, sound, weather.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import Timer from "timer";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { asMenu } from "menu-view";
import { menuDirFromChars, menuItems, menuStep } from "menu";
import { connectAndSync, loadWifiCreds, saveWifiCreds, type WifiCreds } from "netboot";
import { ClockSound } from "sound";
import { formatAlarm, formatSettings, loadSettings, saveSettings, VOL_MAX, VOL_MIN, type ClockSettings } from "settings";
import { fetchWeather, formatLunarWithWeather, weatherLabel, WEATHER_REFRESH_MS } from "weather";
import { beijingParts, formatClockTop, formatHMS, formatLunar, formatNow, pad2, timeSynced } from "lunar";
import { asMarquee, MARQUEE_MS, setMarqueeText } from "marquee";
import { WORD_LEVEL_NAME, bankCount, clampWordLevel, hiddenIndices, puzzleCorrect, renderPuzzle, wordAt, wordCount } from "words";

export type AppHost = {
	content: (name: string) => unknown;
};

type Mode = "clock" | "ssid" | "pass" | "busy" | "cd_edit" | "cd_run" | "cd_done" | "al_edit" | "al_ring" | "menu" | "word";

const WORD_HOLD_MS = 700;

let valueStyleSmall: object | undefined;
let valueStyleWord: object | undefined;
let valueStyleFit: object | undefined;

function valueStyle(word: boolean): object {
	if (word) {
		if (!valueStyleWord)
			valueStyleWord = new Style({ font: "48px Word", color: "#39FF14", horizontal: "center", vertical: "middle" });
		return valueStyleWord;
	}
	if (!valueStyleSmall)
		valueStyleSmall = new Style({ font: "12px Zpix", color: "#39FF14", horizontal: "center", vertical: "middle" });
	return valueStyleSmall;
}

/** 48px fits at most 7 letters in 240px. Longer headwords use 20px. */
function puzzleStyle(letters: number): object {
	if (letters > 7) {
		if (!valueStyleFit)
			valueStyleFit = new Style({ font: "20px UI", color: "#39FF14", horizontal: "center", vertical: "middle" });
		return valueStyleFit;
	}
	return valueStyle(true);
}

function hasStyle(target: unknown): target is { style: object } {
	return !!target && typeof target === "object" && "style" in target;
}

/** Desktop simulator keys. Hardware polling owns the keypad when it is up. */
function hostStroke(key: string): KeyStroke | null {
	if (key === "\r" || key === "\n")
		return { chars: [], enter: true, del: false, shift: false, esc: false, up: false, down: false };
	if (key === "\u001b")
		return { chars: [], enter: false, del: false, shift: false, esc: true, up: false, down: false };
	if (key === "\u007f" || key === "\b")
		return { chars: [], enter: false, del: true, shift: false, esc: false, up: false, down: false };
	if (key === "\uf700")
		return { chars: [], enter: false, del: false, shift: false, esc: false, up: true, down: false };
	if (key === "\uf701")
		return { chars: [], enter: false, del: false, shift: false, esc: false, up: false, down: true };
	if (key.length === 1 && key >= " " && key <= "~")
		return { chars: [key], enter: false, del: false, shift: false, esc: false, up: false, down: false };
	return null;
}

/** Digits-only field; empty → 0. */
function parseFieldDigits(raw: string, max: number): number | null {
	const s = raw.trim();
	if (!s.length)
		return 0;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c < 48 || c > 57)
			return null;
	}
	const n = parseInt(s, 10);
	if (n !== n || n < 0 || n > max)
		return null;
	return n;
}

function contentByName(app: AppHost, name: string): unknown {
	return app.content(name);
}

function setStringProp(target: unknown, value: string) {
	if (target && typeof target === "object" && "string" in target)
		(target as { string: string }).string = value;
}

function setVisibleProp(target: unknown, value: boolean) {
	if (target && typeof target === "object" && "visible" in target)
		(target as { visible: boolean }).visible = value;
}

export class AppBehavior extends Behavior {
	mode: Mode = "clock";
	kb: CardputerKeyboard | null = null;
	sound: ClockSound | null = null;
	settings: ClockSettings = { sound: true, hourly: true, volume: 6, alarmOn: false, alarmHH: 7, alarmMM: 0, wordLevel: 0, wordBank: 0 };
	kbTimer: unknown = null;
	labelTimer: unknown = null;
	marqueeTimer: unknown = null;
	prompt = "";
	ssidDraft = "";
	maskPass = false;
	dateKey = "";
	busy = false;
	lastChimeKey = "";
	lastTickSec = -1;
	statusUntil = 0;
	cdEndMs = 0;
	cdRemainSec = 0;
	cdLastSec = -1;
	/** 0=hour 1=min 2=sec */
	cdStep = 0;
	cdHours = 0;
	cdMinutes = 0;
	/** Alarm edit: 0=hour 1=min */
	alStep = 0;
	alHours = 0;
	alMinutes = 0;
	lastAlarmKey = "";
	weatherTimer: unknown = null;
	weatherKey = "";
	menuIndex = 0;
	wordIndex = 0;
	wordTyped = "";
	wordHidden: number[] = [];
	wordMaskLevel = -1;
	wordNote = "";
	wordNoteUntil = 0;
	wordAdvance = false;
	/** Simulator Enter repeat would open the list and immediately activate. */
	hostEnterDown = false;

	faceText(): string {
		if (this.mode === "cd_edit")
			return this.cdSlotsText();
		if (this.mode === "al_edit")
			return this.alSlotsText();
		if (this.mode === "cd_run" || this.mode === "cd_done")
			return formatHMS(this.cdRemainSec);
		if (this.mode === "al_ring")
			return `${pad2(this.settings.alarmHH)}:${pad2(this.settings.alarmMM)}:00`;
		return formatNow();
	}

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.settings = loadSettings();
		this.kb = new CardputerKeyboard();
		this.sound = new ClockSound();
		this.sound.setVolume(this.settings.volume);
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.labelTimer = Timer.repeat(() => this.onClockTick(app), 250);
		this.marqueeTimer = Timer.repeat(() => this.tickMarquees(app), MARQUEE_MS);
		this.weatherTimer = Timer.repeat(() => this.refreshWeather(app, false), WEATHER_REFRESH_MS);

		this.flashStatus(app, `${this.kb.status} ${this.sound.status}`, formatSettings(this.settings));

		const creds = loadWifiCreds();
		if (creds)
			this.startNet(app, creds);
		else if (this.kb.available)
			this.enterPrompt(app, "ssid");
		else {
			this.setLabels(app, this.kb.status, "no WiFi cfg");
			this.showClock(app, true);
			this.refreshWeather(app, false);
		}
	}

	maybeBeep() {
		if (this.settings.sound)
			this.sound?.click();
	}

	flashStatus(app: AppHost, top: string, bottom: string) {
		this.setLabels(app, top, bottom);
		this.statusUntil = Date.now() + 1500;
	}

	clockLabelKey(): string {
		const p = beijingParts();
		const day = timeSynced() ? `${p.y}-${p.m}-${p.d}` : "unsynced";
		const wx = weatherLabel() || "-";
		if (!this.settings.alarmOn)
			return `${day}|off|${wx}`;
		return `${day}|A${this.settings.alarmHH}:${this.settings.alarmMM}|${wx}`;
	}

	paintClockLabels(app: AppHost) {
		this.setLabels(app, formatClockTop(this.settings), formatLunarWithWeather(formatLunar()));
		this.dateKey = this.clockLabelKey();
		this.weatherKey = weatherLabel();
	}

	/** Clear status overlay / ensure 7-seg + date/lunar are showing. */
	resumeClock(app: AppHost) {
		this.statusUntil = 0;
		this.mode = "clock";
		this.showClock(app, true);
		this.paintClockLabels(app);
	}

	onKeyboardTick(app: AppHost) {
		let stroke;
		try {
			stroke = this.kb?.poll() ?? null;
		}
		catch {
			return;
		}
		if (!stroke)
			return;
		this.handleStroke(app, stroke);
	}

	/** Simulator keyboard. Ignored when the TCA8418 keypad is present. */
	onKeyDown(content: unknown, key: unknown) {
		if (this.kb?.available)
			return;
		if (typeof key !== "string")
			return;
		if ((key === "\r" || key === "\n") && this.hostEnterDown)
			return;
		if (key === "\r" || key === "\n")
			this.hostEnterDown = true;
		const stroke = hostStroke(key);
		if (!stroke)
			return;
		this.handleStroke(content as AppHost, stroke);
	}

	onKeyUp(_content: unknown, key: unknown) {
		if (typeof key === "string" && (key === "\r" || key === "\n"))
			this.hostEnterDown = false;
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		const chars = stroke.chars;
		const wantWifi = chars.some(ch => ch === "w" || ch === "W");
		if (wantWifi && (this.mode === "clock" || this.mode === "busy")) {
			this.busy = false;
			this.enterPrompt(app, "ssid");
			return;
		}

		if (this.mode === "menu") {
			if (stroke.esc) {
				this.resumeClock(app);
				this.maybeBeep();
				return;
			}
			let dir: -1 | 0 | 1 = menuDirFromChars(chars);
			if (stroke.up)
				dir = -1;
			if (stroke.down)
				dir = 1;
			if (dir !== 0) {
				const n = menuItems(this.settings.sound, this.settings.hourly, this.settings.wordLevel, this.settings.wordBank).length;
				this.menuIndex = menuStep(this.menuIndex, n, dir);
				this.paintMenu(app);
				this.maybeBeep();
				return;
			}
			if (stroke.enter)
				this.activateMenu(app);
			return;
		}

		if (this.mode === "word") {
			this.onWordStroke(app, stroke);
			return;
		}

		if (this.mode === "cd_run" || this.mode === "cd_done") {
			if (stroke.esc || chars.some(ch => ch === "c" || ch === "C")) {
				this.resumeClock(app);
				this.maybeBeep();
			}
			return;
		}

		if (this.mode === "al_ring") {
			if (stroke.esc || stroke.enter || chars.some(ch => ch === "a" || ch === "A")) {
				this.resumeClock(app);
				this.maybeBeep();
			}
			return;
		}

		if (this.mode === "al_edit") {
			if (stroke.esc) {
				this.resumeClock(app);
				this.maybeBeep();
				return;
			}
			let typed = false;
			for (const ch of chars) {
				if (ch >= "0" && ch <= "9" && this.prompt.length < 2) {
					this.prompt += ch;
					typed = true;
				}
			}
			if (stroke.del) {
				if (this.prompt.length > 0)
					this.prompt = this.prompt.slice(0, -1);
				else if (this.alStep > 0) {
					this.alStep = 0;
					this.prompt = String(this.alHours);
					if (this.prompt === "0")
						this.prompt = "";
				}
				else {
					// Del on empty hour → clear saved alarm
					this.settings.alarmOn = false;
					saveSettings(this.settings);
					this.resumeClock(app);
					this.flashStatus(app, "Alarm OFF", "A=set");
					this.maybeBeep();
					return;
				}
			}
			if (typed && this.prompt.length >= 2 && this.alStep === 0) {
				this.commitAlarmField(app);
				return;
			}
			if (stroke.enter) {
				this.commitAlarmField(app);
				return;
			}
			this.paintAlarmPrompt(app);
			return;
		}

		if (this.mode === "cd_edit") {
			if (stroke.esc) {
				this.resumeClock(app);
				this.maybeBeep();
				return;
			}
			let typed = false;
			for (const ch of chars) {
				if (ch >= "0" && ch <= "9" && this.prompt.length < 2) {
					this.prompt += ch;
					typed = true;
				}
			}
			if (stroke.del) {
				if (this.prompt.length > 0)
					this.prompt = this.prompt.slice(0, -1);
				else if (this.cdStep > 0) {
					this.cdStep -= 1;
					this.prompt = this.cdStep === 0
						? String(this.cdHours)
						: String(this.cdMinutes);
					if (this.prompt === "0")
						this.prompt = "";
				}
			}
			// HH/MM: 2 digits auto-advance. SS: need Enter to start.
			if (typed && this.prompt.length >= 2 && this.cdStep < 2) {
				this.commitCdField(app);
				return;
			}
			if (stroke.enter) {
				this.commitCdField(app);
				return;
			}
			this.paintCountdownPrompt(app);
			return;
		}

		if (this.mode === "clock" || this.mode === "busy") {
			// Esc dismisses Sound/Hourly/Vol status overlay → clock labels
			if (stroke.esc) {
				this.resumeClock(app);
				return;
			}
			if (this.mode === "clock" && stroke.enter) {
				this.enterMenu(app);
				return;
			}
			if (chars.some(ch => ch === "c" || ch === "C")) {
				this.enterCountdownEdit(app);
				this.maybeBeep();
				return;
			}
			if (chars.some(ch => ch === "a" || ch === "A")) {
				this.enterAlarmEdit(app);
				this.maybeBeep();
				return;
			}
			if (chars.some(ch => ch === "s" || ch === "S")) {
				this.settings.sound = !this.settings.sound;
				saveSettings(this.settings);
				this.flashStatus(app, "Sound", formatSettings(this.settings));
				this.maybeBeep();
				return;
			}
			if (chars.some(ch => ch === "h" || ch === "H")) {
				this.settings.hourly = !this.settings.hourly;
				saveSettings(this.settings);
				this.flashStatus(app, "Hourly", formatSettings(this.settings));
				this.maybeBeep();
				return;
			}
			// - / = (and +) adjust volume 0..10
			const volDown = chars.some(ch => ch === "-");
			const volUp = chars.some(ch => ch === "=" || ch === "+");
			if (volDown || volUp) {
				let v = this.settings.volume + (volUp ? 1 : -1);
				if (v < VOL_MIN)
					v = VOL_MIN;
				if (v > VOL_MAX)
					v = VOL_MAX;
				this.settings.volume = v;
				saveSettings(this.settings);
				this.sound?.setVolume(v);
				this.flashStatus(app, `Vol ${v}`, formatSettings(this.settings));
				this.maybeBeep();
				return;
			}
			if (chars.some(ch => ch === "t" || ch === "T")) {
				this.refreshWeather(app, true);
				this.maybeBeep();
				return;
			}
			return;
		}

		if (this.mode !== "ssid" && this.mode !== "pass")
			return;

		if (stroke.esc) {
			this.exitWifiPrompt(app);
			return;
		}

		for (const ch of chars)
			this.prompt += ch;
		if (stroke.del && this.prompt.length > 0)
			this.prompt = this.prompt.slice(0, -1);
		if (stroke.enter) {
			if (this.mode === "ssid") {
				this.ssidDraft = this.prompt;
				this.enterPrompt(app, "pass");
			}
			else {
				const creds: WifiCreds = { ssid: this.ssidDraft, password: this.prompt };
				saveWifiCreds(creds);
				this.startNet(app, creds);
			}
			return;
		}
		this.paintPrompt(app);
	}

	enterCountdownEdit(app: AppHost) {
		this.busy = false;
		this.statusUntil = 0;
		this.mode = "cd_edit";
		this.cdStep = 0;
		this.cdHours = 0;
		this.cdMinutes = 0;
		this.prompt = "";
		this.showClock(app, true);
		this.paintCountdownPrompt(app);
	}

	enterAlarmEdit(app: AppHost) {
		this.busy = false;
		this.statusUntil = 0;
		this.mode = "al_edit";
		this.alStep = 0;
		this.alHours = this.settings.alarmOn ? this.settings.alarmHH : 0;
		this.alMinutes = this.settings.alarmOn ? this.settings.alarmMM : 0;
		this.prompt = "";
		this.showClock(app, true);
		this.paintAlarmPrompt(app);
	}

	alSlotActive(): string {
		if (this.prompt.length <= 0)
			return "__";
		if (this.prompt.length === 1)
			return `${this.prompt}_`;
		return this.prompt.slice(0, 2);
	}

	alSlotsText(): string {
		const h = this.alStep > 0 ? pad2(this.alHours) : this.alSlotActive();
		const m = this.alStep === 1 ? this.alSlotActive() : "__";
		return `${h}:${m}`;
	}

	commitAlarmField(app: AppHost) {
		const max = this.alStep === 0 ? 23 : 59;
		const n = parseFieldDigits(this.prompt, max);
		if (n === null) {
			this.paintAlarmPrompt(app, "Bad");
			return;
		}
		if (this.alStep === 0) {
			this.alHours = n;
			this.alStep = 1;
			this.prompt = "";
			this.maybeBeep();
			this.paintAlarmPrompt(app);
			return;
		}
		this.settings.alarmOn = true;
		this.settings.alarmHH = this.alHours;
		this.settings.alarmMM = n;
		saveSettings(this.settings);
		this.resumeClock(app);
		this.flashStatus(app, formatAlarm(this.settings), "saved");
		this.maybeBeep();
	}

	paintAlarmPrompt(app: AppHost, err?: string) {
		const top = err ?? (this.settings.alarmOn ? formatAlarm(this.settings) : "设闹钟");
		const bottom = this.alStep === 0 ? "时 满2位/Del关 Esc" : "分 Enter=开 Esc";
		this.setLabels(app, top, bottom);
	}

	/** Active slot: digits + trailing `_`, empty → `__`. */
	cdSlotActive(): string {
		if (this.prompt.length <= 0)
			return "__";
		if (this.prompt.length === 1)
			return `${this.prompt}_`;
		return this.prompt.slice(0, 2);
	}

	/** Seven-seg face: `__:__:__` with filled HH:MM:SS as confirmed. */
	cdSlotsText(): string {
		const h = this.cdStep > 0 ? pad2(this.cdHours) : this.cdSlotActive();
		const m = this.cdStep > 1
			? pad2(this.cdMinutes)
			: (this.cdStep === 1 ? this.cdSlotActive() : "__");
		const s = this.cdStep === 2 ? this.cdSlotActive() : "__";
		return `${h}:${m}:${s}`;
	}

	/** Commit current HH/MM/SS slot; 2 digits auto-call this. */
	commitCdField(app: AppHost) {
		const max = this.cdStep === 0 ? 99 : 59;
		const n = parseFieldDigits(this.prompt, max);
		if (n === null) {
			this.paintCountdownPrompt(app, "Bad");
			return;
		}
		if (this.cdStep === 0) {
			this.cdHours = n;
			this.cdStep = 1;
			this.prompt = "";
			this.maybeBeep();
			this.paintCountdownPrompt(app);
			return;
		}
		if (this.cdStep === 1) {
			this.cdMinutes = n;
			this.cdStep = 2;
			this.prompt = "";
			this.maybeBeep();
			this.paintCountdownPrompt(app);
			return;
		}
		const total = this.cdHours * 3600 + this.cdMinutes * 60 + n;
		if (total <= 0) {
			this.paintCountdownPrompt(app, "Need >0");
			return;
		}
		this.startCountdown(app, total > 359999 ? 359999 : total);
	}

	paintCountdownPrompt(app: AppHost, err?: string) {
		const top = err ?? "时 分 秒";
		const bottom = this.cdStep < 2 ? "满2位跳下格 Esc" : "Enter=开始 Esc";
		this.setLabels(app, top, bottom);
	}

	startCountdown(app: AppHost, totalSec: number) {
		this.cdEndMs = Date.now() + totalSec * 1000;
		this.cdRemainSec = totalSec;
		this.cdLastSec = -1;
		this.mode = "cd_run";
		this.prompt = "";
		this.showClock(app, true);
		this.setLabels(app, "Countdown", "Esc=stop");
		this.maybeBeep();
	}

	enterPrompt(app: AppHost, which: "ssid" | "pass") {
		this.mode = which;
		this.prompt = which === "ssid" ? (loadWifiCreds()?.ssid ?? "") : "";
		this.maskPass = which === "pass";
		this.showClock(app, false);
		this.paintPrompt(app);
	}

	/** Cancel Wi-Fi editor; keep previous Preference. */
	exitWifiPrompt(app: AppHost) {
		this.mode = "clock";
		this.prompt = "";
		this.ssidDraft = "";
		this.dateKey = "";
		this.showClock(app, true);
		this.flashStatus(app, "WiFi cancel", "W=WiFi");
		this.maybeBeep();
	}

	paintPrompt(app: AppHost) {
		const title = this.mode === "ssid" ? "SSID" : "Password";
		const shown = this.maskPass ? "*".repeat(this.prompt.length) : this.prompt;
		this.setLabels(app, title, "OK/BS Esc=quit");
		setStringProp(contentByName(app, "valueLabel"), `${shown}_`);
	}

	startNet(app: AppHost, creds: WifiCreds) {
		if (this.busy)
			return;
		this.busy = true;
		this.mode = "busy";
		this.showClock(app, false);
		this.setLabels(app, "Connecting", creds.ssid);
		setStringProp(contentByName(app, "valueLabel"), "...");

		connectAndSync(creds, (msg) => {
			this.setLabels(app, msg, `${creds.ssid} W=edit`);
		}, (ok, detail) => {
			this.busy = false;
			this.mode = "clock";
			this.dateKey = "";
			this.showClock(app, true);
			if (!ok)
				this.setLabels(app, detail, "W=WiFi");
			else {
				this.onClockTick(app);
				this.refreshWeather(app, true);
			}
		});
	}

	refreshWeather(app: AppHost, force: boolean) {
		fetchWeather(force, (ok, detail) => {
			if (this.mode !== "clock")
				return;
			if (force) {
				this.flashStatus(app, ok ? "Weather" : "Wx fail", detail);
				if (ok)
					this.dateKey = "";
				return;
			}
			if (!ok || detail === this.weatherKey)
				return;
			this.dateKey = "";
			if (Date.now() < this.statusUntil)
				return;
			this.paintClockLabels(app);
		});
	}

	showClock(app: AppHost, on: boolean) {
		this.showList(app, false);
		const value = contentByName(app, "valueLabel");
		if (hasStyle(value))
			value.style = valueStyle(false);
		setVisibleProp(contentByName(app, "clockPort"), on);
		setVisibleProp(contentByName(app, "valueLabel"), !on);
	}

	showList(app: AppHost, on: boolean) {
		setVisibleProp(contentByName(app, "listPort"), on);
		if (on) {
			setVisibleProp(contentByName(app, "clockPort"), false);
			setVisibleProp(contentByName(app, "valueLabel"), false);
		}
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
		this.wordAdvance = false;
		this.statusUntil = 0;
		this.mode = "menu";
		this.showList(app, true);
		this.paintMenu(app);
		this.maybeBeep();
	}

	paintMenu(app: AppHost) {
		const items = menuItems(this.settings.sound, this.settings.hourly, this.settings.wordLevel, this.settings.wordBank);
		if (this.menuIndex < 0 || this.menuIndex >= items.length)
			this.menuIndex = 0;
		const lines = [];
		for (let i = 0; i < items.length; i++)
			lines.push({ text: items[i].label, selected: i === this.menuIndex });
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (view)
			view.setList(port, "功能", lines, `${this.menuIndex + 1}/${items.length}  j/k 选择 Enter Esc`);
	}

	activateMenu(app: AppHost) {
		const items = menuItems(this.settings.sound, this.settings.hourly, this.settings.wordLevel, this.settings.wordBank);
		const id = items[this.menuIndex] ? items[this.menuIndex].id : "";
		this.maybeBeep();
		if (id === "word") {
			this.enterWord(app);
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
		if (id === "cd") {
			this.enterCountdownEdit(app);
			return;
		}
		if (id === "al") {
			this.enterAlarmEdit(app);
			return;
		}
		if (id === "wx") {
			this.resumeClock(app);
			this.refreshWeather(app, true);
			return;
		}
		if (id === "wifi") {
			this.enterPrompt(app, "ssid");
			return;
		}
		if (id === "snd") {
			this.settings.sound = !this.settings.sound;
			saveSettings(this.settings);
			this.paintMenu(app);
			return;
		}
		if (id === "hour") {
			this.settings.hourly = !this.settings.hourly;
			saveSettings(this.settings);
			this.paintMenu(app);
		}
	}

	loadWord() {
		const n = wordCount(this.settings.wordBank);
		if (n <= 0)
			return;
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
		if (this.mode === "word") {
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
		if (this.mode === "word") {
			this.loadWord();
			this.paintWord(app);
			return;
		}
		this.paintMenu(app);
	}

	enterWord(app: AppHost) {
		this.wordAdvance = false;
		this.wordNote = "";
		this.mode = "word";
		if (this.wordHidden.length === 0 || this.wordMaskLevel !== clampWordLevel(this.settings.wordLevel))
			this.loadWord();
		this.showClock(app, false);
		const value = contentByName(app, "valueLabel");
		if (hasStyle(value))
			value.style = valueStyle(true);
		this.paintWord(app);
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
		if (!entry.word)
			return;
		const view = renderPuzzle(entry.word, this.wordHidden, this.wordTyped);
		const note = this.wordNote && Date.now() < this.wordNoteUntil ? this.wordNote : "";
		const level = WORD_LEVEL_NAME[clampWordLevel(this.settings.wordLevel)];
		const gloss = entry.gloss ? `${entry.gloss} ` : "";
		const top = note
			? `${gloss}${level} ${note}`
			: `${gloss}${level} ${this.wordIndex + 1}/${wordCount(this.settings.wordBank)}`;
		this.setLabels(app, top, "[]难度  \\换库  Del ,.换题  Enter Esc");
		const value = contentByName(app, "valueLabel");
		if (hasStyle(value))
			value.style = puzzleStyle(entry.word.length);
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
		if (stroke.enter) {
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

	tickWord(app: AppHost) {
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

	onClockTick(app: AppHost) {
		if (this.mode === "word") {
			this.tickWord(app);
			return;
		}
		if (this.mode === "menu")
			return;

		if (this.mode === "cd_run") {
			const left = Math.max(0, Math.ceil((this.cdEndMs - Date.now()) / 1000));
			this.cdRemainSec = left;
			if (left !== this.cdLastSec) {
				this.cdLastSec = left;
				this.setLabels(app, "Countdown", left > 0 ? "Esc=stop" : "Done Esc");
				if (this.settings.sound && left > 0)
					this.sound?.tick();
				if (left <= 0) {
					this.mode = "cd_done";
					if (this.settings.sound)
						this.sound?.hourlyChime();
				}
			}
			return;
		}

		if (this.mode === "cd_done") {
			this.cdRemainSec = 0;
			return;
		}

		if (this.mode === "al_ring") {
			return;
		}

		if (this.mode !== "clock")
			return;

		const p = beijingParts();

		// Per-second edge (alarm fires even if Snd off; ticks still need Snd).
		if (p.ss !== this.lastTickSec) {
			this.lastTickSec = p.ss;
			const alarmKey = `${p.y}-${p.m}-${p.d}-${p.hh}-${p.mm}`;
			const hitAlarm = timeSynced()
				&& this.settings.alarmOn
				&& p.hh === this.settings.alarmHH
				&& p.mm === this.settings.alarmMM
				&& p.ss === 0
				&& alarmKey !== this.lastAlarmKey;
			if (hitAlarm) {
				this.lastAlarmKey = alarmKey;
				this.mode = "al_ring";
				this.statusUntil = 0;
				this.showClock(app, true);
				this.setLabels(app, formatAlarm(this.settings), "Esc=关");
				this.sound?.alarmChime();
			}
			else if (this.settings.sound) {
				if (timeSynced() && this.settings.hourly && p.mm === 0 && p.ss === 0) {
					const chimeKey = `${p.y}-${p.m}-${p.d}-${p.hh}`;
					if (chimeKey !== this.lastChimeKey) {
						this.lastChimeKey = chimeKey;
						this.sound?.hourlyChime();
						this.flashStatus(app, `${pad2(p.hh)}:00`, "Hourly");
					}
				}
				else {
					this.sound?.tick();
				}
			}
		}

		if (Date.now() < this.statusUntil)
			return;

		const key = this.clockLabelKey();
		if (key === this.dateKey)
			return;
		this.paintClockLabels(app);
	}
}
