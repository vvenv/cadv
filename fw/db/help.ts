export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "Enter", action: "暂停/继续" },
	{ key: "R R", action: "清空统计(按两次)" },
	{ key: "A", action: "A/Z 计权" },
	{ key: "S", action: "快/慢 时间计权" },
	{ key: ", /", action: "校准 -1/+1" },
	{ key: "0", action: "校准归零" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "分贝帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
