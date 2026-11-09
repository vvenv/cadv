/*
	Clock sound preferences (NVS Preference).
*/

import { pref } from "pref";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { DAY_ALL, type Alarm } from "when";

const store = pref("clock");
export { VOL_DEFAULT, VOL_MAX, VOL_MIN };

export type ClockSettings = {
	sound: boolean;
	hourly: boolean;
	volume: number; // 0..10
	/** Four alarms. */
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

function parseAlarms(raw: string): Alarm[] {
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
	return {
		sound: store.getBool("sound", true),
		hourly: store.getBool("hourly", true),
		volume: store.getInt("volume", VOL_DEFAULT, VOL_MIN, VOL_MAX),
		alarms: parseAlarms(store.getString("alarms", "")),
		quietStart: store.getInt("quietStart", -1, -1, 1439),
		quietEnd: store.getInt("quietEnd", -1, -1, 1439),
		cityName: store.getString("cityName", ""),
		cityLat: store.getFloat("cityLat", 25.7212),
		cityLon: store.getFloat("cityLon", 119.3841),
	};
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
	store.set("sound", s.sound ? 1 : 0);
	store.set("hourly", s.hourly ? 1 : 0);
	store.set("volume", s.volume);
	store.set("alarms", packAlarms(s.alarms));
	store.set("quietStart", s.quietStart);
	store.set("quietEnd", s.quietEnd);
	store.set("cityName", s.cityName);
	store.set("cityLat", s.cityLat);
	store.set("cityLon", s.cityLon);
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
