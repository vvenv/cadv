/*
	Per-screen help. Key left / action right on the 240px list.
*/

export type HelpRow = { key: string; action: string };

const USB_HELP: readonly HelpRow[] = Object.freeze([
	{ key: "?", action: "打开本页" },
	{ key: "用途", action: "SD 挂到电脑" },
	{ key: "退出前", action: "先弹出磁盘" },
	{ key: "占卡", action: "勿同时开录音" },
	{ key: "Fn+[/]", action: "暗/亮" },
	{ key: "BS", action: "关掉本页" },
	{ key: "Fn+BS", action: "停盘回启动器" },
], true);

export function helpTitle(): string {
	return "U 盘帮助";
}

export function helpFor(): readonly HelpRow[] {
	return USB_HELP;
}
