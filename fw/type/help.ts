export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "Tab", action: "单词/句子/键位" },
	{ key: "BS", action: "退一格" },
	{ key: "Esc", action: "重来这一轮" },
	{ key: "Enter", action: "看完成绩再来" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "打字帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
