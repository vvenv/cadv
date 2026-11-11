export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "N", action: "新建" },
	{ key: "Enter", action: "打开" },
	{ key: "D D", action: "删除(按两次)" },
	{ key: "Fn+`", action: "编辑中:保存返回" },
	{ key: "Fn+HJKL", action: "编辑中:移光标" },
	{ key: "BS", action: "编辑中:删前一字" },
	{ key: "Fn+Q", action: "短文本二维码" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "保存并回选应用" },
], true);

export function helpTitle(): string {
	return "记事帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
