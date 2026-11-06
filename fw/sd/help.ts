/*
	Per-screen help. Key left / action right on the 240px list.
*/

export type HelpRow = { key: string; action: string };

const LIST_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?/", action: "打开本页" },
	{ key: "j/k/,/.", action: "上下" },
	{ key: "Fn+K/J", action: "上下" },
	{ key: "Enter/空格", action: "再按载入" },
	{ key: "BS/Esc/Fn+H", action: "重扫" },
	{ key: "USB", action: "挂到 cadv" },
	{ key: "Fn+BS", action: "载入后回来" },
]);

export function helpTitle(): string {
	return "SD 帮助";
}

export function helpFor(): readonly HelpRow[] {
	return LIST_HELP;
}
