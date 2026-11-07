export type HelpRow = { key: string; action: string };

const ROWS: HelpRow[] = [
	{ key: "?", action: "打开本页" },
	{ key: "T", action: "无线/蓝牙" },
	{ key: "R", action: "重扫" },
	{ key: "K/J", action: "上下" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
];

export function helpTitle(): string {
	return "扫描帮助";
}

export function helpFor(): HelpRow[] {
	return ROWS;
}
