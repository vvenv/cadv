/*
	Per-screen help. Key left / action right on the 240px list.
	One key (or paired opposite keys) per action.
*/

export type HelpRow = { key: string; action: string };

const LIST_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "Enter", action: "载入" },
	{ key: "载入中+BS", action: "取消" },
	{ key: ", /", action: "左右" },
	{ key: "; . K/J", action: "上下一行" },
	{ key: "字母", action: "按 id 首字母跳" },
	{ key: "超", action: "镜像写不进槽" },
	{ key: "BS", action: "重扫" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "USB", action: "挂到 cadv" },
	{ key: "Fn+BS", action: "载入后回来" },
], true);

export function helpTitle(): string {
	return "SD 帮助";
}

export function helpFor(): readonly HelpRow[] {
	return LIST_HELP;
}
