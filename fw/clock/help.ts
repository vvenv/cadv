/*
	Per-function help. `?` on a screen shows only that screen's lines.
	Lines stay short so 20px UI fits the 240px panel.
*/

const CLOCK_HELP = [
	"? 本页",
	"Esc 关掉提示",
	"Enter 功能列表",
	"W 配网",
	"配网 Del Enter Esc",
	"S 声音开关",
	"H 整点报时",
	"- = 调节音量",
	"C 倒计时",
	"A 闹钟",
	"T 刷新天气",
];

const MENU_HELP = [
	"? 本页",
	"j k , . 上下",
	"Enter 进入",
	"声音整点 Enter 切换",
	"Esc 回时钟",
];

const CD_HELP = [
	"? 本页",
	"Esc 退出",
	"时分满两位跳格",
	"秒位 Enter 开始",
	"进行中 Esc 停止",
];

const AL_HELP = [
	"? 本页",
	"Esc 退出",
	"时满两位跳到分",
	"分位 Enter 保存",
	"时位空 Del 关闭",
	"响铃 Esc 停止",
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

export function helpFor(topic: string): string[] {
	if (topic === "menu")
		return MENU_HELP;
	if (topic === "cd")
		return CD_HELP;
	if (topic === "al")
		return AL_HELP;
	return CLOCK_HELP;
}
