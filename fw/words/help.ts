/*
	Per-screen help. Lines stay short so 20px UI fits the 240px panel.
*/

const PLAY_HELP = [
	"? / 本页",
	"没填字 Enter 列表",
	"有字 Enter/空格 交卷",
	"BS Esc Fn+H 删一字",
	"输满即判断",
	"[ ] 难度",
	"\\ 词库",
	", . 或 Fn+K/J 换题",
	"- = 音量",
	"Fn+BS 启动器",
];

const MENU_HELP = [
	"? 本页",
	"j k , . 上下",
	"Fn+K/J 也是上下",
	"Enter/空格 确认",
	"BS Esc Fn+H 回拼写",
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
