/*
	Note editor view: title row plus five text rows on the 240×135 panel.
	Lines wrap by measured pixel width (at the last space when there is one),
	the view scrolls to keep the cursor in sight, and ↑↓ keep the cursor's
	pixel column. Text and cursor are owned by the app; this view only lays
	them out and reports where the cursor lands for vertical moves.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph } from "draw";
import { BG, DIM, EDGE_PAD, FONT_UI, INK, ON, type Glyph } from "ink";
import { MENU_VISIBLE, ROW_PITCH, rowOrigin, rowTextY } from "list";
import { themeGeneration } from "theme";

/** One visual row: text[start, end). A hard newline sits at `end`. */
export type Row = { start: number; end: number };

const PAD_X = EDGE_PAD;
const GUTTER = 6;
const TITLE_MARK = 18;
const TITLE_MARK_GAP = 6;
const PANEL_W = 240;
const CARET_W = 2;

let editStyle: any;
let editStyleGen = -1;
function getStyle(): any {
	const gen = themeGeneration();
	if (!editStyle || editStyleGen !== gen) {
		editStyle = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
		editStyleGen = gen;
	}
	return editStyle;
}

/* Created on first use: a Map built at preload time would be frozen into flash. */
let widths: Map<string, number> | null = null;
function charWidth(ch: string): number {
	if (!widths)
		widths = new Map();
	let w = widths.get(ch);
	if (w === undefined) {
		try {
			w = getStyle().measure(ch).width as number;
		}
		catch {
			w = 10;
		}
		widths.set(ch, w!);
	}
	return w!;
}

function textWidth(text: string, start: number, end: number): number {
	let w = 0;
	for (let i = start; i < end; i++)
		w += charWidth(text.charAt(i));
	return w;
}

export function layout(text: string, width: number): Row[] {
	const rows: Row[] = [];
	let start = 0;
	while (true) {
		let w = 0;
		let i = start;
		let lastSpace = -1;
		let broke = false;
		while (i < text.length) {
			const ch = text.charAt(i);
			if (ch === "\n")
				break;
			const cw = charWidth(ch);
			if (w + cw > width && i > start) {
				// Soft wrap: a space here hangs off this row; otherwise
				// break after the last space, or mid-word when there is none.
				const cut = ch === " " ? i + 1 : lastSpace >= start ? lastSpace + 1 : i;
				rows.push({ start, end: cut });
				start = cut;
				broke = true;
				break;
			}
			if (ch === " ")
				lastSpace = i;
			w += cw;
			i++;
		}
		if (broke)
			continue;
		rows.push({ start, end: i });
		if (i >= text.length)
			break;
		start = i + 1; // skip the newline
	}
	return rows;
}

/** Row holding the cursor. At a soft-wrap boundary the cursor shows at the next row's start. */
export function rowOf(rows: Row[], cursor: number): number {
	for (let r = 0; r < rows.length; r++) {
		const row = rows[r];
		if (cursor < row.start)
			return Math.max(0, r - 1);
		if (cursor < row.end)
			return r;
		if (cursor === row.end) {
			const next = rows[r + 1];
			if (next && next.start === cursor)
				continue; // soft wrap: belongs to the next row
			return r;
		}
	}
	return rows.length - 1;
}

export class EditBehavior extends Behavior {
	title = "";
	mark: Glyph = "";
	level = 0;
	text = "";
	cursor = 0;
	rows: Row[] = [{ start: 0, end: 0 }];
	top = 0;
	/** Pixel column ↑↓ try to keep; -1 means take it from the cursor. */
	goalX = -1;
	textWidth = PANEL_W - PAD_X * 2 - GUTTER;
	themeGen = -1;

	setDoc(port: unknown, title: string, text: string, cursor: number, mark: Glyph = "", level = 0) {
		const gen = themeGeneration();
		const changedText = text !== this.text || gen !== this.themeGen;
		if (
			!changedText
			&& title === this.title
			&& cursor === this.cursor
			&& mark === this.mark
			&& level === this.level
		)
			return;
		if (gen !== this.themeGen)
			widths = null;
		this.title = title;
		this.mark = mark;
		this.level = level;
		this.themeGen = gen;
		const w = port && typeof port === "object" && "width" in port ? (port as { width: number }).width : 0;
		this.textWidth = (w > 0 ? w : PANEL_W) - PAD_X * 2 - GUTTER;
		if (changedText) {
			this.text = text;
			this.rows = layout(text, this.textWidth);
		}
		this.cursor = Math.max(0, Math.min(cursor, text.length));
		const r = rowOf(this.rows, this.cursor);
		if (r < this.top)
			this.top = r;
		else if (r >= this.top + MENU_VISIBLE)
			this.top = r - MENU_VISIBLE + 1;
		this.top = Math.max(0, Math.min(this.top, Math.max(0, this.rows.length - MENU_VISIBLE)));
		if (r < this.top)
			this.top = r;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	/** Cursor after moving one visual row; same position when there is nowhere to go. */
	vertical(dir: -1 | 1): number {
		const rows = this.rows;
		const r = rowOf(rows, this.cursor);
		const target = r + dir;
		if (target < 0)
			return 0;
		if (target >= rows.length)
			return this.text.length;
		if (this.goalX < 0)
			this.goalX = textWidth(this.text, rows[r].start, this.cursor);
		const row = rows[target];
		let x = 0;
		let i = row.start;
		while (i < row.end) {
			const cw = charWidth(this.text.charAt(i));
			if (x + cw / 2 > this.goalX)
				break;
			x += cw;
			i++;
		}
		// Do not land after a soft-wrap space; it would show on the next row.
		const next = rows[target + 1];
		if (i === row.end && next && next.start === row.end && i > row.start)
			i--;
		return i;
	}

	onDraw(port: PortContent) {
		const style = getStyle();
		const width = port.width;
		port.fillColor(BG, 0, 0, width, port.height);
		const rows = this.rows;
		const scrolling = rows.length > MENU_VISIBLE;
		const gutter = scrolling ? GUTTER : 0;

		const titleMark = this.mark ? TITLE_MARK + TITLE_MARK_GAP : 0;
		const titleW = port.measureString(this.title, style).width;
		const titleX = Math.max(0, Math.floor((width - gutter - titleW - titleMark) / 2));
		if (this.mark)
			drawGlyph(port, titleX + TITLE_MARK / 2, rowOrigin(0) + Math.floor(ROW_PITCH / 2), TITLE_MARK, this.mark, this.level);
		port.drawString(this.title, style, ON, titleX + titleMark, rowTextY(0), Math.max(1, width - titleX - titleMark));
		port.fillColor(DIM, PAD_X, rowOrigin(1) - 1, width - PAD_X * 2, 1);

		const cr = rowOf(rows, this.cursor);
		for (let i = 0; i < MENU_VISIBLE; i++) {
			const r = this.top + i;
			const row = rows[r];
			if (!row)
				break;
			const y = rowTextY(i + 1);
			const s = this.text.slice(row.start, row.end);
			if (s.length)
				port.drawString(s, style, INK, PAD_X, y, this.textWidth + 4);
			if (r === cr) {
				const cx = PAD_X + textWidth(this.text, row.start, this.cursor);
				port.fillColor(ON, Math.min(cx, width - gutter - CARET_W), rowOrigin(i + 1) + 2, CARET_W, ROW_PITCH - 4);
			}
		}
		if (!scrolling)
			return;
		const trackTop = rowOrigin(1);
		const trackH = MENU_VISIBLE * ROW_PITCH - 2;
		const pip = 10;
		const maxTop = rows.length - MENU_VISIBLE;
		const travel = Math.max(0, trackH - pip);
		const thumbY = trackTop + (maxTop > 0 ? Math.floor(travel * this.top / maxTop) : 0);
		port.fillColor(DIM, width - 3, trackTop, 2, trackH);
		port.fillColor(ON, width - 3, thumbY, 2, pip);
	}
}

export function asEdit(target: unknown): EditBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: EditBehavior }).behavior;
	return b && typeof b.setDoc === "function" ? b : null;
}
