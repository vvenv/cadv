export type HelpRow = { key: string; action: string };

const ROWS: HelpRow[] = [
	{ key: "?", action: "打开本页" },
	{ key: "对准", action: "音分接近 0" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
];

export function helpTitle(): string {
	return "调音帮助";
}

export function helpFor(): HelpRow[] {
	return ROWS;
}
