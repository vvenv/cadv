/*
	Title plus a short status line for the USB disk screen.
	Glyphs match shared info / menu faces (usb / ok / bad / sd).
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph } from "draw";
import { BG, FONT_UI, INK, ON, type Glyph } from "ink";
import { rowOrigin, rowTextY, ROW_PITCH } from "list";

const PAD_X = 2;
const TITLE_MARK = 18;
const TITLE_MARK_GAP = 6;
const ROW_GLYPH = 16;
const ROW_GLYPH_GAP = 6;

let face: /* Style */ object | undefined;
function style(): /* Style */ any {
	if (!face)
		face = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
	return face;
}

export function asUsb(target: unknown): UsbViewBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: UsbViewBehavior }).behavior;
	return b && typeof b.setFrame === "function" ? b : null;
}

function drawText(port: PortContent, text: string, color: string, x: number, y: number, width: number) {
	if (width <= 0 || !text)
		return;
	port.drawString(text, style(), color, x, y, width);
}

export class UsbViewBehavior extends Behavior {
	title = "";
	line = "";
	note = "";
	mark: Glyph = "";
	lineMark: Glyph = "";
	noteMark: Glyph = "";
	level = 0;

	setFrame(
		port: unknown,
		title: string,
		line: string,
		note = "",
		mark: Glyph = "",
		lineMark: Glyph = "",
		noteMark: Glyph = "",
		level?: number,
	) {
		this.title = title;
		this.line = line;
		this.note = note;
		this.mark = mark;
		this.lineMark = lineMark;
		this.noteMark = noteMark;
		this.level = level === undefined ? 0 : level;
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

		if (this.line) {
			const glyphW = this.lineMark ? ROW_GLYPH + ROW_GLYPH_GAP : 0;
			if (this.lineMark) {
				drawGlyph(
					port,
					PAD_X + Math.floor(ROW_GLYPH / 2),
					rowOrigin(2) + Math.floor(ROW_PITCH / 2),
					ROW_GLYPH,
					this.lineMark,
				);
			}
			drawText(port, this.line, ON, PAD_X + glyphW, rowTextY(2), Math.max(1, width - PAD_X * 2 - glyphW));
		}
		if (this.note) {
			const glyphW = this.noteMark ? ROW_GLYPH + ROW_GLYPH_GAP : 0;
			if (this.noteMark) {
				drawGlyph(
					port,
					PAD_X + Math.floor(ROW_GLYPH / 2),
					rowOrigin(3) + Math.floor(ROW_PITCH / 2),
					ROW_GLYPH,
					this.noteMark,
				);
			}
			drawText(port, this.note, INK, PAD_X + glyphW, rowTextY(3), Math.max(1, width - PAD_X * 2 - glyphW));
		}
	}
}
