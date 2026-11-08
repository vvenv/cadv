/*
	Alarm matching, quiet hours, month grid, and fixed-offset clocks.
	No hardware.
*/

export type Alarm = {
	on: boolean;
	hh: number;
	mm: number;
	/** Bit 0 is Sunday … bit 6 is Saturday. */
	days: number;
};

export const DAY_ALL = 0x7f;
export const DAY_WEEK = 0x3e;
export const DAY_END = 0x41;

export const ZONES: { name: string; offsetMin: number }[] = Object.freeze([
	{ name: "北京", offsetMin: 8 * 60 },
	{ name: "东京", offsetMin: 9 * 60 },
	{ name: "伦敦", offsetMin: 0 },
	{ name: "纽约", offsetMin: -5 * 60 },
	{ name: "洛杉矶", offsetMin: -8 * 60 },
], true) as { name: string; offsetMin: number }[];

export function dayLabel(days: number): string {
	if (!days)
		return "关";
	if (days === DAY_ALL)
		return "每天";
	if (days === DAY_WEEK)
		return "工作日";
	if (days === DAY_END)
		return "周末";
	return "自定义";
}

/** 每天 → 工作日 → 周末 → 关 → 每天. */
export function cycleDays(days: number): number {
	if (days === DAY_ALL)
		return DAY_WEEK;
	if (days === DAY_WEEK)
		return DAY_END;
	if (days === DAY_END)
		return 0;
	return DAY_ALL;
}

/** start === end, or a negative bound, means quiet hours are off. */
export function inQuiet(minute: number, start: number, end: number): boolean {
	if (start < 0 || end < 0 || start === end)
		return false;
	const m = ((minute % 1440) + 1440) % 1440;
	if (start < end)
		return m >= start && m < end;
	return m >= start || m < end;
}

/** Index of the alarm that should ring this second, or -1. */
export function dueAlarm(alarms: Alarm[], wday: number, hh: number, mm: number, ss: number): number {
	if (ss !== 0)
		return -1;
	const bit = 1 << (wday & 7);
	for (let i = 0; i < alarms.length; i++) {
		const alarm = alarms[i];
		if (!alarm.on || !(alarm.days & bit))
			continue;
		if (alarm.hh === hh && alarm.mm === mm)
			return i;
	}
	return -1;
}

export function alarmLine(index: number, alarm: Alarm): string {
	const hh = alarm.hh < 10 ? "0" + alarm.hh : String(alarm.hh);
	const mm = alarm.mm < 10 ? "0" + alarm.mm : String(alarm.mm);
	const state = alarm.on && alarm.days ? "开" : "关";
	return (index + 1) + " " + state + " " + hh + ":" + mm + " " + dayLabel(alarm.days);
}

/** HH:MM in a fixed-offset zone from a UTC epoch ms. */
export function zoneTime(offsetMin: number, utcMs: number): string {
	const shifted = utcMs + offsetMin * 60_000;
	const t = new Date(shifted);
	const hh = t.getUTCHours();
	const mm = t.getUTCMinutes();
	const hs = hh < 10 ? "0" + hh : String(hh);
	const ms = mm < 10 ? "0" + mm : String(mm);
	return hs + ":" + ms;
}

export function zoneLine(name: string, offsetMin: number, utcMs: number): string {
	return name + " " + zoneTime(offsetMin, utcMs);
}

/**
	Week rows as seven cells each. The menu paints equal-width columns so CJK
	weekdays (20px) and day digits (12px each) share one grid on UI-Bold-20.
*/
export function monthRows(year: number, month: number): string[][] {
	const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
	const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const cells: string[] = [];
	for (let i = 0; i < first; i++)
		cells.push("");
	for (let d = 1; d <= dim; d++)
		cells.push(String(d));
	while (cells.length % 7 !== 0)
		cells.push("");
	const rows: string[][] = [["日", "一", "二", "三", "四", "五", "六"]];
	for (let i = 0; i < cells.length; i += 7)
		rows.push(cells.slice(i, i + 7));
	return rows;
}

export function quietLabel(start: number, end: number): string {
	if (start < 0 || end < 0 || start === end)
		return "勿扰 关";
	return "勿扰 " + clockMin(start) + "-" + clockMin(end);
}

export function clockMin(minute: number): string {
	const m = ((minute % 1440) + 1440) % 1440;
	const hh = Math.floor(m / 60);
	const mm = m % 60;
	return (hh < 10 ? "0" + hh : String(hh)) + ":" + (mm < 10 ? "0" + mm : String(mm));
}
