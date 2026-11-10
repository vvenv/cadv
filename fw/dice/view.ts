/*
	Dice face: title strip, big middle (pips / coin / 7-seg number),
	history strip at the bottom. Faces wobble a few px while tumbling.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph, drawReadout, fillDisk, readoutSpan, strokeDisk } from "draw";
import { BG, FONT_UI, INK, MID, ON, WELL, type Glyph } from "ink";
import { rowOrigin, rowTextY, ROW_PITCH } from "list";
import { themeGeneration } from "theme";

export type DiceKind = "dice" | "coin" | "number";

export type DiceState = {
	title: string;
	kind: DiceKind;
	/** 0 = not rolled yet (blank face). */
	faces: number[];
	rolling: boolean;
	history: string;
	volume: number;
	mark: Glyph;
	level: number;
};

/* Pip spots on a 3×3 grid, index = row * 3 + col. */
const PIPS: readonly (readonly number[])[] = Object.freeze([
	[],
	[4],
	[2, 6],
	[2, 4, 6],
	[0, 2, 6, 8],
	[0, 2, 4, 6, 8],
	[0, 2, 3, 5, 6, 8],
]);

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

export function asDice(target: unknown): DiceBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: DiceBehavior }).behavior;
	return b && typeof b.setState === "function" ? b : null;
}

function sameState(a: DiceState, b: DiceState): boolean {
	if (a.title !== b.title || a.kind !== b.kind || a.rolling !== b.rolling || a.history !== b.history
		|| a.volume !== b.volume || a.mark !== b.mark || a.level !== b.level || a.faces.length !== b.faces.length)
		return false;
	for (let i = 0; i < a.faces.length; i++) {
		if (a.faces[i] !== b.faces[i])
			return false;
	}
	return true;
}

function roundRect(port: PortContent, x: number, y: number, w: number, h: number, r: number, color: string) {
	port.fillColor(color, x + r, y, w - 2 * r, h);
	port.fillColor(color, x, y + r, w, h - 2 * r);
	for (let i = 0; i < r; i++) {
		const d = r - i;
		const inset = r - Math.floor(Math.sqrt(r * r - d * d));
		port.fillColor(color, x + inset, y + i, w - 2 * inset, 1);
		port.fillColor(color, x + inset, y + h - 1 - i, w - 2 * inset, 1);
	}
}

function drawDie(port: PortContent, x: number, y: number, size: number, value: number, lit: boolean) {
	roundRect(port, x, y, size, size, 7, lit ? MID : WELL);
	roundRect(port, x + 2, y + 2, size - 4, size - 4, 6, lit ? ON : WELL);
	const spots = PIPS[value] ?? [];
	const pad = Math.floor(size * 0.24);
	const step = Math.floor((size - pad * 2) / 2);
	const r = Math.max(3, Math.floor(size / 11));
	for (const at of spots) {
		const cx = x + pad + (at % 3) * step;
		const cy = y + pad + Math.floor(at / 3) * step;
		fillDisk(port, cx, cy, r, lit ? BG : MID);
	}
}

export class DiceBehavior extends Behavior {
	state: DiceState = {
		title: "",
		kind: "dice",
		faces: [],
		rolling: false,
		history: "",
		volume: 0,
		mark: "",
		level: 0,
	};
	gen = -1;

	setState(port: unknown, next: DiceState) {
		const gen = themeGeneration();
		if (gen === this.gen && sameState(this.state, next))
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
		const st = style();
		port.fillColor(BG, 0, 0, width, height);

		const titleCy = rowOrigin(0) + Math.floor(ROW_PITCH / 2);
		let tx = 6;
		if (s.mark) {
			drawGlyph(port, tx + 9, titleCy, 18, s.mark, s.level);
			tx += 24;
		}
		port.drawString(s.title, st, ON, tx, rowTextY(0), Math.max(1, width - tx - 30));
		drawGlyph(port, width - 16, titleCy, 18, s.volume <= 0 ? "mute" : "vol", s.volume);

		const top = ROW_PITCH + 2;
		const bottom = height - ROW_PITCH;
		const bandH = bottom - top;
		const lit = !s.rolling;
		const jitter = () => (s.rolling ? Math.floor(Math.random() * 7) - 3 : 0);

		if (s.kind === "dice") {
			const n = s.faces.length;
			const size = Math.min(bandH - 6, n === 1 ? 72 : 64);
			const gap = 14;
			const span = n * size + (n - 1) * gap;
			let x = Math.floor((width - span) / 2);
			const y = top + Math.floor((bandH - size) / 2);
			for (let i = 0; i < n; i++) {
				drawDie(port, x + jitter(), y + jitter(), size, s.faces[i], lit && s.faces[i] > 0);
				x += size + gap;
			}
		}
		else if (s.kind === "coin") {
			const r = Math.floor((bandH - 8) / 2);
			const cx = Math.floor(width / 2) + jitter();
			const cy = top + Math.floor(bandH / 2) + jitter();
			const v = s.faces[0];
			if (v > 0 && lit) {
				fillDisk(port, cx, cy, r, MID);
				fillDisk(port, cx, cy, r - 3, ON);
			}
			else {
				fillDisk(port, cx, cy, r, WELL);
				strokeDisk(port, cx, cy, r, MID);
			}
			const label = v === 1 ? "正" : v === 2 ? "反" : "?";
			const m = port.measureString(label, st);
			port.drawString(label, st, lit && v > 0 ? BG : INK, cx - (m.width >> 1), cy - 16, m.width + 2);
		}
		else {
			const text = s.faces[0] > 0 ? String(s.faces[0]) : "_";
			const digitH = bandH - 8;
			const digitW = Math.floor(digitH * 0.55);
			const gap = Math.max(4, Math.floor(digitW / 6));
			const span = readoutSpan(text, digitW, digitW >> 1, gap);
			drawReadout(port, text, Math.floor((width - span) / 2) + jitter(), top + 4, digitW, digitH, digitW >> 1, gap, true);
		}

		if (s.history) {
			const m = port.measureString(s.history, st);
			port.drawString(s.history, st, MID, Math.max(6, Math.floor((width - m.width) / 2)), rowTextY(5), width - 12);
		}
	}
}
