/*
	Clock sound preferences (NVS Preference).
*/

import Preference from "preference";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { DAY_ALL, type Alarm } from "when";

const PREF = "clock";
export { VOL_DEFAULT, VOL_MAX, VOL_MIN };

export type ClockSettings = {
	sound: boolean;
	hourly: boolean;
	volume: number; // 0..10
	/** Four alarms. Slot 0 is the one the old single-alarm keys migrate into. */
	alarms: Alarm[];
	/** Minutes from midnight. Equal or negative means off. */
	quietStart: number;
	quietEnd: number;
	cityName: string;
	cityLat: number;
	cityLon: number;
};

function blankAlarm(): Alarm {
	return { on: false, hh: 7, mm: 0, days: DAY_ALL };
}

function readBool(name: string, fallback: boolean): boolean {
	try {
		const v = Preference.get(PREF, name);
		if (typeof v === "boolean")
			return v;
		if (typeof v === "number")
			return v !== 0;
		if (typeof v === "string")
			return v === "1" || v === "true";
	}
	catch {
		/* */
	}
	return fallback;
}

function readInt(name: string, fallback: number, min: number, max: number): number {
	try {
		const v = Preference.get(PREF, name);
		let n = fallback;
		if (typeof v === "number")
			n = v;
		else if (typeof v === "string")
			n = parseInt(v, 10);
		if (typeof n !== "number" || n !== n)
			n = fallback;
		if (n < min)
			n = min;
		if (n > max)
			n = max;
		return n | 0;
	}
	catch {
		return fallback;
	}
}

function readString(name: string, fallback: string): string {
	try {
		const v = Preference.get(PREF, name);
		if (typeof v === "string")
			return v;
	}
	catch {
		/* */
	}
	return fallback;
}

function parseAlarms(raw: string, legacyOn: boolean, legacyHH: number, legacyMM: number): Alarm[] {
	const alarms: Alarm[] = [];
	if (raw) {
		const parts = raw.split(";");
		for (let i = 0; i < parts.length && alarms.length < 4; i++) {
			const f = parts[i].split(",");
			if (f.length < 4)
				continue;
			alarms.push({
				on: f[0] === "1",
				hh: clamp(parseInt(f[1], 10), 0, 23, 7),
				mm: clamp(parseInt(f[2], 10), 0, 59, 0),
				days: clamp(parseInt(f[3], 10), 0, 127, DAY_ALL),
			});
		}
	}
	if (!alarms.length) {
		alarms.push({ on: legacyOn, hh: legacyHH, mm: legacyMM, days: DAY_ALL });
	}
	while (alarms.length < 4)
		alarms.push(blankAlarm());
	return alarms;
}

function clamp(n: number, min: number, max: number, fallback: number): number {
	if (n !== n)
		return fallback;
	if (n < min)
		return min;
	if (n > max)
		return max;
	return n | 0;
}

export function loadSettings(): ClockSettings {
	const legacyOn = readBool("alarmOn", false);
	const legacyHH = readInt("alarmHH", 7, 0, 23);
	const legacyMM = readInt("alarmMM", 0, 0, 59);
	return {
		sound: readBool("sound", true),
		hourly: readBool("hourly", true),
		volume: readInt("volume", VOL_DEFAULT, VOL_MIN, VOL_MAX),
		alarms: parseAlarms(readString("alarms", ""), legacyOn, legacyHH, legacyMM),
		quietStart: readInt("quietStart", -1, -1, 1439),
		quietEnd: readInt("quietEnd", -1, -1, 1439),
		cityName: readString("cityName", ""),
		cityLat: readFloat("cityLat", 25.7212),
		cityLon: readFloat("cityLon", 119.3841),
	};
}

function readFloat(name: string, fallback: number): number {
	try {
		const v = Preference.get(PREF, name);
		let n = fallback;
		if (typeof v === "number")
			n = v;
		else if (typeof v === "string")
			n = parseFloat(v);
		if (n !== n)
			return fallback;
		return n;
	}
	catch {
		return fallback;
	}
}

function packAlarms(alarms: Alarm[]): string {
	const parts: string[] = [];
	for (let i = 0; i < alarms.length && i < 4; i++) {
		const a = alarms[i];
		parts.push((a.on ? "1" : "0") + "," + a.hh + "," + a.mm + "," + a.days);
	}
	return parts.join(";");
}

export function saveSettings(s: ClockSettings) {
	const first = s.alarms[0] ?? blankAlarm();
	Preference.set(PREF, "sound", s.sound ? 1 : 0);
	Preference.set(PREF, "hourly", s.hourly ? 1 : 0);
	Preference.set(PREF, "volume", s.volume);
	Preference.set(PREF, "alarmOn", first.on ? 1 : 0);
	Preference.set(PREF, "alarmHH", first.hh);
	Preference.set(PREF, "alarmMM", first.mm);
	Preference.set(PREF, "alarms", packAlarms(s.alarms));
	Preference.set(PREF, "quietStart", s.quietStart);
	Preference.set(PREF, "quietEnd", s.quietEnd);
	Preference.set(PREF, "cityName", s.cityName);
	Preference.set(PREF, "cityLat", s.cityLat);
	Preference.set(PREF, "cityLon", s.cityLon);
}

export function formatAlarm(s: ClockSettings): string {
	let shown: Alarm | null = null;
	let extra = 0;
	for (let i = 0; i < s.alarms.length; i++) {
		const alarm = s.alarms[i];
		if (!alarm.on || !alarm.days)
			continue;
		if (!shown)
			shown = alarm;
		else
			extra++;
	}
	if (!shown)
		return "闹钟关";
	const hh = shown.hh < 10 ? `0${shown.hh}` : `${shown.hh}`;
	const mm = shown.mm < 10 ? `0${shown.mm}` : `${shown.mm}`;
	return extra ? `闹钟 ${hh}:${mm}+${extra}` : `闹钟 ${hh}:${mm}`;
}

export function formatSettings(s: ClockSettings): string {
	return `Snd:${s.sound ? "ON" : "OFF"} Hour:${s.hourly ? "ON" : "OFF"} Vol:${s.volume}`;
}

