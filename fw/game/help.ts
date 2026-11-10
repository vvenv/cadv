export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "K/J", action: "选游戏" },
	{ key: "Enter", action: "开始/再来" },
	{ key: "; . , /", action: "上 下 左 右" },
	{ key: "W A S D", action: "上 左 下 右" },
	{ key: "P", action: "暂停" },
	{ key: "方块 ; / W", action: "转" },
	{ key: "方块 Z", action: "反着转" },
	{ key: "方块 空格", action: "直接落下" },
	{ key: "BS", action: "回游戏列表" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "游戏帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
