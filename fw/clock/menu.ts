/*
	Clock function list. Drawing lives in menu-view.
*/

export type MenuId =
	| "cd" | "al" | "sw" | "pomo" | "cal" | "zone" | "city" | "manual" | "quiet"
	| "wx" | "wifi" | "snd" | "hour";

export type MenuItem = { id: MenuId; label: string };

export function menuItems(sound: boolean, hourly: boolean, quiet: string): MenuItem[] {
	return [
		{ id: "cd", label: "倒计时" },
		{ id: "al", label: "闹钟" },
		{ id: "sw", label: "秒表" },
		{ id: "pomo", label: "番茄钟" },
		{ id: "cal", label: "月历" },
		{ id: "zone", label: "世界时间" },
		{ id: "city", label: "城市" },
		{ id: "manual", label: "手动校时" },
		{ id: "quiet", label: quiet },
		{ id: "wx", label: "刷新天气" },
		{ id: "wifi", label: "Wi-Fi" },
		{ id: "snd", label: sound ? "声音 开" : "声音 关" },
		{ id: "hour", label: hourly ? "整点 开" : "整点 关" },
	];
}
