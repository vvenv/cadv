/*
	Per-screen help. Key left / action right on the 240px list.
*/

export type HelpRow = { key: string; action: string };

const PLAY_HELP: HelpRow[] = [
	{ key: "?/", action: "打开本页" },
	{ key: "Enter/空格(空)", action: "开列表" },
	{ key: "Enter/空格(有字)", action: "检查" },
	{ key: "BS/Esc/Fn+H", action: "删一字母" },
	{ key: "空位填满", action: "自动判" },
	{ key: "[/]", action: "更易/更难" },
	{ key: "\\", action: "换词库" },
	{ key: ",.  Fn+K/J", action: "换词" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "Fn+BS", action: "回选应用" },
];

const MENU_HELP: HelpRow[] = [
	{ key: "?", action: "打开本页" },
	{ key: "j/k/,/.", action: "上下移动" },
	{ key: "Fn+K/J", action: "上下移动" },
	{ key: "Enter/空格", action: "确认选中" },
	{ key: "BS/Esc/Fn+H", action: "回拼写" },
];

export function helpTopic(mode: string): string {
	if (mode === "menu")
		return "menu";
	return "play";
}

export function helpTitle(topic: string): string {
	if (topic === "menu")
		return "列表帮助";
	return "拼写帮助";
}

export function helpFor(topic: string): HelpRow[] {
	if (topic === "menu")
		return MENU_HELP;
	return PLAY_HELP;
}
