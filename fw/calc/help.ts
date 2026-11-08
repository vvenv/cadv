export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "0-9 .", action: "输入" },
	{ key: "+-*/", action: "四则" },
	{ key: "X", action: "乘" },
	{ key: "= Enter", action: "等于" },
	{ key: "BS", action: "退格" },
	{ key: "%", action: "百分" },
	{ key: "N", action: "正负" },
	{ key: "H", action: "切换进制" },
	{ key: "A-F", action: "十六进制数字" },
	{ key: "输入中C", action: "十六进制数字" },
	{ key: "U", action: "下一种单位" },
	{ key: "G", action: "随机串" },
	{ key: "C", action: "清除" },
	{ key: "Esc", action: "清除并回十进制" },
	{ key: "K/J", action: "帮助里上下" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "计算帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
