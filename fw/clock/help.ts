/*
	Per-function help. `?` on a screen shows only that screen's lines.
	Key left / action right on the 240px list.
*/

export type HelpRow = { key: string; action: string };

const CLOCK_HELP: HelpRow[] = [
	{ key: "?/", action: "打开本页" },
	{ key: "Enter/空格", action: "开列表" },
	{ key: "BS/Esc/Fn+H", action: "关掉提示" },
	{ key: "W", action: "重配 Wi-Fi" },
	{ key: "配网+BS", action: "删一字" },
	{ key: "配网+空格?/", action: "当字符" },
	{ key: "配网+Esc/Fn+H", action: "取消" },
	{ key: "S", action: "开关滴答" },
	{ key: "H", action: "开关整点报" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "C", action: "倒计时" },
	{ key: "A", action: "设闹钟" },
	{ key: "T", action: "拉天气" },
	{ key: "Fn+BS", action: "回选应用" },
];

const MENU_HELP: HelpRow[] = [
	{ key: "?", action: "打开本页" },
	{ key: "j/k/,/.", action: "上下移动" },
	{ key: "Fn+K/J", action: "上下移动" },
	{ key: "Enter/空格", action: "确认选中" },
	{ key: "BS/Esc/Fn+H", action: "回时钟" },
];

const CD_HELP: HelpRow[] = [
	{ key: "?", action: "打开本页" },
	{ key: "Esc/Fn+H", action: "退出" },
	{ key: "BS", action: "删数字/回上格" },
	{ key: "时位空+BS", action: "回时钟" },
	{ key: "秒位+Enter/空格", action: "开始" },
	{ key: "进行中+回退/确认", action: "停止" },
];

const AL_HELP: HelpRow[] = [
	{ key: "?", action: "打开本页" },
	{ key: "Esc/Fn+H", action: "退出" },
	{ key: "时满两位", action: "跳到分" },
	{ key: "分位+Enter/空格", action: "保存" },
	{ key: "时位空+BS", action: "关闹钟" },
	{ key: "响铃+回退/确认", action: "停止" },
];

/** Which page `?` opens for the screen you are on. */
export function helpTopic(mode: string): string {
	if (mode === "menu")
		return "menu";
	if (mode === "cd_edit" || mode === "cd_run" || mode === "cd_done")
		return "cd";
	if (mode === "al_edit" || mode === "al_ring")
		return "al";
	return "clock";
}

export function helpTitle(topic: string): string {
	if (topic === "menu")
		return "列表帮助";
	if (topic === "cd")
		return "计时帮助";
	if (topic === "al")
		return "闹钟帮助";
	return "时钟帮助";
}

export function helpFor(topic: string): HelpRow[] {
	if (topic === "menu")
		return MENU_HELP;
	if (topic === "cd")
		return CD_HELP;
	if (topic === "al")
		return AL_HELP;
	return CLOCK_HELP;
}
