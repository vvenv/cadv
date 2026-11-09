/*
	Title plus five rows, same band pitch as the shared list.
	Side pad stays at 2px so a MAC still fits beside a two-character label.
	The value keeps its width; the label clips first.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph } from "draw";
import { BG, FONT_UI, INK, ON, type Glyph } from "ink";
import { rowOrigin, rowTextY, ROW_PITCH } from "list";
import { themeGeneration } from "theme";

export type InfoRow = { label: string; value: string; glyph?: Glyph; level?: number };

const PAD_X = 2;
const GAP = 6;
const TITLE_MARK = 18;
const TITLE_MARK_GAP = 6;
const ROW_GLYPH = 14;
const ROW_GLYPH_GAP = 4;

let face: /* Style */ object | undefined;
let faceGen = -1;
function style(): /* Style */ any {
	const gen = themeGeneration();
	if (!face || faceGen !== gen) {
		face = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
		faceGen = gen;
	}
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
	mark: Glyph = "";
	level = 0;
	rows: InfoRow[] = [];

	setRows(port: unknown, title: string, rows: InfoRow[], mark: Glyph = "", level?: number) {
		this.title = title;
		this.mark = mark;
		this.level = level === undefined ? 0 : level;
		this.rows = rows;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const faceStyle = style();
		const width = port.width;
		port.fillColor(BG, 0, 0, width, port.height);
		const titleMark = this.mark ? TITLE_MARK + TITLE_MARK_GAP : 0;
		const titleW = port.measureString(this.title, faceStyle).width;
		const titleBlock = titleW + titleMark;
		const titleX = Math.max(0, Math.floor((width - titleBlock) / 2));
		if (this.mark) {
			drawGlyph(
				port,
				titleX + Math.floor(TITLE_MARK / 2),
				rowOrigin(0) + Math.floor(ROW_PITCH / 2),
				TITLE_MARK,
				this.mark,
				this.level,
			);
		}
		drawText(port, this.title, ON, titleX + titleMark, rowTextY(0), Math.max(1, width - titleX - titleMark));
		const left = PAD_X;
		const right = width - PAD_X;
		for (let i = 0; i < this.rows.length; i++) {
			const row = this.rows[i];
			const y = rowTextY(i + 1);
			const glyph = row.glyph || "";
			const glyphW = glyph ? ROW_GLYPH + ROW_GLYPH_GAP : 0;
			if (glyph) {
				drawGlyph(
					port,
					left + Math.floor(ROW_GLYPH / 2),
					rowOrigin(i + 1) + Math.floor(ROW_PITCH / 2),
					ROW_GLYPH,
					glyph,
					row.level,
				);
			}
			const textLeft = left + glyphW;
			const inner = Math.max(1, right - textLeft);
			const labelW = port.measureString(row.label, faceStyle).width;
			const valueW = port.measureString(row.value, faceStyle).width;
			let valueMax = valueW;
			let labelMax = labelW;
			if (labelW + GAP + valueW > inner) {
				valueMax = Math.min(valueW, Math.max(1, inner - GAP));
				labelMax = Math.max(0, inner - GAP - valueMax);
			}
			drawText(port, row.label, INK, textLeft, y, labelMax);
			drawText(port, row.value, ON, right - valueMax, y, valueMax);
		}
	}
}
