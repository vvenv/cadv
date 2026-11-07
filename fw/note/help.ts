export type HelpRow = { key: string; action: string };

const ROWS: HelpRow[] = [
	{ key: "?", action: "打开本页" },
	{ key: "N", action: "新建" },
	{ key: "Enter", action: "打开文本" },
	{ key: "D", action: "删除" },
	{ key: "编辑+Q", action: "短文本二维码" },
	{ key: "BS", action: "保存并返回" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
];

export function helpTitle(): string {
	return "记事帮助";
}

export function helpFor(): HelpRow[] {
	return ROWS;
}
