/*
	Per-screen help. Key left / action right on the 240px list.
	One key (or paired opposite keys) per action.
*/

export type HelpRow = { key: string; action: string };

const PLAY_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "空格", action: "释义/音标" },
	{ key: "Enter(空)", action: "开列表" },
	{ key: "Enter(有字)", action: "检查" },
	{ key: "BS", action: "删一字母" },
	{ key: "空位填满", action: "自动判" },
	{ key: "[/]", action: "更易/更难" },
	{ key: "\\", action: "换词库" },
	{ key: ",/.", action: "换词" },
	{ key: "错题", action: "列表里只练错的" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

const MENU_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "来源", action: "内置/卡上词包" },
	{ key: "K/J", action: "上下移动" },
	{ key: "Enter", action: "确认选中" },
	{ key: "BS", action: "回拼写" },
], true);

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

export function helpFor(topic: string): readonly HelpRow[] {
	if (topic === "menu")
		return MENU_HELP;
	return PLAY_HELP;
}
