export type HelpRow = { key: string; action: string };

const ROWS: HelpRow[] = [
	{ key: "?", action: "打开本页" },
	{ key: "Enter", action: "开始/停止" },
	{ key: "K/J", action: "加快/放慢" },
	{ key: "B", action: "拍号 2-6" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
];

export function helpTitle(): string {
	return "节拍帮助";
}

export function helpFor(): HelpRow[] {
	return ROWS;
}
