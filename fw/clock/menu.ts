/*
	Clock function list. Drawing lives in menu-view.
*/

import type { Glyph } from "ink";

export type MenuId =
	| "cd" | "al" | "sw" | "pomo" | "cal" | "zone" | "city" | "manual" | "quiet"
	| "wx" | "wifi" | "snd" | "hour";

export type MenuItem = { id: MenuId; label: string; glyph?: Glyph };

export function menuItems(sound: boolean, hourly: boolean, quiet: string): MenuItem[] {
	return [
		{ id: "cd", label: "倒计时" },
		{ id: "al", label: "闹钟" },
		{ id: "sw", label: "秒表", glyph: "play" },
		{ id: "pomo", label: "番茄钟" },
		{ id: "cal", label: "月历" },
		{ id: "zone", label: "世界时间" },
		{ id: "city", label: "城市" },
		{ id: "manual", label: "手动校时" },
		{ id: "quiet", label: quiet },
		{ id: "wx", label: "刷新天气" },
		{ id: "wifi", label: "Wi-Fi", glyph: "wifi" },
		{ id: "snd", label: "声音", glyph: sound ? "on" : "off" },
		{ id: "hour", label: "整点", glyph: hourly ? "on" : "off" },
	];
}
