/*
	Per-screen help. Key left / action right on the 240px list.
*/

export type HelpRow = { key: string; action: string };

const LEVEL_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "G", action: "当前姿态置零" },
	{ key: "R", action: "清除置零" },
	{ key: "P", action: "清除峰值" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "M", action: "开关告警" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "不平", action: "滴声加快" },
	{ key: "平放", action: "二维气泡" },
	{ key: "立边", action: "一维管" },
	{ key: "BS", action: "关掉本页" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "水平仪帮助";
}

export function helpFor(): readonly HelpRow[] {
	return LEVEL_HELP;
}
