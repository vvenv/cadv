/*
	Per-screen help. Lines stay short so 20px UI fits the 240px panel.
*/

const LIST_HELP = Object.freeze([
	"? / 本页",
	"j k , . 上下",
	"Fn+K/J 也是上下",
	"Enter/空格 再按载入",
	"BS Esc Fn+H 重扫",
	"载入后 Fn+BS 回来",
]);

export function helpTitle(): string {
	return "SD 帮助";
}

export function helpFor(): readonly string[] {
	return LIST_HELP;
}
