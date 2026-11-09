/*
	Per-screen help. Key left / action right on the 240px list.
	One key (or paired opposite keys) per action.
*/

export type HelpRow = { key: string; action: string };

const LIST_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "K/J", action: "左右" },
	{ key: "→", action: "下一个" },
	{ key: "Enter", action: "再按载入" },
	{ key: "超", action: "镜像写不进槽" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "BS", action: "重扫" },
	{ key: "USB", action: "挂到 cadv" },
	{ key: "Fn+BS", action: "载入后回来" },
], true);

export function helpTitle(): string {
	return "SD 帮助";
}

export function helpFor(): readonly HelpRow[] {
	return LIST_HELP;
}
