/*
	Clock sound preferences (NVS Preference).
*/

import Preference from "preference";

const PREF = "clock";
export const VOL_MIN = 0;
export const VOL_MAX = 10;
export const VOL_DEFAULT = 6;

export type ClockSettings = {
	sound: boolean;
	hourly: boolean;
	volume: number; // 0..10
	alarmOn: boolean;
	alarmHH: number; // 0..23
	alarmMM: number; // 0..59
};

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

export function loadSettings(): ClockSettings {
	return {
		sound: readBool("sound", true),
		hourly: readBool("hourly", true),
		volume: readInt("volume", VOL_DEFAULT, VOL_MIN, VOL_MAX),
		alarmOn: readBool("alarmOn", false),
		alarmHH: readInt("alarmHH", 7, 0, 23),
		alarmMM: readInt("alarmMM", 0, 0, 59),
	};
}

export function saveSettings(s: ClockSettings) {
	Preference.set(PREF, "sound", s.sound ? 1 : 0);
	Preference.set(PREF, "hourly", s.hourly ? 1 : 0);
	Preference.set(PREF, "volume", s.volume);
	Preference.set(PREF, "alarmOn", s.alarmOn ? 1 : 0);
	Preference.set(PREF, "alarmHH", s.alarmHH);
	Preference.set(PREF, "alarmMM", s.alarmMM);
}

export function formatAlarm(s: ClockSettings): string {
	if (!s.alarmOn)
		return "Alarm OFF";
	const hh = s.alarmHH < 10 ? `0${s.alarmHH}` : `${s.alarmHH}`;
	const mm = s.alarmMM < 10 ? `0${s.alarmMM}` : `${s.alarmMM}`;
	return `Alarm ${hh}:${mm}`;
}

export function formatSettings(s: ClockSettings): string {
	return `Snd:${s.sound ? "ON" : "OFF"} Hour:${s.hourly ? "ON" : "OFF"} Vol:${s.volume}`;
}

/** Map 0..10 UI steps → AudioOut volume 0..256. */
export function audioVolume(level: number): number {
	if (level <= 0)
		return 0;
	if (level >= VOL_MAX)
		return 256;
	return Math.floor((256 * level) / VOL_MAX);
}
