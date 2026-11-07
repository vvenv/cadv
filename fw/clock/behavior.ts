/*
	Application behavior: modes, keyboard, net, sound, weather.
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
import { connectAndSync, loadWifiCreds, saveWifiCreds, wifiRssi, type WifiCreds } from "netboot";
import { Power } from "power";
import { acceptStroke, titleWithPower } from "session";
import { openImu, type ImuHandle } from "imu";
import { searchCity, type CityHit } from "city";
import { Desk } from "desk";
import { poseRotation } from "pose";
import { alarmLine, cycleDays, dueAlarm, inQuiet, quietLabel } from "when";
import { ClockSound } from "sound";
import { formatAlarm, formatSettings, loadSettings, saveSettings, VOL_MAX, VOL_MIN, type ClockSettings } from "settings";
import { fetchWeather, formatLunarWithWeather, weatherLabel, WEATHER_REFRESH_MS } from "weather";
import { beijingParts, formatClockTop, formatHMS, formatLunar, formatNow, pad2, setManualClock, timeSynced } from "lunar";
import { asMarquee, MARQUEE_MS, setMarqueeText } from "marquee";
import { ON } from "ink";
import { contentByName, setVisibleProp, type AppHost } from "ui";

type Mode = "clock" | "ssid" | "pass" | "busy" | "cd_edit" | "cd_run" | "cd_done" | "al_edit" | "al_ring" | "alarms" | "hits" | "desk" | "menu" | "help";

/** One bright digit walking across four ghosts, then back. */
const NET_SPIN = ["8   ", " 8  ", "  8 ", "   8"];

function netSpinFace(now: number): string {
	const step = Math.floor(now / 250);
	const n = NET_SPIN.length;
	const phase = step % (n * 2 - 2);
	const i = phase < n ? phase : n * 2 - 2 - phase;
	return NET_SPIN[i];
}

function isShown(target: unknown): boolean {
	return !!target && typeof target === "object" && "visible" in target
		&& (target as { visible?: boolean }).visible !== false;
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

export class AppBehavior extends Behavior {
	mode: Mode = "clock";
	kb: CardputerKeyboard | null = null;
	sound: ClockSound | null = null;
	settings: ClockSettings = {
		sound: true, hourly: true, volume: 6,
		alarms: [
			{ on: false, hh: 7, mm: 0, days: 0x7f },
			{ on: false, hh: 8, mm: 0, days: 0x7f },
			{ on: false, hh: 9, mm: 0, days: 0x7f },
			{ on: false, hh: 12, mm: 0, days: 0x7f },
		],
		quietStart: -1, quietEnd: -1, cityName: "", cityLat: 25.7212, cityLon: 119.3841,
	};
	power: Power | null = null;
	desk = new Desk();
	imu: ImuHandle | null = null;
	alarmIndex = 0;
	snoozeAt = 0;
	snoozeIndex = -1;
	cityHits: CityHit[] = [];
	cityIndex = 0;
	rotation = 0;
	rssiText = "";
	kbTimer: unknown = null;
	labelTimer: unknown = null;
	marqueeTimer: unknown = null;
	prompt = "";
	ssidDraft = "";
	maskPass = false;
	dateKey = "";
	busy = false;
	/** Wi-Fi / NTP wait. 7-seg chases; labels stay on 正在连接 / 正在对时. */
	spinning = false;
	spinTitle = "";
	spinDetail = "";
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
	helpIndex = 0;
	helpTopicId = "clock";
	helpFrom: Mode = "clock";
	/** Simulator Enter repeat would open the list and immediately activate. */
	hostEnterDown = false;

	faceText(): string {
		if (this.spinning)
			return netSpinFace(Date.now());
		if (this.mode === "cd_edit")
			return this.cdSlotsText();
		if (this.mode === "al_edit")
			return this.alSlotsText();
		if (this.mode === "cd_run" || this.mode === "cd_done")
			return formatHMS(this.cdRemainSec);
		if (this.mode === "desk")
			return this.desk.face();
		if (this.mode === "al_ring") {
			const alarm = this.settings.alarms[this.snoozeIndex >= 0 ? this.snoozeIndex : this.alarmIndex];
			const hh = alarm ? alarm.hh : 0;
			const mm = alarm ? alarm.mm : 0;
			return `${pad2(hh)}:${pad2(mm)}:00`;
		}
		return formatNow();
	}

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.settings = loadSettings();
		this.power = new Power("dim");
		this.imu = openImu();
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
		return `${day}|${formatAlarm(this.settings)}|${wx}|${this.power?.short() ?? ""}|${this.rssiText}`;
	}

	paintClockLabels(app: AppHost) {
		const rssi = wifiRssi();
		this.rssiText = rssi === null ? "" : String(rssi);
		const tail = [this.power?.short() ?? "", this.rssiText].filter(part => part.length > 0).join(" ");
		this.setLabels(app, formatClockTop(this.settings, tail), formatLunarWithWeather(formatLunar()));
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
		let stroke: KeyStroke | null = null;
		try {
			stroke = this.kb?.poll() ?? null;
		}
		catch {
			return;
		}
		const power = this.power;
		if (power)
			stroke = acceptStroke(power, stroke, true);
		const note = power?.takeNote() ?? "";
		if (note && (this.mode === "clock" || this.mode === "desk"))
			this.flashStatus(app, note, "");
		this.applyPose(app);
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
		const power = this.power;
		const use = power ? acceptStroke(power, stroke, true) : stroke;
		const note = power?.takeNote() ?? "";
		const app = content as AppHost;
		if (note && (this.mode === "clock" || this.mode === "desk"))
			this.flashStatus(app, note, "");
		if (!use)
			return;
		this.handleStroke(app, use);
	}

	onKeyUp(_content: unknown, key: unknown) {
		if (typeof key === "string" && (key === "\r" || key === "\n"))
			this.hostEnterDown = false;
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (isLauncher(stroke)) {
			bootLauncher();
			return;
		}
		const chars = stroke.chars;
		if (isHelp(stroke) && this.mode !== "ssid" && this.mode !== "pass" && this.mode !== "help") {
			this.enterHelp(app);
			this.maybeBeep();
			return;
		}

		const wantWifi = chars.some(ch => ch === "w" || ch === "W");
		if (wantWifi && (this.mode === "clock" || this.mode === "busy")) {
			this.busy = false;
			this.spinning = false;
			this.enterPrompt(app, "ssid");
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
				this.resumeClock(app);
				this.maybeBeep();
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0) {
				const n = menuItems(this.settings.sound, this.settings.hourly, this.quietText()).length;
				this.menuIndex = menuStep(this.menuIndex, n, dir);
				this.paintMenu(app);
				this.maybeBeep();
				return;
			}
			if (isConfirm(stroke))
				this.activateMenu(app);
			return;
		}

		if (this.mode === "alarms") {
			this.onAlarms(app, stroke);
			return;
		}
		if (this.mode === "hits") {
			this.onHits(app, stroke);
			return;
		}
		if (this.mode === "desk") {
			this.onDesk(app, stroke);
			return;
		}

		if (this.mode === "cd_run" || this.mode === "cd_done") {
			if (isBack(stroke) || isConfirm(stroke) || chars.some(ch => ch === "c" || ch === "C")) {
				this.resumeClock(app);
				this.maybeBeep();
			}
			return;
		}

		if (this.mode === "al_ring") {
			if (isConfirm(stroke)) {
				this.snoozeAt = Date.now() + 5 * 60_000;
				this.snoozeIndex = this.alarmIndex;
				this.resumeClock(app);
				this.flashStatus(app, "贪睡 5 分", "");
				this.maybeBeep();
				return;
			}
			if (isBack(stroke) || chars.some(ch => ch === "a" || ch === "A")) {
				this.snoozeAt = 0;
				this.resumeClock(app);
				this.maybeBeep();
			}
			return;
		}

		if (this.mode === "al_edit") {
			if (isPageBack(stroke)) {
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
					const alarm = this.settings.alarms[this.alarmIndex];
					if (alarm) {
						alarm.on = false;
						alarm.days = 0;
					}
					saveSettings(this.settings);
					this.enterAlarms(app);
					this.flashStatus(app, "闹钟关", "");
					this.maybeBeep();
					return;
				}
			}
			if (typed && this.prompt.length >= 2 && this.alStep === 0) {
				this.commitAlarmField(app);
				return;
			}
			if (isConfirm(stroke)) {
				this.commitAlarmField(app);
				return;
			}
			this.paintAlarmPrompt(app);
			return;
		}

		if (this.mode === "cd_edit") {
			if (isPageBack(stroke)) {
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
				else {
					this.resumeClock(app);
					this.maybeBeep();
					return;
				}
			}
			// HH/MM: 2 digits auto-advance. SS: need Enter to start.
			if (typed && this.prompt.length >= 2 && this.cdStep < 2) {
				this.commitCdField(app);
				return;
			}
			if (isConfirm(stroke)) {
				this.commitCdField(app);
				return;
			}
			this.paintCountdownPrompt(app);
			return;
		}

		if (this.mode === "clock" || this.mode === "busy") {
			// Back dismisses Sound/Hourly/Vol status overlay → clock labels
			if (isBack(stroke)) {
				this.resumeClock(app);
				return;
			}
			if (this.mode === "clock" && isConfirm(stroke)) {
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
			const vol = volumeDelta(chars);
			if (vol !== 0) {
				let v = this.settings.volume + vol;
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

		if (isPageBack(stroke)) {
			this.exitWifiPrompt(app);
			return;
		}

		for (const ch of chars)
			this.prompt += ch;
		if (stroke.del) {
			if (this.prompt.length > 0)
				this.prompt = this.prompt.slice(0, -1);
			else if (this.mode === "pass") {
				this.mode = "ssid";
				this.prompt = this.ssidDraft;
				this.maskPass = false;
				this.paintPrompt(app);
				this.maybeBeep();
				return;
			}
			else {
				this.exitWifiPrompt(app);
				return;
			}
		}
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
		this.spinning = false;
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
		this.spinning = false;
		this.statusUntil = 0;
		this.mode = "al_edit";
		this.alStep = 0;
		const alarm = this.settings.alarms[this.alarmIndex];
		this.alHours = alarm ? alarm.hh : 0;
		this.alMinutes = alarm ? alarm.mm : 0;
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
		const alarm = this.settings.alarms[this.alarmIndex] ?? this.settings.alarms[0];
		alarm.on = true;
		alarm.hh = this.alHours;
		alarm.mm = n;
		if (!alarm.days)
			alarm.days = 0x7f;
		saveSettings(this.settings);
		this.enterAlarms(app);
		this.flashStatus(app, formatAlarm(this.settings), "saved");
		this.maybeBeep();
	}

	paintAlarmPrompt(app: AppHost, err?: string) {
		const top = err ?? ("闹钟 " + (this.alarmIndex + 1));
		this.setLabels(app, top, "");
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
		this.setLabels(app, top, "");
	}

	startCountdown(app: AppHost, totalSec: number) {
		this.cdEndMs = Date.now() + totalSec * 1000;
		this.cdRemainSec = totalSec;
		this.cdLastSec = -1;
		this.mode = "cd_run";
		this.prompt = "";
		this.showClock(app, true);
		this.setLabels(app, "倒计时", "");
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
		this.flashStatus(app, "WiFi cancel", "");
		this.maybeBeep();
	}

	paintPrompt(app: AppHost) {
		const title = this.mode === "ssid" ? "SSID" : "Password";
		const shown = this.maskPass ? "*".repeat(this.prompt.length) : this.prompt;
		const line = `${shown}_`;
		this.setLabels(app, title, "");
		setMarqueeText(contentByName(app, "valueLabel"), line, undefined, ON);
	}

	paintNet(app: AppHost, title: string) {
		this.spinTitle = title;
		this.showClock(app, true);
		this.setLabels(app, title, this.spinDetail);
		this.redrawClock(app);
	}

	redrawClock(app: AppHost) {
		const port = contentByName(app, "clockPort");
		if (!port || typeof port !== "object" || !("invalidate" in port))
			return;
		const invalidate = (port as { invalidate?: unknown }).invalidate;
		if (typeof invalidate === "function")
			(invalidate as (this: unknown) => void).call(port);
	}

	startNet(app: AppHost, creds: WifiCreds) {
		if (this.busy)
			return;
		this.busy = true;
		this.mode = "busy";
		this.spinning = true;
		this.spinDetail = creds.ssid;
		this.paintNet(app, "正在连接");

		connectAndSync(creds, (msg) => {
			if (!this.spinning)
				return;
			const title = msg.indexOf("NTP") === 0 ? "正在对时" : "正在连接";
			this.spinTitle = title;
			if (this.mode === "busy")
				this.setLabels(app, title, this.spinDetail);
		}, (ok, detail) => {
			this.spinning = false;
			this.busy = false;
			this.mode = "clock";
			this.dateKey = "";
			this.showClock(app, true);
			this.redrawClock(app);
			if (!ok)
				this.setLabels(app, detail, "");
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
		setVisibleProp(contentByName(app, "clockPort"), on);
		const value = contentByName(app, "valueLabel");
		setVisibleProp(value, !on);
		if (on)
			setMarqueeText(value, "");
	}

	showList(app: AppHost, on: boolean) {
		setVisibleProp(contentByName(app, "listPort"), on);
		if (on) {
			setVisibleProp(contentByName(app, "clockPort"), false);
			setVisibleProp(contentByName(app, "valueLabel"), false);
		}
	}

	setLabels(app: AppHost, top: string, bottom: string) {
		const titled = this.power ? titleWithPower(this.power, top) : top;
		setMarqueeText(contentByName(app, "dateLabel"), titled);
		setMarqueeText(contentByName(app, "lunarLabel"), bottom);
	}

	tickMarquees(app: AppHost) {
		for (const name of ["dateLabel", "lunarLabel", "valueLabel"]) {
			const port = contentByName(app, name);
			if (name === "valueLabel" && !isShown(port))
				continue;
			const b = asMarquee(port);
			if (b)
				b.tick(port as PortContent);
		}
	}

	enterMenu(app: AppHost) {
		this.statusUntil = 0;
		this.mode = "menu";
		this.showList(app, true);
		this.paintMenu(app);
		this.maybeBeep();
	}

	paintMenu(app: AppHost) {
		const items = menuItems(this.settings.sound, this.settings.hourly, this.quietText());
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
		this.statusUntil = 0;
		this.showList(app, true);
		this.paintHelp(app);
	}

	exitHelp(app: AppHost) {
		const from = this.helpFrom;
		this.mode = from;
		if (from === "menu") {
			this.showList(app, true);
			this.paintMenu(app);
			return;
		}
		if (from === "alarms") {
			this.showList(app, true);
			this.paintAlarms(app);
			return;
		}
		if (from === "hits") {
			this.showList(app, true);
			this.paintHits(app);
			return;
		}
		if (from === "desk") {
			this.paintDesk(app);
			return;
		}
		if (from === "cd_edit") {
			this.showClock(app, true);
			this.paintCountdownPrompt(app);
			return;
		}
		if (from === "al_edit") {
			this.showClock(app, true);
			this.paintAlarmPrompt(app);
			return;
		}
		if (from === "ssid" || from === "pass") {
			this.showClock(app, false);
			this.paintPrompt(app);
			return;
		}
		if (from === "cd_run" || from === "cd_done") {
			this.showClock(app, true);
			this.setLabels(app, "倒计时", "");
			return;
		}
		if (from === "al_ring") {
			this.showClock(app, true);
			this.setLabels(app, formatAlarm(this.settings), "");
			return;
		}
		if (from === "busy") {
			if (this.spinning) {
				this.showClock(app, true);
				this.setLabels(app, this.spinTitle, this.spinDetail);
				this.redrawClock(app);
			}
			else
				this.showClock(app, false);
			return;
		}
		this.resumeClock(app);
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
		const items = menuItems(this.settings.sound, this.settings.hourly, this.quietText());
		const id = items[this.menuIndex] ? items[this.menuIndex].id : "";
		this.maybeBeep();
		if (id === "cd") {
			this.enterCountdownEdit(app);
			return;
		}
		if (id === "al") {
			this.enterAlarms(app);
			return;
		}
		if (id === "sw" || id === "pomo" || id === "cal" || id === "zone" || id === "city" || id === "manual" || id === "quiet") {
			this.enterDesk(app, id);
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

	advanceCountdown(app: AppHost, paint: boolean) {
		const left = Math.max(0, Math.ceil((this.cdEndMs - Date.now()) / 1000));
		this.cdRemainSec = left;
		if (left === this.cdLastSec)
			return;
		this.cdLastSec = left;
		if (paint)
			this.setLabels(app, "倒计时", "");
		if (this.settings.sound && left > 0)
			this.sound?.tick();
		if (left <= 0) {
			if (this.mode === "help")
				this.helpFrom = "cd_done";
			else
				this.mode = "cd_done";
			if (this.settings.sound)
				this.sound?.hourlyChime();
		}
	}

	onClockTick(app: AppHost) {
		if (this.mode === "desk" && this.desk.tick()) {
			this.sound?.alarmChime();
			this.paintDesk(app);
		}
		if (this.mode === "menu" || (this.mode === "help" && this.helpFrom === "menu"))
			return;

		if (this.mode === "cd_run" || (this.mode === "help" && this.helpFrom === "cd_run")) {
			this.advanceCountdown(app, this.mode === "cd_run");
			return;
		}

		if (this.mode === "cd_done") {
			this.cdRemainSec = 0;
			return;
		}

		if (this.mode === "al_ring") {
			return;
		}

		if (this.mode !== "clock" && this.mode !== "desk" && !(this.mode === "help" && this.helpFrom === "clock"))
			return;

		const p = beijingParts();

		// Per-second edge (alarm fires even if Snd off; ticks still need Snd).
		if (p.ss !== this.lastTickSec) {
			this.lastTickSec = p.ss;
			const alarmKey = `${p.y}-${p.m}-${p.d}-${p.hh}-${p.mm}`;
			const minute = p.hh * 60 + p.mm;
			const quiet = inQuiet(minute, this.settings.quietStart, this.settings.quietEnd);
			const hitIndex = dueAlarm(this.settings.alarms, p.w, p.hh, p.mm, p.ss);
			const snoozeDue = this.snoozeAt > 0 && Date.now() >= this.snoozeAt;
			const hitAlarm = timeSynced() && !quiet && hitIndex >= 0 && alarmKey !== this.lastAlarmKey;
			if (snoozeDue && !quiet) {
				this.snoozeAt = 0;
				this.alarmIndex = this.snoozeIndex >= 0 ? this.snoozeIndex : 0;
				this.ring(app);
			}
			else if (hitAlarm) {
				this.lastAlarmKey = alarmKey;
				this.alarmIndex = hitIndex;
				this.ring(app);
			}
			else if (this.settings.sound && !quiet) {
				if (timeSynced() && this.settings.hourly && p.mm === 0 && p.ss === 0) {
					const chimeKey = `${p.y}-${p.m}-${p.d}-${p.hh}`;
					if (chimeKey !== this.lastChimeKey) {
						this.lastChimeKey = chimeKey;
						this.sound?.hourlyChime();
						if (this.mode !== "help")
							this.flashStatus(app, `${pad2(p.hh)}:00`, "Hourly");
					}
				}
				else {
					this.sound?.tick();
				}
			}
		}

		if (this.mode === "desk") {
			this.paintDesk(app);
			return;
		}

		if (this.mode === "help" || Date.now() < this.statusUntil)
			return;

		const key = this.clockLabelKey();
		if (key === this.dateKey)
			return;
		this.paintClockLabels(app);
	}

	quietText(): string {
		return quietLabel(this.settings.quietStart, this.settings.quietEnd);
	}

	applyPose(_app: AppHost) {
		const sample = this.imu?.sample();
		if (!sample)
			return;
		const rot = poseRotation(sample.x, sample.y, sample.z);
		if (rot === null || rot === this.rotation)
			return;
		this.rotation = rot;
		const app = _app as AppHost & { rotation?: number };
		app.rotation = rot;
	}

	ring(app: AppHost) {
		if (this.mode === "help")
			this.helpFrom = "al_ring";
		else {
			this.mode = "al_ring";
			this.statusUntil = 0;
			this.showClock(app, true);
			this.setLabels(app, formatAlarm(this.settings), "Enter 贪睡");
		}
		this.sound?.alarmChime();
	}

	enterAlarms(app: AppHost) {
		this.mode = "alarms";
		this.statusUntil = 0;
		this.showList(app, true);
		this.paintAlarms(app);
	}

	paintAlarms(app: AppHost) {
		const lines = [];
		const alarms = this.settings.alarms;
		for (let i = 0; i < alarms.length; i++)
			lines.push({ text: alarmLine(i, alarms[i]), selected: i === this.alarmIndex });
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (view)
			view.setList(port, `闹钟 ${this.alarmIndex + 1}/${alarms.length}`, lines, "");
	}

	onAlarms(app: AppHost, stroke: KeyStroke) {
		if (isBack(stroke)) {
			this.resumeClock(app);
			this.maybeBeep();
			return;
		}
		const dir = navDir(stroke);
		if (dir !== 0) {
			this.alarmIndex = menuStep(this.alarmIndex, this.settings.alarms.length, dir);
			this.paintAlarms(app);
			this.maybeBeep();
			return;
		}
		if (isConfirm(stroke)) {
			this.enterAlarmEdit(app);
			return;
		}
		if (stroke.chars.some(ch => ch === "d" || ch === "D")) {
			const alarm = this.settings.alarms[this.alarmIndex];
			if (!alarm)
				return;
			alarm.days = cycleDays(alarm.days);
			alarm.on = alarm.days !== 0;
			saveSettings(this.settings);
			this.paintAlarms(app);
			this.maybeBeep();
		}
	}

	enterDesk(app: AppHost, name: "sw" | "pomo" | "cal" | "zone" | "city" | "manual" | "quiet") {
		const blocked = this.desk.enter(name);
		if (blocked) {
			this.resumeClock(app);
			this.flashStatus(app, blocked, "");
			return;
		}
		this.mode = "desk";
		this.statusUntil = 0;
		this.paintDesk(app);
	}

	paintDesk(app: AppHost) {
		const paint = this.desk.paint();
		if (paint.kind === "list") {
			this.showList(app, true);
			const port = contentByName(app, "listPort");
			const view = asMenu(port);
			if (view)
				view.setList(port, paint.title, paint.lines, "");
			return;
		}
		if (paint.kind === "text") {
			this.showClock(app, false);
			this.setLabels(app, paint.title, "");
			setMarqueeText(contentByName(app, "valueLabel"), paint.line, undefined, ON);
			return;
		}
		this.showClock(app, true);
		this.setLabels(app, paint.title, paint.bottom);
	}

	onDesk(app: AppHost, stroke: KeyStroke) {
		const result = this.desk.onStroke(stroke);
		if (result === "back") {
			this.resumeClock(app);
			this.maybeBeep();
			return;
		}
		if (result === "search") {
			this.lookupCity(app);
			return;
		}
		if (result === "manual") {
			const p = this.desk.manualParts();
			setManualClock(p.y, p.m, p.d, p.hh, p.mm);
			this.resumeClock(app);
			this.flashStatus(app, "已设", "");
			this.maybeBeep();
			return;
		}
		if (result === "quiet") {
			const q = this.desk.quietMinutes();
			this.settings.quietStart = q.start;
			this.settings.quietEnd = q.end;
			saveSettings(this.settings);
			this.resumeClock(app);
			this.flashStatus(app, quietLabel(q.start, q.end), "");
			this.maybeBeep();
			return;
		}
		this.paintDesk(app);
	}

	lookupCity(app: AppHost) {
		const query = this.desk.cityText.trim();
		this.mode = "busy";
		this.showClock(app, false);
		this.setLabels(app, "查询", query);
		searchCity(query, (hits, detail) => {
			if (!hits.length) {
				this.mode = "desk";
				this.paintDesk(app);
				this.flashStatus(app, detail || "没有", "");
				return;
			}
			this.cityHits = hits;
			this.cityIndex = 0;
			this.mode = "hits";
			this.showList(app, true);
			this.paintHits(app);
		});
	}

	paintHits(app: AppHost) {
		const lines = [];
		for (let i = 0; i < this.cityHits.length; i++)
			lines.push({ text: this.cityHits[i].name, selected: i === this.cityIndex });
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (view)
			view.setList(port, `城市 ${this.cityIndex + 1}/${this.cityHits.length}`, lines, "");
	}

	onHits(app: AppHost, stroke: KeyStroke) {
		if (isBack(stroke)) {
			this.mode = "desk";
			this.paintDesk(app);
			return;
		}
		const dir = navDir(stroke);
		if (dir !== 0) {
			this.cityIndex = menuStep(this.cityIndex, this.cityHits.length, dir);
			this.paintHits(app);
			return;
		}
		if (!isConfirm(stroke))
			return;
		const hit = this.cityHits[this.cityIndex];
		if (!hit)
			return;
		this.settings.cityName = hit.name;
		this.settings.cityLat = hit.lat;
		this.settings.cityLon = hit.lon;
		saveSettings(this.settings);
		this.resumeClock(app);
		this.flashStatus(app, hit.name, "");
		this.refreshWeather(app, true);
		this.maybeBeep();
	}
}
