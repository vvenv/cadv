/*
	Title plus five rows, same band pitch as the shared list.
	Side pad stays at 2px so a MAC still fits beside a two-character label.
	The value keeps its width; the label clips first.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, FONT_UI, INK, ON } from "ink";
import { rowTextY } from "list";

export type InfoRow = { label: string; value: string };

const PAD_X = 2;
const GAP = 6;

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

function drawText(port: PortContent, text: string, color: string, x: number, y: number, width: number) {
	if (width <= 0 || !text)
		return;
	port.drawString(text, style(), color, x, y, width);
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
		const titleW = port.measureString(this.title, faceStyle).width;
		const titleX = Math.max(0, Math.floor((width - titleW) / 2));
		drawText(port, this.title, ON, titleX, rowTextY(0), Math.max(1, width - titleX));
		const left = PAD_X;
		const right = width - PAD_X;
		const inner = Math.max(1, right - left);
		for (let i = 0; i < this.rows.length; i++) {
			const row = this.rows[i];
			const y = rowTextY(i + 1);
			const labelW = port.measureString(row.label, faceStyle).width;
			const valueW = port.measureString(row.value, faceStyle).width;
			let valueMax = valueW;
			let labelMax = labelW;
			if (labelW + GAP + valueW > inner) {
				valueMax = Math.min(valueW, Math.max(1, inner - GAP));
				labelMax = Math.max(0, inner - GAP - valueMax);
			}
			drawText(port, row.label, INK, left, y, labelMax);
			drawText(port, row.value, ON, right - valueMax, y, valueMax);
		}
	}
}
