export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "N", action: "新建" },
	{ key: "Enter", action: "打开文本" },
	{ key: "D", action: "删除" },
	{ key: "Fn+Q", action: "短文本二维码" },
	{ key: "BS", action: "保存并返回" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "记事帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
