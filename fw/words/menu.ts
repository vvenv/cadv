/*
	Word-quiz function list. Drawing lives in menu-view.
*/

import type { Glyph } from "ink";
import { WORD_LEVEL_NAME, bankName, clampWordLevel } from "words";
import { wordSourceLabel } from "wordbank";

export type MenuId = "source" | "level" | "bank" | "shuffle" | "phone" | "miss" | "snd";

export type MenuItem = { id: MenuId; label: string; glyph?: Glyph };

export function menuItems(
	sound: boolean,
	wordLevel: number,
	wordBank: number,
	wordSource: string,
	shuffle: boolean,
	phone: boolean,
	onlyMiss: boolean,
): MenuItem[] {
	const level = WORD_LEVEL_NAME[clampWordLevel(wordLevel)];
	return [
		{ id: "source", label: `来源 ${wordSourceLabel(wordSource)}` },
		{ id: "level", label: `难度 ${level}` },
		{ id: "bank", label: `词库 ${bankName(wordBank)}` },
		{ id: "shuffle", label: "乱序", glyph: shuffle ? "shuffle" : "off" },
		{ id: "phone", label: "音标", glyph: phone ? "phone" : "off" },
		{ id: "miss", label: onlyMiss ? "只练错题" : "全部词", glyph: onlyMiss ? "miss" : "on" },
		{ id: "snd", label: "声音", glyph: sound ? "on" : "off" },
	];
}
