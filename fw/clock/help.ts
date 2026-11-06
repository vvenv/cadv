/*
	Per-function help. `?` on a screen shows only that screen's lines.
	Lines stay short so 20px UI fits the 240px panel.
*/

const CLOCK_HELP = [
	"? / 本页",
	"Enter/空格 列表",
	"BS Esc Fn+H 回退",
	"W 配网",
	"配网 BS 退格",
	"空格 ? / 是字符",
	"Esc/Fn+H 取消",
	"S 声音  H 整点",
	"- = 音量",
	"C 倒计时  A 闹钟",
	"T 刷新天气",
	"Fn+BS 启动器",
];

const MENU_HELP = [
	"? 本页",
	"j k , . 上下",
	"Fn+K/J 也是上下",
	"Enter/空格 确认",
	"BS Esc Fn+H 返回",
];

const CD_HELP = [
	"? 本页",
	"Esc/Fn+H 直接退出",
	"BS 退格或回上一格",
	"时位空 BS 回时钟",
	"Enter/空格 确认",
	"进行中 回退或确认即停",
];

const AL_HELP = [
	"? 本页",
	"Esc/Fn+H 退出",
	"时满两位跳到分",
	"Enter/空格 保存",
	"时位空 BS 关闭",
	"响铃 回退或确认即停",
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
