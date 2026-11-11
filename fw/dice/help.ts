export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "Enter", action: "掷" },
	{ key: "摇一摇", action: "掷" },
	{ key: "M", action: "骰子/硬币/数字" },
	{ key: "K/J", action: "多一颗/少一颗" },
	{ key: "R R", action: "清空记录(按两次)" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "骰子帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
