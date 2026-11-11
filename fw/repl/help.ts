export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "Fn+空格", action: "打开本页" },
	{ key: "Enter", action: "运行这一行" },
	{ key: "括号未关", action: "Enter 接着写" },
	{ key: "Fn+K/J", action: "上一条/下一条" },
	{ key: "Fn+H/L", action: "光标左右" },
	{ key: "Shift+Fn+K/J", action: "翻看输出" },
	{ key: "BS", action: "退格" },
	{ key: "Esc", action: "清空这一行" },
	{ key: "print(x)", action: "显示" },
	{ key: "clear()", action: "清屏" },
	{ key: "_", action: "上一个结果" },
	{ key: "setTimeout", action: "定时，可用" },
	{ key: "stopAll()", action: "停掉所有定时" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "JS 帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
