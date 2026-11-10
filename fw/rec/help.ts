export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "Enter", action: "开始/停止" },
	{ key: ".", action: "录音列表" },
	{ key: "列表+Enter", action: "播放" },
	{ key: "列表+D D", action: "删除(按两次)" },
	{ key: "播放+BS", action: "停止" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "录音帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
