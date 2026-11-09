/*
	Per-function help. `?` on a screen shows only that screen's lines.
	Key left / action right on the 240px list.
	One key (or paired opposite keys) per action.
*/

export type HelpRow = { key: string; action: string };

const CLOCK_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "Enter", action: "开列表" },
	{ key: "BS", action: "关掉提示" },
	{ key: "W", action: "配 / 改 Wi-Fi" },
	{ key: "配网+BS", action: "删一字" },
	{ key: "配网+空格?/", action: "当字符" },
	{ key: "配网+Esc", action: "取消" },
	{ key: "S", action: "开关滴答" },
	{ key: "H", action: "开关整点报" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "C", action: "倒计时" },
	{ key: "A", action: "闹钟列表" },
	{ key: "T", action: "天气详情" },
	{ key: "详情+T", action: "再刷新" },
	{ key: "详情+BS", action: "回时钟" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

const MENU_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "K/J", action: "上下移动" },
	{ key: "Enter", action: "确认选中" },
	{ key: "BS", action: "回时钟" },
], true);

const CD_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "Esc", action: "退出" },
	{ key: "BS", action: "删数字/回上格" },
	{ key: "时位空+BS", action: "回时钟" },
	{ key: "秒位+Enter", action: "开始" },
	{ key: "进行中+BS", action: "停止" },
], true);

const AL_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "Esc", action: "退出" },
	{ key: "时满两位", action: "跳到分" },
	{ key: "分位+Enter", action: "保存" },
	{ key: "时位空+BS", action: "关闹钟" },
	{ key: "响铃+BS", action: "停止" },
	{ key: "响铃+Enter", action: "贪睡五分" },
	{ key: "列表+D", action: "每天/工作日/周末/关" },
], true);

/** Which page `?` opens for the screen you are on. */
const DESK_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "秒表+Enter", action: "开始/停" },
	{ key: "秒表+.", action: "计次" },
	{ key: "秒表+R", action: "清零" },
	{ key: "番茄+Enter", action: "开始/停" },
	{ key: "番茄+R", action: "回到工作" },
	{ key: "月历+K/J", action: "上一月/下一月" },
	{ key: "城市+Enter", action: "搜索" },
	{ key: "BS", action: "回时钟" },
], true);

const WX_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "T", action: "刷新天气" },
	{ key: "BS", action: "回时钟" },
], true);

export function helpTopic(mode: string): string {
	if (mode === "menu" || mode === "hits")
		return "menu";
	if (mode === "cd_edit" || mode === "cd_run" || mode === "cd_done")
		return "cd";
	if (mode === "al_edit" || mode === "al_ring" || mode === "alarms")
		return "al";
	if (mode === "desk")
		return "desk";
	if (mode === "wx")
		return "wx";
	return "clock";
}

export function helpTitle(topic: string): string {
	if (topic === "menu")
		return "列表帮助";
	if (topic === "cd")
		return "计时帮助";
	if (topic === "al")
		return "闹钟帮助";
	if (topic === "desk")
		return "工具帮助";
	if (topic === "wx")
		return "天气帮助";
	return "时钟帮助";
}

export function helpFor(topic: string): readonly HelpRow[] {
	if (topic === "menu")
		return MENU_HELP;
	if (topic === "cd")
		return CD_HELP;
	if (topic === "al")
		return AL_HELP;
	if (topic === "desk")
		return DESK_HELP;
	if (topic === "wx")
		return WX_HELP;
	return CLOCK_HELP;
}
