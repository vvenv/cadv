/*
	Word-quiz preferences. Separate NVS domain from the clock firmware.
*/

import Preference from "preference";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";

const PREF = "words";
export { VOL_DEFAULT, VOL_MAX, VOL_MIN };

export type WordSettings = {
	sound: boolean;
	volume: number; // 0..10
	/** 0 易 ≈1/3, 1 中 ≈1/2, 2 难 = every letter. */
	wordLevel: number;
	/** Index into the elementary word banks. */
	wordBank: number;
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

export function loadSettings(): WordSettings {
	return {
		sound: readBool("sound", true),
		volume: readInt("volume", VOL_DEFAULT, VOL_MIN, VOL_MAX),
		wordLevel: readInt("wordLevel", 0, 0, 2),
		wordBank: readInt("wordBank", 0, 0, 15),
	};
}

export function saveSettings(s: WordSettings) {
	Preference.set(PREF, "sound", s.sound ? 1 : 0);
	Preference.set(PREF, "volume", s.volume);
	Preference.set(PREF, "wordLevel", s.wordLevel);
	Preference.set(PREF, "wordBank", s.wordBank);
}
