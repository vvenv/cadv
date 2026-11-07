/*
	One help page. Keys on the left, effect on the right.
*/

export type HelpRow = { key: string; action: string };

const ROWS: HelpRow[] = [
	{ key: "字母数字", action: "发给对方" },
	{ key: "Shift", action: "上档" },
	{ key: "Ctrl/Alt", action: "修饰" },
	{ key: "Opt", action: "Cmd" },
	{ key: "Fn+`", action: "Esc" },
	{ key: "Fn+H/J/K/L", action: "←↓↑→" },
	{ key: "Fn+1 到 =", action: "F1-F12" },
	{ key: "Fn+U/O", action: "Home/End" },
	{ key: "Fn+I/N", action: "上页/下页" },
	{ key: "Fn+P", action: "Delete" },
	{ key: "Fn+/", action: "本页" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "BS", action: "关掉本页" },
	{ key: "K/J", action: "翻页" },
	{ key: "Fn+Tab", action: "清配对" },
	{ key: "Fn+BS", action: "回选应用" },
];

export function helpTitle(): string {
	return "键盘帮助";
}

export function helpRows(): HelpRow[] {
	return ROWS;
}
