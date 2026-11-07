/*
	Phosphor primitives: chamfered 7-segment readouts, disks, nothing else.
	Halo is one pixel of MID behind a lit segment. Gaps stay large enough
	that the halo does not weld the digit into a blob.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { DIM, MID, ON } from "ink";

const SEG = [
	0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011,
	0b1011011, 0b1011111, 0b1110000, 0b1111111, 0b1111011,
];

function taper(i: number, t: number): number {
	const half = t >> 1;
	const edge = i < half ? i : t - 1 - i;
	const inset = half - edge;
	return inset > 0 ? inset : 0;
}

function chamferH(port: PortContent, x: number, y: number, w: number, t: number, color: string) {
	if (w <= 1 || t <= 0)
		return;
	for (let i = 0; i < t; i++) {
		const inset = taper(i, t);
		const ww = w - inset * 2;
		if (ww <= 0)
			continue;
		port.fillColor(color, x + inset, y + i, ww, 1);
	}
}

function chamferV(port: PortContent, x: number, y: number, h: number, t: number, color: string) {
	if (h <= 1 || t <= 0)
		return;
	for (let i = 0; i < t; i++) {
		const inset = taper(i, t);
		const hh = h - inset * 2;
		if (hh <= 0)
			continue;
		port.fillColor(color, x + i, y + inset, 1, hh);
	}
}

function paintH(port: PortContent, x: number, y: number, w: number, t: number, on: boolean) {
	if (on) {
		chamferH(port, x - 1, y - 1, w + 2, t + 2, MID);
		chamferH(port, x, y, w, t, ON);
	}
	else
		chamferH(port, x, y, w, t, DIM);
}

function paintV(port: PortContent, x: number, y: number, h: number, t: number, on: boolean) {
	if (on) {
		chamferV(port, x - 1, y - 1, h + 2, t + 2, MID);
		chamferV(port, x, y, h, t, ON);
	}
	else
		chamferV(port, x, y, h, t, DIM);
}

export function fillDisk(port: PortContent, cx: number, cy: number, r: number, color: string) {
	if (r <= 0)
		return;
	for (let dy = -r; dy <= r; dy++) {
		const rr = r * r - dy * dy;
		if (rr < 0)
			continue;
		const w = Math.floor(Math.sqrt(rr));
		port.fillColor(color, cx - w, cy + dy, w * 2 + 1, 1);
	}
}

export function strokeDisk(port: PortContent, cx: number, cy: number, r: number, color: string) {
	if (r <= 0)
		return;
	const innerR = r - 1;
	for (let dy = -r; dy <= r; dy++) {
		const rr = r * r - dy * dy;
		if (rr < 0)
			continue;
		const w = Math.floor(Math.sqrt(rr));
		const inner = innerR * innerR - dy * dy;
		if (inner < 0) {
			port.fillColor(color, cx - w, cy + dy, w * 2 + 1, 1);
			continue;
		}
		const wi = Math.floor(Math.sqrt(inner));
		if (w > wi) {
			port.fillColor(color, cx - w, cy + dy, w - wi, 1);
			port.fillColor(color, cx + wi + 1, cy + dy, w - wi, 1);
		}
	}
}

/** One digit box. `mask` bit 6 is the top bar, bit 0 the middle bar. */
export function drawSegMask(port: PortContent, x: number, y: number, w: number, h: number, mask: number) {
	const t = Math.max(3, Math.min(8, Math.floor(w / 6)));
	const g = Math.max(3, t >> 1);
	let v = Math.floor((h - 3 * t - 4 * g) / 2);
	if (v < 2)
		v = 2;
	const block = 3 * t + 2 * v + 4 * g;
	const y0 = y + Math.max(0, Math.floor((h - block) / 2));
	const yMid = y0 + t + g + v + g;
	const yBot = yMid + t + g + v + g;
	const yU = y0 + t + g;
	const yL = yMid + t + g;
	const m = mask | 0;
	paintH(port, x, y0, w, t, !!(m & 0b1000000));
	paintV(port, x + w - t, yU, v, t, !!(m & 0b0100000));
	paintV(port, x + w - t, yL, v, t, !!(m & 0b0010000));
	paintH(port, x, yBot, w, t, !!(m & 0b0001000));
	paintV(port, x, yL, v, t, !!(m & 0b0000100));
	paintV(port, x, yU, v, t, !!(m & 0b0000010));
	paintH(port, x, yMid, w, t, !!(m & 0b0000001));
}

function drawColon(port: PortContent, x: number, y: number, w: number, h: number, on: boolean) {
	const r = Math.max(2, Math.floor(h / 16));
	const cx = x + (w >> 1);
	const y1 = y + Math.floor(h * 0.32);
	const y2 = y + Math.floor(h * 0.68);
	if (on) {
		fillDisk(port, cx, y1, r + 1, MID);
		fillDisk(port, cx, y2, r + 1, MID);
		fillDisk(port, cx, y1, r, ON);
		fillDisk(port, cx, y2, r, ON);
	}
	else {
		fillDisk(port, cx, y1, r, DIM);
		fillDisk(port, cx, y2, r, DIM);
	}
}

function cellWidth(ch: string, digitW: number): number {
	if (ch === ":")
		return 0;
	if (ch === ".")
		return Math.max(4, digitW >> 2);
	return digitW;
}

/** Width of a readout, including the gaps between cells. */
export function readoutSpan(text: string, digitW: number, colonW: number, gap: number): number {
	const n = text.length;
	if (n <= 0)
		return 0;
	let w = 0;
	for (let i = 0; i < n; i++) {
		const ch = text.charAt(i);
		w += ch === ":" ? colonW : cellWidth(ch, digitW);
		if (i + 1 < n)
			w += gap;
	}
	return w;
}

/**
	Digits, `:`, `.`, space, and `_`.
	`_` blinks its middle bar. Space keeps a ghost digit so the clock does not jump.
*/
export function drawReadout(
	port: PortContent,
	text: string,
	x: number,
	y: number,
	digitW: number,
	digitH: number,
	colonW: number,
	gap: number,
	blink: boolean,
) {
	let cx = x;
	const n = text.length;
	for (let i = 0; i < n; i++) {
		const ch = text.charAt(i);
		if (ch === ":") {
			drawColon(port, cx, y, colonW, digitH, blink);
			cx += colonW + gap;
			continue;
		}
		if (ch === ".") {
			const dw = cellWidth(ch, digitW);
			fillDisk(port, cx + (dw >> 1), y + digitH - 5, 2, ON);
			cx += dw + gap;
			continue;
		}
		let mask = 0;
		if (ch >= "0" && ch <= "9")
			mask = SEG[ch.charCodeAt(0) - 48];
		else if (ch === "_" && blink)
			mask = 0b0000001;
		else if (ch !== " " && ch !== "_")
			mask = 0b1111111;
		drawSegMask(port, cx, y, digitW, digitH, mask);
		cx += digitW + gap;
	}
}
