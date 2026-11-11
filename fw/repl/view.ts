/*
	Terminal face. Fixed 12 px cells in Code-Bold-20 (ASCII only), 22 px rows,
	bottom-anchored: scrollback rows, then the prompt + input, with a block caret.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, INK, MID, ON, RED } from "ink";
import { themeGeneration } from "theme";
import type { Kind } from "repl";

export const FONT_CODE = "bold 20px Code";
export const CELL_W = 12;
export const ROW_H = 22;
/** Glyph ink sits at 4..25 of the 26 px line; lift it so it fills the 22 px row. */
const TEXT_DY = -3;
export const PAD_X = 6;
/** 240 px panel: 19 columns. */
export const COLS = 19;
/** 135 px panel: 6 rows (paging step; drawing fills whatever height the port has). */
export const ROWS = 6;

export type Row = { text: string; kind: Kind };

export type TermState = {
	/** Wrapped scrollback, oldest first. */
	rows: Row[];
	/** Prompt + input, wrapped. */
	input: string[];
	/** Caret cell inside `input`. */
	caretRow: number;
	caretCol: number;
	/** Rows scrolled up from the bottom. */
	scroll: number;
	/** Short status in the top-right corner (scroll position). */
	badge: string;
};

let face: object | undefined;
let faceGen = -1;
function style(): any {
	const gen = themeGeneration();
	if (!face || faceGen !== gen) {
		face = new Style({ font: FONT_CODE, color: INK, horizontal: "left", vertical: "top" });
		faceGen = gen;
	}
	return face;
}

function color(kind: Kind): string {
	if (kind === "out")
		return ON;
	if (kind === "err")
		return RED;
	if (kind === "info")
		return MID;
	return INK;
}

/** Split text into COLS-wide rows. Non-ASCII has no glyph in Code; show it as `?`. */
export function wrap(text: string, cols = COLS): string[] {
	const out: string[] = [];
	for (const line of text.split("\n")) {
		let clean = "";
		for (let i = 0; i < line.length; i++) {
			const c = line.charCodeAt(i);
			if (c === 9)
				clean += "  ";
			else
				clean += c >= 32 && c <= 126 ? line.charAt(i) : "?";
		}
		if (!clean.length) {
			out.push("");
			continue;
		}
		for (let i = 0; i < clean.length; i += cols)
			out.push(clean.slice(i, i + cols));
	}
	return out;
}

export function asTerm(target: unknown): TermBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: TermBehavior }).behavior;
	return b && typeof b.setState === "function" ? b : null;
}

export class TermBehavior extends Behavior {
	state: TermState = { rows: [], input: [], caretRow: 0, caretCol: 0, scroll: 0, badge: "" };

	setState(port: unknown, next: TermState) {
		this.state = next;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const s = this.state;
		const st = style();
		const width = port.width;
		port.fillColor(BG, 0, 0, width, port.height);

		/* Visible window over scrollback + input, counted from the bottom. */
		const total = s.rows.length + s.input.length;
		const end = Math.max(0, total - s.scroll);
		const start = Math.max(0, end - Math.max(1, Math.floor((port.height - 3) / ROW_H)));
		const top = port.height - (end - start) * ROW_H - 3;
		for (let i = start; i < end; i++) {
			const y = top + (i - start) * ROW_H;
			if (i < s.rows.length) {
				const r = s.rows[i];
				if (r.text)
					port.drawString(r.text, st, color(r.kind), PAD_X, y + TEXT_DY, width - PAD_X);
				continue;
			}
			const k = i - s.rows.length;
			const text = s.input[k];
			if (text)
				port.drawString(text, st, INK, PAD_X, y + TEXT_DY, width - PAD_X);
			if (k === s.caretRow && !s.scroll) {
				const x = PAD_X + s.caretCol * CELL_W;
				port.fillColor(ON, x, y, CELL_W, ROW_H);
				const ch = text.charAt(s.caretCol);
				if (ch && ch !== " ")
					port.drawString(ch, st, BG, x, y + TEXT_DY, CELL_W + 1);
			}
		}
		if (s.badge) {
			const w = s.badge.length * CELL_W + 4;
			port.fillColor(MID, width - w - 2, 0, w, ROW_H);
			port.drawString(s.badge, st, BG, width - w, TEXT_DY, w);
		}
	}
}
