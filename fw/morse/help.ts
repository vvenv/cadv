export type HelpRow = { key: string; action: string };

const SEND: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "Tab", action: "发报/抄收" },
	{ key: "字母 数字", action: "发出" },
	{ key: "空格", action: "词间停顿" },
	{ key: "BS", action: "删未发的字" },
	{ key: "Esc", action: "停止并清空" },
	{ key: "Fn+K/J", action: "快/慢" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

const COPY: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "Tab", action: "发报/抄收" },
	{ key: "字母 数字", action: "答" },
	{ key: "Enter", action: "再听/下一个" },
	{ key: ", /", action: "少一个字/多一个字" },
	{ key: "Fn+K/J", action: "快/慢" },
	{ key: "-/=", action: "小声/大声" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "Fn+T", action: "主题" },
	{ key: "Fn+BS", action: "回选应用" },
], true);

export function helpTitle(): string {
	return "摩斯帮助";
}

export function helpFor(copy: boolean): readonly HelpRow[] {
	return copy ? COPY : SEND;
}
