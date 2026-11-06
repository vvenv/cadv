/*
	Full-screen list. Bold 20px UI ink sits around y+6..y+28, so rows step
	by 21px. Title plus MENU_VISIBLE rows fill the 135px panel.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { MENU_VISIBLE, windowStart } from "list";

export type MenuLine = { text: string; selected: boolean };

const ROW = 21;
const DRAW_H = 30;

let menuStyle: /* Style */ object | undefined;
function getMenuStyle(): /* Style */ any {
	if (!menuStyle)
		menuStyle = new Style({ font: "bold 20px UI", color: "white", horizontal: "left", vertical: "top" });
	return menuStyle;
}

export function asMenu(target: unknown): MenuBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: MenuBehavior }).behavior;
	return b && typeof b.setList === "function" ? b : null;
}

function drawCentered(port: PortContent, text: string, color: string, y: number) {
	const style = getMenuStyle();
	const w = port.measureString(text, style).width;
	const x = Math.max(0, Math.floor((port.width - w) / 2));
	port.drawString(text, style, color, x, y, Math.max(1, port.width - x), DRAW_H);
}

export class MenuBehavior extends Behavior {
	title = "";
	hint = "";
	lines: MenuLine[] = [];

	setList(port: unknown, title: string, lines: MenuLine[], hint: string) {
		this.title = title;
		this.hint = hint;
		this.lines = lines;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const style = getMenuStyle();
		port.fillColor("black", 0, 0, port.width, port.height);
		drawCentered(port, this.title, "white", 0);
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
		const start = windowStart(selected, this.lines.length, visible);
		for (let i = 0; i < visible; i++) {
			const line = this.lines[start + i];
			if (!line)
				continue;
			const y = (i + 1) * ROW;
			if (line.selected)
				port.fillColor("#143214", 0, y + 4, port.width, 22);
			const color = line.selected ? "#39FF14" : "white";
			const text = (marked ? (line.selected ? "> " : "- ") : "") + line.text;
			port.drawString(text, style, color, 6, y, port.width - 12, DRAW_H);
		}
		if (this.hint)
			drawCentered(port, this.hint, "white", (1 + visible) * ROW);
	}
}
