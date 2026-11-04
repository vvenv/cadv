/*
	Cardputer-Adv Moddable + TypeScript clock.
	7-seg Beijing time; top solar date/weekday; bottom lunar YMD.
	On-device Wi-Fi: W → SSID/password.
	Sound: S / H / -/= ; Countdown: C → HH:MM:SS → Enter.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import Timer from "timer";
import { CardputerKeyboard } from "keyboard";
import { connectAndSync, loadWifiCreds, saveWifiCreds, type WifiCreds } from "netboot";
import { ClockSound } from "sound";
import { formatSettings, loadSettings, saveSettings, VOL_MAX, VOL_MIN, type ClockSettings } from "settings";

type AppHost = {
	content: (name: string) => unknown;
};

const BEIJING_OFFSET_SEC = 8 * 3600;

const backgroundSkin = new Skin({ fill: "black" });
const titleStyle = new Style({ font: "12px Zpix", color: "white", horizontal: "center", vertical: "middle" });
const valueStyle = new Style({ font: "12px Zpix", color: "#39FF14", horizontal: "center", vertical: "middle" });
const subStyle = new Style({ font: "12px Zpix", color: "#888888", horizontal: "center", vertical: "middle" });

const ON = "#39FF14";
const OFF = "#143214";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const LM = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
const LD1 = ["日", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const LD2 = ["初", "十", "廿", "卅"];

const LUNAR_INFO: number[] = [
	0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
	0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
	0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
	0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
	0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
	0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
	0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
	0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
	0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
	0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
	0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
	0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
	0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
	0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
	0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
	0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
	0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
	0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
	0x0b273, 0x06930, 0x07240, 0x0f504, 0x0ab50, 0x05575, 0x06ad0, 0x095d0, 0x04ae3, 0x0a4d0,
	0x0d0b3, 0x0d250, 0x1d556, 0x0b540, 0x0b5a0, 0x195a6, 0x095b0, 0x049b0, 0x0a974, 0x0a4b0,
	0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, 0x04af5, 0x04970, 0x064b0, 0x074a3,
];

const SEG: number[] = [
	0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011,
	0b1011011, 0b1011111, 0b1110000, 0b1111111, 0b1111011,
];

type Mode = "clock" | "ssid" | "pass" | "busy" | "cd_edit" | "cd_run" | "cd_done";

function pad2(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

function formatHMS(totalSec: number): string {
	let t = totalSec | 0;
	if (t < 0)
		t = 0;
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = t % 60;
	return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
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

function beijingParts(): { y: number; m: number; d: number; w: number; hh: number; mm: number; ss: number } {
	const ms = Date.now() + BEIJING_OFFSET_SEC * 1000;
	const t = new Date(ms);
	return {
		y: t.getUTCFullYear(),
		m: t.getUTCMonth() + 1,
		d: t.getUTCDate(),
		w: t.getUTCDay(),
		hh: t.getUTCHours(),
		mm: t.getUTCMinutes(),
		ss: t.getUTCSeconds(),
	};
}

function timeSynced(): boolean {
	return beijingParts().y >= 2020;
}

function formatNow(): string {
	const p = beijingParts();
	return `${pad2(p.hh)}:${pad2(p.mm)}:${pad2(p.ss)}`;
}

function formatDate(): string {
	if (!timeSynced())
		return "等待对时";
	const p = beijingParts();
	return `${p.y}年${p.m}月${p.d}日 周${WEEKDAYS[p.w]}`;
}

function leapMonth(y: number): number {
	return LUNAR_INFO[y - 1900] & 0xf;
}
function leapDays(y: number): number {
	if (leapMonth(y))
		return (LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29;
	return 0;
}
function monthDays(y: number, m: number): number {
	return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29;
}
function yearDays(y: number): number {
	let sum = 348;
	for (let i = 0x8000; i > 0x8; i >>= 1)
		sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
	return sum + leapDays(y);
}
function solarOffset(y: number, m: number, d: number): number {
	const monthDaysGreg = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	let n = 0;
	for (let i = 1900; i < y; i++)
		n += ((i % 4 === 0 && i % 100 !== 0) || (i % 400 === 0)) ? 366 : 365;
	for (let i = 1; i < m; i++) {
		n += monthDaysGreg[i];
		if (i === 2 && ((y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0)))
			n += 1;
	}
	return n + d - 31;
}
function lunarDayName(day: number): string {
	switch (day) {
		case 10: return "初十";
		case 20: return "二十";
		case 30: return "三十";
		default: return LD2[Math.floor(day / 10)] + LD1[day % 10];
	}
}
function formatLunar(): string {
	const p = beijingParts();
	if (!timeSynced())
		return "W=WiFi";
	if (p.y < 1900 || p.y > 2100 || LUNAR_INFO.length <= p.y - 1900)
		return "农历—";
	let offset = solarOffset(p.y, p.m, p.d);
	let ly = 1900;
	for (; ly < 2101 && offset >= 0; ly++) {
		const yd = yearDays(ly);
		if (offset < yd)
			break;
		offset -= yd;
	}
	const leap = leapMonth(ly);
	let isLeap = false;
	let lm = 1;
	for (; lm < 13 && offset >= 0; lm++) {
		let days: number;
		if (leap > 0 && lm === leap + 1 && !isLeap) {
			lm -= 1;
			days = leapDays(ly);
			isLeap = true;
		}
		else {
			days = monthDays(ly, lm);
		}
		if (offset < days)
			break;
		offset -= days;
		if (isLeap && lm === leap)
			isLeap = false;
	}
	const ld = offset + 1;
	const ganZhi = GAN[(ly - 4) % 10] + ZHI[(ly - 4) % 12];
	const monthStr = (isLeap ? "闰" : "") + LM[lm - 1] + "月";
	return `${ganZhi}年${monthStr}${lunarDayName(ld)}`;
}

function hbar(port: PortContent, x: number, y: number, w: number, t: number, on: boolean) {
	port.fillColor(on ? ON : OFF, x + t, y, w - 2 * t, t);
}
function vbar(port: PortContent, x: number, y: number, h: number, t: number, on: boolean) {
	port.fillColor(on ? ON : OFF, x, y + t, t, h - 2 * t);
}
function drawSegMask(port: PortContent, x: number, y: number, w: number, h: number, mask: number) {
	const t = Math.max(3, Math.floor(Math.min(w, h) / 8));
	const mid = y + Math.floor((h - t) / 2);
	const m = mask | 0;
	hbar(port, x, y, w, t, !!(m & 0b1000000));
	vbar(port, x + w - t, y, mid - y + t, t, !!(m & 0b0100000));
	vbar(port, x + w - t, mid, y + h - mid, t, !!(m & 0b0010000));
	hbar(port, x, y + h - t, w, t, !!(m & 0b0001000));
	vbar(port, x, mid, y + h - mid, t, !!(m & 0b0000100));
	vbar(port, x, y, mid - y + t, t, !!(m & 0b0000010));
	hbar(port, x, mid, w, t, !!(m & 0b0000001));
}
function drawDigit(port: PortContent, x: number, y: number, w: number, h: number, digit: number) {
	drawSegMask(port, x, y, w, h, SEG[digit] | 0);
}
function drawColon(port: PortContent, x: number, y: number, w: number, h: number, on: boolean) {
	const s = Math.max(3, Math.floor(Math.min(w, h) / 7));
	const cx = x + Math.floor((w - s) / 2);
	port.fillColor(on ? ON : OFF, cx, y + Math.floor(h * 0.28), s, s);
	port.fillColor(on ? ON : OFF, cx, y + Math.floor(h * 0.62), s, s);
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

function faceFromPort(port: PortContent): string {
	const container = port.container;
	if (container && typeof container === "object" && "behavior" in container) {
		const b = container.behavior;
		if (b && typeof b === "object" && "faceText" in b) {
			const fn = (b as { faceText?: unknown }).faceText;
			if (typeof fn === "function")
				return (fn as () => string).call(b);
		}
	}
	return formatNow();
}

class SevenSegBehavior extends Behavior {
	string: string = "--:--:--";
	blink: boolean = true;

	onDisplaying(port: PortContent) {
		this.string = faceFromPort(port);
		this.blink = true;
		port.interval = 250;
		port.start();
		port.invalidate();
	}
	onTimeChanged(port: PortContent) {
		this.blink = !this.blink;
		this.string = faceFromPort(port);
		port.invalidate();
	}
	onDraw(port: PortContent) {
		const text = this.string;
		const n = text.length;
		const gap = 4;
		const colonW = 10;
		let units = 0;
		for (let i = 0; i < n; i++)
			units += text.charAt(i) === ":" ? colonW : 28;
		units += gap * (n - 1);
		let x = Math.floor((port.width - units) / 2);
		const y = 4;
		const digitH = port.height - 8;
		const digitW = 28;
		for (let i = 0; i < n; i++) {
			const ch = text.charAt(i);
			if (ch === ":") {
				drawColon(port, x, y, colonW, digitH, this.blink);
				x += colonW + gap;
			}
			else if (ch === "_" || ch === " ") {
				// blank placeholder; blink mid bar as caret when `_`
				drawSegMask(port, x, y, digitW, digitH, (ch === "_" && this.blink) ? 0b0000001 : 0);
				x += digitW + gap;
			}
			else {
				const d = ch.charCodeAt(0) - 48;
				drawDigit(port, x, y, digitW, digitH, (d >= 0 && d <= 9) ? d : 8);
				x += digitW + gap;
			}
		}
	}
}

class AppBehavior extends Behavior {
	mode: Mode = "clock";
	kb: CardputerKeyboard | null = null;
	sound: ClockSound | null = null;
	settings: ClockSettings = { sound: true, hourly: true, volume: 6 };
	kbTimer: unknown = null;
	labelTimer: unknown = null;
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

	faceText(): string {
		if (this.mode === "cd_edit")
			return this.cdSlotsText();
		if (this.mode === "cd_run" || this.mode === "cd_done")
			return formatHMS(this.cdRemainSec);
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

		this.flashStatus(app, `${this.kb.status} ${this.sound.status}`, formatSettings(this.settings));

		const creds = loadWifiCreds();
		if (creds)
			this.startNet(app, creds);
		else if (this.kb.available)
			this.enterPrompt(app, "ssid");
		else {
			this.setLabels(app, this.kb.status, "no WiFi cfg");
			this.showClock(app, true);
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

	/** Clear status overlay / ensure 7-seg + date/lunar are showing. */
	resumeClock(app: AppHost) {
		this.statusUntil = 0;
		this.mode = "clock";
		this.showClock(app, true);
		this.setLabels(app, formatDate(), formatLunar());
		const p = beijingParts();
		this.dateKey = timeSynced() ? `${p.y}-${p.m}-${p.d}` : "unsynced";
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

		const chars = stroke.chars;
		const wantWifi = chars.some(ch => ch === "w" || ch === "W");
		if (wantWifi && (this.mode === "clock" || this.mode === "busy")) {
			this.busy = false;
			this.enterPrompt(app, "ssid");
			return;
		}

		if (this.mode === "cd_run" || this.mode === "cd_done") {
			if (stroke.esc || chars.some(ch => ch === "c" || ch === "C")) {
				this.resumeClock(app);
				this.maybeBeep();
			}
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
			if (chars.some(ch => ch === "c" || ch === "C")) {
				this.enterCountdownEdit(app);
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
			else
				this.onClockTick(app);
		});
	}

	showClock(app: AppHost, on: boolean) {
		setVisibleProp(contentByName(app, "clockPort"), on);
		setVisibleProp(contentByName(app, "valueLabel"), !on);
	}

	setLabels(app: AppHost, top: string, bottom: string) {
		setStringProp(contentByName(app, "dateLabel"), top);
		setStringProp(contentByName(app, "lunarLabel"), bottom);
	}

	onClockTick(app: AppHost) {
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

		if (this.mode !== "clock")
			return;

		const p = beijingParts();

		// Second tick whenever sound is on (even while status flash shows).
		if (this.settings.sound && p.ss !== this.lastTickSec) {
			this.lastTickSec = p.ss;
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

		if (Date.now() < this.statusUntil)
			return;

		const key = timeSynced() ? `${p.y}-${p.m}-${p.d}` : "unsynced";
		if (key === this.dateKey)
			return;
		this.dateKey = key;
		this.setLabels(app, formatDate(), formatLunar());
	}
}

const HelloApplication = Application.template($ => ({
	skin: backgroundSkin,
	Behavior: AppBehavior,
	contents: [
		Label($, {
			name: "dateLabel",
			left: 0, right: 0, top: 2, height: 18,
			style: titleStyle,
			string: "",
		}),
		Port($, {
			name: "clockPort",
			left: 0, right: 0, top: 24, bottom: 22,
			Behavior: SevenSegBehavior,
		}),
		Label($, {
			name: "valueLabel",
			left: 0, right: 0, top: 24, bottom: 22,
			style: valueStyle,
			string: "",
			visible: false,
		}),
		Label($, {
			name: "lunarLabel",
			left: 0, right: 0, bottom: 2, height: 18,
			style: subStyle,
			string: "",
		}),
	],
}));

export default new HelloApplication(null, { displayListLength: 4096, touchCount: 0 });
