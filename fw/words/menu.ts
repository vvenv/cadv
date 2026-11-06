/*
	Word-quiz function list. Drawing lives in menu-view.
*/

import { WORD_LEVEL_NAME, bankName, clampWordLevel } from "words";

export type MenuId = "level" | "bank" | "snd";

export type MenuItem = { id: MenuId; label: string };

export function menuItems(sound: boolean, wordLevel: number, wordBank: number): MenuItem[] {
	const level = WORD_LEVEL_NAME[clampWordLevel(wordLevel)];
	return [
		{ id: "level", label: `难度 ${level}` },
		{ id: "bank", label: `词库 ${bankName(wordBank)}` },
		{ id: "snd", label: sound ? "声音 开" : "声音 关" },
	];
}
