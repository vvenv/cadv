export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "M", action: "无线/蓝牙" },
	{ key: "R", action: "重扫" },
	{ key: "K/J", action: "上下" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "扫描帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
