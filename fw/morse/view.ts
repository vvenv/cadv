/*
	Morse face: title strip, a big character with its dits and dahs drawn
	under it (the sounding element lit), and a text strip at the bottom.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawCheck, drawCross, drawGlyph, fillDisk } from "draw";
import { BG, DIM, FONT_UI, FONT_WORD, INK, MID, ON, RED, type Glyph } from "ink";
import { rowOrigin, rowTextY, ROW_PITCH } from "list";
import { themeGeneration } from "theme";

export type Verdict = "" | "ok" | "bad";

export type MorseState = {
	title: string;
	right: string;
	score: string;
	big: string;
	code: string;
	/** Element index sounding now, or -1. */
	element: number;
	keyDown: boolean;
	text: string;
	/** Chars before this index are played; -1 = no progress colouring. */
	sent: number;
	verdict: Verdict;
	answer: string;
	volume: number;
	mark: Glyph;
	level: number;
};

let ui: /* Style */ object | undefined;
let word: /* Style */ object | undefined;
let styleGen = -1;
function styles(): { ui: any; word: any } {
	const gen = themeGeneration();
	if (!ui || !word || styleGen !== gen) {
		ui = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
		word = new Style({ font: FONT_WORD, color: INK, horizontal: "left", vertical: "top" });
		styleGen = gen;
	}
	return { ui, word };
}

export function asMorse(target: unknown): MorseBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: MorseBehavior }).behavior;
	return b && typeof b.setState === "function" ? b : null;
}

function same(a: MorseState, b: MorseState): boolean {
	return a.title === b.title && a.right === b.right && a.score === b.score && a.big === b.big
		&& a.code === b.code && a.element === b.element && a.keyDown === b.keyDown && a.text === b.text
		&& a.sent === b.sent && a.verdict === b.verdict && a.answer === b.answer && a.volume === b.volume
		&& a.mark === b.mark && a.level === b.level;
}

const DOT_R = 5;
const DASH_W = 26;
const MARK_H = 10;
const MARK_GAP = 9;

function codeSpan(code: string): number {
	let w = 0;
	for (let i = 0; i < code.length; i++) {
		w += code.charAt(i) === "-" ? DASH_W : DOT_R * 2 + 1;
		if (i + 1 < code.length)
			w += MARK_GAP;
	}
	return w;
}

export class MorseBehavior extends Behavior {
	state: MorseState = {
		title: "", right: "", score: "", big: "", code: "", element: -1, keyDown: false,
		text: "", sent: -1, verdict: "", answer: "", volume: 0, mark: "", level: 0,
	};
	gen = -1;

	setState(port: unknown, next: MorseState) {
		const gen = themeGeneration();
		if (gen === this.gen && same(this.state, next))
			return;
		this.state = next;
		this.gen = gen;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const s = this.state;
		const width = port.width;
		const height = port.height;
		const st = styles();
		port.fillColor(BG, 0, 0, width, height);

		/* Title: mode left; score, speed, volume right. */
		const titleCy = rowOrigin(0) + Math.floor(ROW_PITCH / 2);
		let tx = 6;
		if (s.mark) {
			drawGlyph(port, tx + 9, titleCy, 18, s.mark, s.level);
			tx += 24;
		}
		let rx = width - 30;
		drawGlyph(port, width - 16, titleCy, 18, s.volume <= 0 ? "mute" : "vol", s.volume);
		const rightW = port.measureString(s.right, st.ui).width;
		rx -= rightW;
		port.drawString(s.right, st.ui, MID, rx, rowTextY(0), rightW + 2);
		if (s.score) {
			const w = port.measureString(s.score, st.ui).width;
			rx -= w + 8;
			port.drawString(s.score, st.ui, INK, rx, rowTextY(0), w + 2);
		}
		port.drawString(s.title, st.ui, ON, tx, rowTextY(0), Math.max(1, rx - tx - 6));

		/* Big character, centred in the upper middle. */
		const bigTop = ROW_PITCH + 2;
		if (s.big) {
			const color = s.verdict === "bad" ? RED : s.keyDown || s.verdict === "ok" ? ON : INK;
			const m = port.measureString(s.big, st.word);
			port.drawString(s.big, st.word, color, Math.floor((width - m.width) / 2), bigTop - 6, m.width + 2);
		}
		if (s.verdict) {
			const cx = Math.floor(width / 2) + 48;
			const cy = bigTop + 24;
			if (s.verdict === "ok")
				drawCheck(port, cx, cy, 22);
			else {
				drawCross(port, cx, cy, 22);
				const said = "你答 " + s.answer;
				port.drawString(said, st.ui, RED, 8, bigTop + 8, 80);
			}
		}

		/* Dits and dahs. */
		const codeY = bigTop + 58;
		if (s.code) {
			let x = Math.floor((width - codeSpan(s.code)) / 2);
			for (let i = 0; i < s.code.length; i++) {
				const lit = i === s.element;
				const color = lit ? ON : s.element >= 0 && i < s.element ? MID : s.element >= 0 ? DIM : INK;
				if (s.code.charAt(i) === "-") {
					port.fillColor(color, x, codeY - (MARK_H >> 1), DASH_W, MARK_H);
					x += DASH_W;
				}
				else {
					fillDisk(port, x + DOT_R, codeY, DOT_R, color);
					x += DOT_R * 2 + 1;
				}
				x += MARK_GAP;
			}
		}

		/* Text strip: keep the current char in view. */
		if (s.text) {
			const charW = port.measureString("M", st.ui).width;
			const fit = Math.max(1, Math.floor((width - 12) / charW));
			const focus = s.sent < 0 ? s.text.length : Math.min(s.text.length, s.sent + 4);
			const from = Math.max(0, focus - fit);
			const shown = s.text.slice(from, from + fit);
			let x = 6;
			for (let i = 0; i < shown.length; i++) {
				const at = from + i;
				const ch = shown.charAt(i);
				const color = s.sent < 0 ? MID : at < s.sent ? MID : at === s.sent ? ON : INK;
				port.drawString(ch, st.ui, color, x, rowTextY(5), charW + 2);
				x += charW;
			}
		}
	}
}
