/*
	Cardputer-Adv Moddable + TypeScript hello.
	Clock: classic 7-segment, Beijing time (UTC+8 / CST).
	Top: solar date + weekday; bottom: lunar YMD.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";

// Beijing = UTC+8, no DST (format via UTC getters so host TZ cannot skew)
const BEIJING_OFFSET_SEC = 8 * 3600;

const backgroundSkin = new Skin({ fill: "black" });
const titleStyle = new Style({ font: "12px Zpix", color: "white", horizontal: "center", vertical: "middle" });
const subStyle = new Style({ font: "12px Zpix", color: "#888888", horizontal: "center", vertical: "middle" });

const ON = "#39FF14";
const OFF = "#143214";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const LM = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
const LD1 = ["日", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const LD2 = ["初", "十", "廿", "卅"];

// bit-packed lunar year info, 1900–2100 (index 0 = 1900)
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

// bit7=a,6=b,5=c,4=d,3=e,2=f,1=g  (classic 7-seg)
const SEG: number[] = [
	0b1111110, // 0
	0b0110000, // 1
	0b1101101, // 2
	0b1111001, // 3
	0b0110011, // 4
	0b1011011, // 5
	0b1011111, // 6
	0b1110000, // 7
	0b1111111, // 8
	0b1111011, // 9
];

function pad2(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
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

/** Wall clock in Beijing time (UTC+8), independent of host TZ quirks. */
function formatNow(): string {
	const p = beijingParts();
	return `${pad2(p.hh)}:${pad2(p.mm)}:${pad2(p.ss)}`;
}

function formatDate(): string {
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

/** Days from 1900-01-31 to y-m-d (Gregorian). */
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
	return n + d - 31; // 1900-01-31 → 0
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

function drawDigit(port: PortContent, x: number, y: number, w: number, h: number, digit: number) {
	const t = Math.max(3, Math.floor(Math.min(w, h) / 8));
	const mid = y + Math.floor((h - t) / 2);
	const mask = SEG[digit] | 0;
	hbar(port, x, y, w, t, !!(mask & 0b1000000));                 // a
	vbar(port, x + w - t, y, mid - y + t, t, !!(mask & 0b0100000)); // b
	vbar(port, x + w - t, mid, y + h - mid, t, !!(mask & 0b0010000)); // c
	hbar(port, x, y + h - t, w, t, !!(mask & 0b0001000));           // d
	vbar(port, x, mid, y + h - mid, t, !!(mask & 0b0000100));       // e
	vbar(port, x, y, mid - y + t, t, !!(mask & 0b0000010));         // f
	hbar(port, x, mid, w, t, !!(mask & 0b0000001));                 // g
}

function drawColon(port: PortContent, x: number, y: number, w: number, h: number, on: boolean) {
	const s = Math.max(3, Math.floor(Math.min(w, h) / 7));
	const cx = x + Math.floor((w - s) / 2);
	port.fillColor(on ? ON : OFF, cx, y + Math.floor(h * 0.28), s, s);
	port.fillColor(on ? ON : OFF, cx, y + Math.floor(h * 0.62), s, s);
}

class SevenSegBehavior extends Behavior {
	string: string = "--:--:--";
	blink: boolean = true;
	dateKey: string = "";

	syncLabels(port: PortContent) {
		const p = beijingParts();
		const key = `${p.y}-${p.m}-${p.d}`;
		if (key === this.dateKey)
			return;
		this.dateKey = key;
		const app = port.container;
		if (!app)
			return;
		const dateLabel = app.content("dateLabel") as { string?: string } | undefined;
		const lunarLabel = app.content("lunarLabel") as { string?: string } | undefined;
		if (dateLabel)
			dateLabel.string = formatDate();
		if (lunarLabel)
			lunarLabel.string = formatLunar();
	}

	onDisplaying(port: PortContent) {
		this.string = formatNow();
		this.blink = true;
		this.dateKey = "";
		this.syncLabels(port);
		port.interval = 500;
		port.start();
		port.invalidate();
	}
	onTimeChanged(port: PortContent) {
		this.blink = !this.blink;
		this.string = formatNow();
		this.syncLabels(port);
		port.invalidate();
	}
	onDraw(port: PortContent) {
		const text = this.string;
		const n = text.length; // "HH:MM:SS" → 8
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
			else {
				const d = ch.charCodeAt(0) - 48;
				drawDigit(port, x, y, digitW, digitH, (d >= 0 && d <= 9) ? d : 8);
				x += digitW + gap;
			}
		}
	}
}

const HelloApplication = Application.template($ => ({
	skin: backgroundSkin,
	contents: [
		Label($, {
			name: "dateLabel",
			left: 0, right: 0, top: 2, height: 18,
			style: titleStyle,
			string: "",
		}),
		Port($, {
			left: 0, right: 0, top: 24, bottom: 22,
			Behavior: SevenSegBehavior,
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
