/*
	Clock function list. Drawing lives in menu-view.
*/

export type MenuId = "cd" | "al" | "wx" | "wifi" | "snd" | "hour";

export type MenuItem = { id: MenuId; label: string };

export function menuItems(sound: boolean, hourly: boolean): MenuItem[] {
	return [
		{ id: "cd", label: "倒计时" },
		{ id: "al", label: "闹钟" },
		{ id: "wx", label: "刷新天气" },
		{ id: "wifi", label: "Wi-Fi" },
		{ id: "snd", label: sound ? "声音 开" : "声音 关" },
		{ id: "hour", label: hourly ? "整点 开" : "整点 关" },
	];
}
