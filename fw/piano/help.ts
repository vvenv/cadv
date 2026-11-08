export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "A W S E", action: "C C# D D#" },
	{ key: "D F T G", action: "E F F# G" },
	{ key: "Y H U J", action: "G# A A# B" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "琴帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
