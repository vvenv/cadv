export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "M", action: "手动 / 听声档" },
	{ key: "S", action: "灵敏 高/中/低" },
	{ key: "Enter", action: "加 / 开听" },
	{ key: "BS", action: "− 减" },
	{ key: "K/J", action: "步长灯" },
	{ key: "R", action: "清零" },
	{ key: "-/=", action: "音量" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "计数帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
