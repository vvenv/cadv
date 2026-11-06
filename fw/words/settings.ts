/*
	Word-quiz preferences. Separate NVS domain from the clock firmware.
*/

import Preference from "preference";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { SOURCE_FLASH } from "wordbank";

const PREF = "words";
export { VOL_DEFAULT, VOL_MAX, VOL_MIN };

export type WordSettings = {
	sound: boolean;
	volume: number; // 0..10
	/** 0 易 ≈1/3, 1 中 ≈1/2, 2 难 = every letter. */
	wordLevel: number;
	/** Index into the elementary word banks. */
	wordBank: number;
	/** Lexicon pack id: flash or cadv/words/<id>.bin basename. */
	wordSource: string;
	/** Quiz order is shuffled when true. */
	shuffle: boolean;
	/** Show IPA in the bottom bar when true. */
	phone: boolean;
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

function readString(name: string, fallback: string): string {
	try {
		const v = Preference.get(PREF, name);
		if (typeof v === "string" && v.length > 0)
			return v;
	}
	catch {
		/* */
	}
	return fallback;
}

export function loadSettings(): WordSettings {
	return {
		sound: readBool("sound", true),
		volume: readInt("volume", VOL_DEFAULT, VOL_MIN, VOL_MAX),
		wordLevel: readInt("wordLevel", 0, 0, 2),
		wordBank: readInt("wordBank", 0, 0, 15),
		wordSource: readString("wordSource", SOURCE_FLASH),
		shuffle: readBool("shuffle", false),
		phone: readBool("phone", true),
	};
}

export function saveSettings(s: WordSettings) {
	Preference.set(PREF, "sound", s.sound ? 1 : 0);
	Preference.set(PREF, "volume", s.volume);
	Preference.set(PREF, "wordLevel", s.wordLevel);
	Preference.set(PREF, "wordBank", s.wordBank);
	Preference.set(PREF, "wordSource", s.wordSource || SOURCE_FLASH);
	Preference.set(PREF, "shuffle", s.shuffle ? 1 : 0);
	Preference.set(PREF, "phone", s.phone ? 1 : 0);
}
