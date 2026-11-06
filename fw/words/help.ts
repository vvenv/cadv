/*
	Per-screen help. Lines stay short so 20px UI fits the 240px panel.
*/

const PLAY_HELP = [
	"? 本页",
	"BS 返回",
	"Esc 功能列表",
	"输满即判断",
	"对了自动下一题",
	"错了 BS 再改",
	"[ ] 切换难度",
	"\\ 切换词库",
	", . 换下一题",
	"Enter 提前交卷",
	"- = 调节音量",
];

const MENU_HELP = [
	"? 本页",
	"j k , . 上下",
	"Enter 切换",
	"BS 回拼写",
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

export function helpFor(topic: string): string[] {
	if (topic === "menu")
		return MENU_HELP;
	return PLAY_HELP;
}
