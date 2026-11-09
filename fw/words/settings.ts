/*
	Word-quiz preferences. Separate NVS domain from the clock firmware.
*/

import { pref } from "pref";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { SOURCE_FLASH } from "wordbank";

const store = pref("words");
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
	/** Practice only the saved misses. */
	onlyMiss: boolean;
	/** Comma-separated headwords, newest last. */
	misses: string;
	/** Correct answers since the last miss. */
	streak: number;
	/** Answers finished on todayKey. */
	today: number;
	/** YYYY-MM-DD of `today`. */
	todayKey: string;
};

export function loadSettings(): WordSettings {
	return {
		sound: store.getBool("sound", true),
		volume: store.getInt("volume", VOL_DEFAULT, VOL_MIN, VOL_MAX),
		wordLevel: store.getInt("wordLevel", 0, 0, 2),
		wordBank: store.getInt("wordBank", 0, 0, 15),
		wordSource: store.getString("wordSource", SOURCE_FLASH, { nonempty: true }),
		shuffle: store.getBool("shuffle", false),
		phone: store.getBool("phone", true),
		onlyMiss: store.getBool("onlyMiss", false),
		misses: store.getString("misses", ""),
		streak: store.getInt("streak", 0, 0, 9999),
		today: store.getInt("today", 0, 0, 9999),
		todayKey: store.getString("todayKey", ""),
	};
}

export function saveSettings(s: WordSettings) {
	store.set("sound", s.sound ? 1 : 0);
	store.set("volume", s.volume);
	store.set("wordLevel", s.wordLevel);
	store.set("wordBank", s.wordBank);
	store.set("wordSource", s.wordSource || SOURCE_FLASH);
	store.set("shuffle", s.shuffle ? 1 : 0);
	store.set("phone", s.phone ? 1 : 0);
	store.set("onlyMiss", s.onlyMiss ? 1 : 0);
	store.set("misses", s.misses);
	store.set("streak", s.streak);
	store.set("today", s.today);
	store.set("todayKey", s.todayKey);
}
