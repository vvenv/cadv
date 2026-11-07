/*
	Per-screen help. Key left / action right on the 240px list.
*/

export type HelpRow = { key: string; action: string };

const INFO_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "K/J", action: "上下" },
	{ key: "R", action: "立即重读" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "BS", action: "关掉本页" },
	{ key: "Fn+BS", action: "回选应用" },
]);

export function helpTitle(): string {
	return "信息帮助";
}

export function helpFor(): readonly HelpRow[] {
	return INFO_HELP;
}
