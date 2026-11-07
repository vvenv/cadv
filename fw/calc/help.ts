export type HelpRow = { key: string; action: string };

const ROWS: HelpRow[] = [
	{ key: "?", action: "打开本页" },
	{ key: "0-9", action: "输入" },
	{ key: "+-*x", action: "运算" },
	{ key: "Enter", action: "等于" },
	{ key: "N", action: "正负" },
	{ key: "H", action: "十进制/十六进制" },
	{ key: "U", action: "单位换算" },
	{ key: "G", action: "随机串" },
	{ key: "C", action: "清除" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
];

export function helpTitle(): string {
	return "计算帮助";
}

export function helpFor(): HelpRow[] {
	return ROWS;
}
