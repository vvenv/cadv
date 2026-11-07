/*
	Lookup help. Key left / action right on the 240px list.
	j and k are letters here, so the list moves with ,/. or Fn+K/J.
*/

export type HelpRow = { key: string; action: string };

const ROWS: HelpRow[] = [
	{ key: "?", action: "打开本页" },
	{ key: "字母", action: "输入" },
	{ key: "BS", action: "删一字母" },
	{ key: "Esc", action: "清空" },
	{ key: ",/.", action: "上一条/下一条" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
];

export function helpTitle(): string {
	return "查词帮助";
}

export function helpFor(): HelpRow[] {
	return ROWS;
}
