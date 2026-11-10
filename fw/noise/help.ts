export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "K/J", action: "选声音" },
	{ key: "Enter", action: "播放/停止" },
	{ key: ", /", action: "定时短/长" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "助眠帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
