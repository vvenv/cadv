/*
	Beijing wall-clock helpers + lunar calendar string.
*/

import type { ClockSettings } from "settings";

const BEIJING_OFFSET_SEC = 8 * 3600;

/** Top-line weekday codes (Sun→Sat), matching `YYYY-MM-DD MO …`. */
const WEEKDAYS_EN = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
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

export function pad2(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

export function formatHMS(totalSec: number): string {
	let t = totalSec | 0;
	if (t < 0)
		t = 0;
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = t % 60;
	return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

export function beijingParts(): { y: number; m: number; d: number; w: number; hh: number; mm: number; ss: number } {
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

export function timeSynced(): boolean {
	return beijingParts().y >= 2020;
}

export function formatNow(): string {
	const p = beijingParts();
	return `${pad2(p.hh)}:${pad2(p.mm)}:${pad2(p.ss)}`;
}

function formatDate(): string {
	if (!timeSynced())
		return "等待对时";
	const p = beijingParts();
	return `${p.y}-${pad2(p.m)}-${pad2(p.d)} ${WEEKDAYS_EN[p.w]}`;
}

/** Top line: `YYYY-MM-DD MO` or `YYYY-MM-DD MO AL:HH:MM` when alarm armed. */
export function formatClockTop(s: ClockSettings): string {
	const base = formatDate();
	if (!s.alarmOn)
		return base;
	return `${base} AL:${pad2(s.alarmHH)}:${pad2(s.alarmMM)}`;
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

export function formatLunar(): string {
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
	const monthStr = (isLeap ? "闰" : "") + LM[lm - 1] + "月";
	return `${monthStr}${lunarDayName(ld)}`;
}
