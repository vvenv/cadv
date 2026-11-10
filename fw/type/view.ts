/*
	Typing face. Title strip, the current line (typed chars coloured, the
	caret under the next one), the next line dimmed, a progress bar.
	After a round the middle shows the result rows instead.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph, drawProgress } from "draw";
import { BG, FONT_UI, INK, MID, ON, RED, WELL, type Glyph } from "ink";
import { rowOrigin, rowTextY, ROW_PITCH } from "list";
import { themeGeneration } from "theme";

export type ResultRow = { key: string; value: string };

export type TypeState = {
	title: string;
	right: string;
	target: string;
	typed: string;
	next: string;
	progress: number;
	result: ResultRow[];
	mark: Glyph;
	level: number;
};

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

export function asType(target: unknown): TypeBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: TypeBehavior }).behavior;
	return b && typeof b.setState === "function" ? b : null;
}

function same(a: TypeState, b: TypeState): boolean {
	if (a.title !== b.title || a.right !== b.right || a.target !== b.target || a.typed !== b.typed
		|| a.next !== b.next || a.progress !== b.progress || a.mark !== b.mark || a.level !== b.level
		|| a.result.length !== b.result.length)
		return false;
	for (let i = 0; i < a.result.length; i++) {
		if (a.result[i].key !== b.result[i].key || a.result[i].value !== b.result[i].value)
			return false;
	}
	return true;
}

/* Spaces are narrow in the UI font; give them a visible cell so a missed space shows. */
const SPACE_W = 9;

export class TypeBehavior extends Behavior {
	state: TypeState = {
		title: "", right: "", target: "", typed: "", next: "", progress: 0, result: [], mark: "", level: 0,
	};
	gen = -1;

	setState(port: unknown, next: TypeState) {
		const gen = themeGeneration();
		if (gen === this.gen && same(this.state, next))
			return;
		this.state = next;
		this.gen = gen;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	charWidth(port: PortContent, ch: string): number {
		if (ch === " ")
			return SPACE_W;
		return port.measureString(ch, style()).width;
	}

	onDraw(port: PortContent) {
		const s = this.state;
		const width = port.width;
		const height = port.height;
		const st = style();
		port.fillColor(BG, 0, 0, width, height);

		const titleCy = rowOrigin(0) + Math.floor(ROW_PITCH / 2);
		let tx = 6;
		if (s.mark) {
			drawGlyph(port, tx + 9, titleCy, 18, s.mark, s.level);
			tx += 24;
		}
		const rightW = port.measureString(s.right, st).width;
		port.drawString(s.right, st, MID, width - 6 - rightW, rowTextY(0), rightW + 2);
		port.drawString(s.title, st, ON, tx, rowTextY(0), Math.max(1, width - tx - rightW - 12));

		if (s.result.length) {
			for (let i = 0; i < s.result.length; i++) {
				const row = s.result[i];
				const y = rowTextY(i + 1) + 4;
				port.drawString(row.key, st, MID, 10, y, 80);
				const vw = port.measureString(row.value, st).width;
				port.drawString(row.value, st, i === 0 ? ON : INK, width - 10 - vw, y, vw + 2);
			}
			const hint = "Enter 再来";
			const hw = port.measureString(hint, st).width;
			port.drawString(hint, st, MID, Math.floor((width - hw) / 2), rowTextY(5) + 2, hw + 2);
			return;
		}

		/* Current line: measure first so it can be centred. */
		let lineW = 0;
		for (let i = 0; i < s.target.length; i++)
			lineW += this.charWidth(port, s.target.charAt(i));
		let x = Math.max(4, Math.floor((width - lineW) / 2));
		const lineTop = rowOrigin(2) - 4;
		const y = lineTop - 6 + 3;
		for (let i = 0; i < s.target.length; i++) {
			const want = s.target.charAt(i);
			const w = this.charWidth(port, want);
			if (i < s.typed.length) {
				const ok = s.typed.charAt(i) === want;
				if (!ok) {
					/* A miss gets a red cell; the expected char stays readable on it. */
					port.fillColor(RED, x, lineTop + 1, w, ROW_PITCH - 2);
					if (want !== " ")
						port.drawString(want, st, BG, x, y, w + 2);
				}
				else if (want !== " ")
					port.drawString(want, st, MID, x, y, w + 2);
			}
			else {
				if (i === s.typed.length) {
					port.fillColor(WELL, x, lineTop + 1, w, ROW_PITCH - 2);
					port.fillColor(ON, x, lineTop + ROW_PITCH - 1, w, 3);
				}
				if (want !== " ")
					port.drawString(want, st, INK, x, y, w + 2);
			}
			x += w;
		}

		if (s.next) {
			const nw = port.measureString(s.next, st).width;
			port.drawString(s.next, st, MID, Math.max(4, Math.floor((width - nw) / 2)), rowTextY(4) - 2, width - 8);
		}
		drawProgress(port, 8, height - 10, width - 16, 6, s.progress);
	}
}
