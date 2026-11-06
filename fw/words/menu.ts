/*
	Word-quiz function list. Drawing lives in menu-view.
*/

import { WORD_LEVEL_NAME, bankName, clampWordLevel } from "words";

export type MenuId = "level" | "bank" | "shuffle" | "phone" | "snd";

export type MenuItem = { id: MenuId; label: string };

export function menuItems(
	sound: boolean,
	wordLevel: number,
	wordBank: number,
	shuffle: boolean,
	phone: boolean,
): MenuItem[] {
	const level = WORD_LEVEL_NAME[clampWordLevel(wordLevel)];
	return [
		{ id: "level", label: `难度 ${level}` },
		{ id: "bank", label: `词库 ${bankName(wordBank)}` },
		{ id: "shuffle", label: shuffle ? "乱序 开" : "乱序 关" },
		{ id: "phone", label: phone ? "音标 开" : "音标 关" },
		{ id: "snd", label: sound ? "声音 开" : "声音 关" },
	];
}
