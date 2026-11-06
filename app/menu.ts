/*
	Function list model. Drawing lives in menu-view.
*/

import { WORD_LEVEL_NAME, bankName, clampWordLevel } from "words";

export const MENU_VISIBLE = 4;

export type MenuId = "word" | "level" | "bank" | "cd" | "al" | "wx" | "wifi" | "snd" | "hour";

export type MenuItem = { id: MenuId; label: string };

export function menuItems(sound: boolean, hourly: boolean, wordLevel: number, wordBank: number): MenuItem[] {
	const level = WORD_LEVEL_NAME[clampWordLevel(wordLevel)];
	return [
		{ id: "word", label: "单词补充完整" },
		{ id: "level", label: `难度 ${level}` },
		{ id: "bank", label: `词库 ${bankName(wordBank)}` },
		{ id: "cd", label: "倒计时" },
		{ id: "al", label: "闹钟" },
		{ id: "wx", label: "刷新天气" },
		{ id: "wifi", label: "Wi-Fi" },
		{ id: "snd", label: sound ? "声音 开" : "声音 关" },
		{ id: "hour", label: hourly ? "整点 开" : "整点 关" },
	];
}

/** -1 up, +1 down, 0 neither. Later key in the chord wins. */
export function menuDirFromChars(chars: string[]): -1 | 0 | 1 {
	let dir: -1 | 0 | 1 = 0;
	for (const ch of chars) {
		const c = ch.toLowerCase();
		if (c === "k" || c === ";" || c === ",")
			dir = -1;
		else if (c === "j" || c === "'" || c === ".")
			dir = 1;
	}
	return dir;
}

export function menuStep(index: number, count: number, dir: -1 | 1): number {
	if (count <= 0)
		return 0;
	const n = index + dir;
	if (n < 0)
		return count - 1;
	if (n >= count)
		return 0;
	return n;
}

/** First visible row so `selected` stays inside the window. */
export function windowStart(selected: number, count: number, visible: number): number {
	if (count <= visible || visible <= 0)
		return 0;
	let sel = selected;
	if (sel < 0)
		sel = 0;
	if (sel >= count)
		sel = count - 1;
	let start = sel - Math.floor((visible - 1) / 2);
	if (start < 0)
		start = 0;
	const max = count - visible;
	if (start > max)
		start = max;
	return start;
}
