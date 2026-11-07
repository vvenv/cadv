export type HelpRow = { key: string; action: string };

const ROWS: HelpRow[] = [
	{ key: "?", action: "打开本页" },
	{ key: "K/J", action: "步幅加减" },
	{ key: "R", action: "今天清零" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
];

export function helpTitle(): string {
	return "计步帮助";
}

export function helpFor(): HelpRow[] {
	return ROWS;
}
