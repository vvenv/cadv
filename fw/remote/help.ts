export type HelpRow = { key: string; action: string };

const ROWS: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "Tab", action: "换品牌" },
	{ key: "P", action: "电源" },
	{ key: "-/=", action: "音量-/+" },
	{ key: "[/]", action: "频道-/+" },
	{ key: "M", action: "静音" },
	{ key: "I", action: "信号源" },
	{ key: "; . , /", action: "上 下 左 右" },
	{ key: "Enter", action: "确定" },
	{ key: "BS", action: "返回" },
	{ key: "H", action: "主页" },
	{ key: "A", action: "各品牌电源都发" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "遥控帮助";
}

export function helpFor(): readonly HelpRow[] {
	return ROWS;
}
