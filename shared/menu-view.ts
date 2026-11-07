/*
	Full-screen list on the 135px panel.
	UI-Bold-20 puts CJK ink about 6px below the draw y, roughly 21px tall.
	Title plus MENU_VISIBLE rows step by ROW_PITCH so those glyphs do not stack.
	The selected row is a lit key: black on green, inset so the black rails show,
	with a tongue on the left edge. A dim track and a lit thumb show when the
	list is longer than the window. `hint` is kept for callers; this panel has
	no footer band. Identical lists do not invalidate.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, DIM, FONT_UI, INK, ON } from "ink";
import { MENU_VISIBLE, ROW_PITCH, rowOrigin, rowTextY, windowStart } from "list";

/** `right` draws flush-right (help: key left, action right). */
export type MenuLine = { text: string; selected: boolean; right?: string };

const BAR_H = ROW_PITCH - 1;
const PAD_X = 8;
const GUTTER = 6;
const INSET_X = 4;

let menuStyle: /* Style */ object | undefined;
function getMenuStyle(): /* Style */ any {
	if (!menuStyle)
		menuStyle = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
	return menuStyle;
}

export function asMenu(target: unknown): MenuBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: MenuBehavior }).behavior;
	return b && typeof b.setList === "function" ? b : null;
}

function drawText(port: PortContent, text: string, color: string, x: number, y: number, width: number) {
	port.drawString(text, getMenuStyle(), color, x, y, Math.max(1, width));
}

function sameLines(a: MenuLine[], b: MenuLine[]): boolean {
	if (a.length !== b.length)
		return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i].text !== b[i].text || a[i].selected !== b[i].selected || a[i].right !== b[i].right)
			return false;
	}
	return true;
}

export class MenuBehavior extends Behavior {
	title = "";
	hint = "";
	lines: MenuLine[] = [];

	setList(port: unknown, title: string, lines: MenuLine[], hint: string) {
		if (title === this.title && hint === this.hint && sameLines(this.lines, lines))
			return;
		this.title = title;
		this.hint = hint;
		this.lines = lines;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const style = getMenuStyle();
		const width = port.width;
		port.fillColor(BG, 0, 0, width, port.height);
		const visible = MENU_VISIBLE;
		let selected = 0;
		let marked = false;
		for (let i = 0; i < this.lines.length; i++) {
			if (this.lines[i].selected) {
				selected = i;
				marked = true;
				break;
			}
		}
		const start = windowStart(marked ? selected : 0, this.lines.length, visible);
		const scrolling = this.lines.length > visible;
		const gutter = scrolling ? GUTTER : 0;
		const innerRight = width - PAD_X - gutter;
		const titleW = port.measureString(this.title, style).width;
		const titleX = Math.max(0, Math.floor((width - gutter - titleW) / 2));
		drawText(port, this.title, ON, titleX, rowTextY(0), Math.max(1, width - gutter - titleX));
		for (let i = 0; i < visible; i++) {
			const line = this.lines[start + i];
			if (!line)
				continue;
			const top = rowOrigin(i + 1);
			const color = line.selected ? BG : INK;
			if (line.selected) {
				const barW = Math.max(1, width - gutter - INSET_X * 2);
				port.fillColor(ON, INSET_X, top, barW, BAR_H);
				port.fillColor(ON, 0, top + 6, INSET_X, BAR_H - 12);
			}
			const y = rowTextY(i + 1);
			const inner = Math.max(1, innerRight - PAD_X);
			if (line.right) {
				const rightW = port.measureString(line.right, style).width;
				const gap = 8;
				const leftMax = Math.max(1, inner - rightW - gap);
				drawText(port, line.text, color, PAD_X, y, leftMax);
				drawText(port, line.right, color, innerRight - rightW, y, rightW);
			}
			else {
				drawText(port, line.text, color, PAD_X, y, inner);
			}
		}
		if (!scrolling)
			return;
		const trackTop = rowOrigin(1);
		const trackH = visible * ROW_PITCH - 2;
		const pip = 10;
		const maxStart = this.lines.length - visible;
		const travel = Math.max(0, trackH - pip);
		const thumbY = trackTop + (maxStart > 0 ? Math.floor(travel * start / maxStart) : 0);
		port.fillColor(DIM, width - 3, trackTop, 2, trackH);
		port.fillColor(ON, width - 3, thumbY, 2, pip);
	}
}
