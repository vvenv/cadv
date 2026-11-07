/*
	Five rows under a title. Same 21px step as the shared list, with a
	tighter side pad so a MAC still fits beside a two-character label.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, FONT_UI, INK, ON } from "ink";

export type InfoRow = { label: string; value: string };

const ROW = 21;
const DRAW_H = 30;
const PAD_X = 2;
const GAP = 4;

let face: /* Style */ object | undefined;
function style(): /* Style */ any {
	if (!face)
		face = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
	return face;
}

export function asInfo(target: unknown): InfoBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: InfoBehavior }).behavior;
	return b && typeof b.setRows === "function" ? b : null;
}

function drawCentered(port: PortContent, text: string, y: number) {
	const faceStyle = style();
	const w = port.measureString(text, faceStyle).width;
	const x = Math.max(0, Math.floor((port.width - w) / 2));
	port.drawString(text, faceStyle, INK, x, y, Math.max(1, port.width - x), DRAW_H);
}

export class InfoBehavior extends Behavior {
	title = "";
	rows: InfoRow[] = [];

	setRows(port: unknown, title: string, rows: InfoRow[]) {
		this.title = title;
		this.rows = rows;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const faceStyle = style();
		const width = port.width;
		port.fillColor(BG, 0, 0, width, port.height);
		drawCentered(port, this.title, 0);
		const left = PAD_X;
		const right = width - PAD_X;
		const inner = Math.max(1, right - left);
		for (let i = 0; i < this.rows.length; i++) {
			const row = this.rows[i];
			const y = (i + 1) * ROW;
			const labelW = port.measureString(row.label, faceStyle).width;
			const valueW = port.measureString(row.value, faceStyle).width;
			if (labelW + GAP + valueW <= inner) {
				port.drawString(row.label, faceStyle, INK, left, y, labelW, DRAW_H);
				port.drawString(row.value, faceStyle, ON, right - valueW, y, valueW, DRAW_H);
				continue;
			}
			const labelMax = Math.max(1, Math.min(labelW, inner));
			port.drawString(row.label, faceStyle, INK, left, y, labelMax, DRAW_H);
			const valueX = left + labelMax + GAP;
			const valueMax = Math.max(1, right - valueX);
			port.drawString(row.value, faceStyle, ON, valueX, y, valueMax, DRAW_H);
		}
	}
}
