export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "立起", action: "开始" },
	{ key: "放平", action: "暂停" },
	{ key: "Enter", action: "开始/暂停" },
	{ key: "K/J", action: "加长/缩短" },
	{ key: "R", action: "回到开头" },
	{ key: "G", action: "开关姿态" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "计时帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
