/*
	Paginated help list for MenuBehavior.setList.
	Each firmware keeps its own help rows; this only windows them.
*/

import { MENU_VISIBLE } from "list";

export type HelpRow = { key: string; action: string };

export type HelpListLine = {
	text: string;
	right: string;
	selected: false;
};

export function clampHelpIndex(index: number, count: number, visible = MENU_VISIBLE): number {
	const max = count > visible ? count - visible : 0;
	if (!(index >= 0))
		return 0;
	if (index > max)
		return max;
	return index | 0;
}

/** Clamp host.helpIndex and build one window of key/action lines. */
export function helpList(
	rows: readonly HelpRow[],
	host: { helpIndex: number },
	title: string,
	visible = MENU_VISIBLE,
): { title: string; lines: HelpListLine[] } {
	const total = rows.length;
	const start = clampHelpIndex(host.helpIndex, total, visible);
	host.helpIndex = start;
	const lines: HelpListLine[] = [];
	for (let i = 0; i < visible; i++) {
		const row = rows[start + i];
		if (row)
			lines.push({ text: row.key, right: row.action, selected: false });
	}
	return {
		title: title + " " + (start + 1) + "/" + total,
		lines,
	};
}
