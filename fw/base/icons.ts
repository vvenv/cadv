/*
	Launcher icons for the SD grid. Each firmware ships its own as
	cadv/<id>.icon (source fw/<id>/icon); this module parses and draws them.

	Every icon is drawn on a 28-unit grid centred on (cx, cy) and scaled to
	`size`, with one stroke weight so the grid reads as a set. Shapes are
	odd-width spans around the centre so they sit on the pixel grid without
	a half-pixel lean.

	Nothing here paints BG to cut a hole: the selected tile draws the icon in
	BG on an ON fill, and a knock-out would fill the shape solid. Rings,
	crescents and arcs are built from scanline spans instead.

	Each fillColor is one 12-byte Piu command; an icon stays under ~60 so a
	full 4×2 page fits the launcher's commandListLength with room for text.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { ON, RED } from "ink";

type Pen = {
	port: PortContent;
	cx: number;
	cy: number;
	/** Pixels per grid unit. */
	k: number;
	/** Stroke weight in pixels. */
	t: number;
	color: string;
};

const GRID = 28;

function u(p: Pen, v: number): number {
	return Math.round(v * p.k);
}

/** Filled rect in grid units, (x, y) top-left. */
function rect(p: Pen, x: number, y: number, w: number, h: number, color = p.color) {
	const x0 = p.cx + u(p, x);
	const y0 = p.cy + u(p, y);
	const ww = Math.max(1, u(p, x + w) - u(p, x));
	const hh = Math.max(1, u(p, y + h) - u(p, y));
	p.port.fillColor(color, x0, y0, ww, hh);
}

/** Stroked rect, square corners clipped by one pixel. */
function frame(p: Pen, x: number, y: number, w: number, h: number) {
	const x0 = p.cx + u(p, x);
	const y0 = p.cy + u(p, y);
	const ww = u(p, x + w) - u(p, x);
	const hh = u(p, y + h) - u(p, y);
	const t = p.t;
	const port = p.port;
	port.fillColor(p.color, x0 + 1, y0, ww - 2, t);
	port.fillColor(p.color, x0 + 1, y0 + hh - t, ww - 2, t);
	port.fillColor(p.color, x0, y0 + 1, t, hh - 2);
	port.fillColor(p.color, x0 + ww - t, y0 + 1, t, hh - 2);
}

/** Stroke from grid point to grid point. */
function line(p: Pen, x0: number, y0: number, x1: number, y1: number) {
	const ax = p.cx + u(p, x0);
	const ay = p.cy + u(p, y0);
	const dx = p.cx + u(p, x1) - ax;
	const dy = p.cy + u(p, y1) - ay;
	const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
	const t = p.t;
	const half = t >> 1;
	// Merge consecutive squares on the same row or column into one fill.
	let rx = ax - half;
	let ry = ay - half;
	let rw = t;
	let rh = t;
	for (let i = 1; i <= steps; i++) {
		const x = Math.round(ax + dx * i / steps) - half;
		const y = Math.round(ay + dy * i / steps) - half;
		if (y === ry && rh === t && x === rx + rw - t + 1) {
			rw++;
			continue;
		}
		if (x === rx && rw === t && y === ry + rh - t + 1) {
			rh++;
			continue;
		}
		p.port.fillColor(p.color, rx, ry, rw, rh);
		rx = x;
		ry = y;
		rw = t;
		rh = t;
	}
	p.port.fillColor(p.color, rx, ry, rw, rh);
}

/** Half-width of a disc row, with +0.5 so small circles are not diamonds. */
function span(r: number, dy: number): number {
	const q = (r + 0.5) * (r + 0.5) - dy * dy;
	return q < 0 ? -1 : Math.floor(Math.sqrt(q));
}

/** Solid disc; radius in pixels. */
function discPx(p: Pen, cx: number, cy: number, r: number, color = p.color) {
	for (let dy = -r; dy <= r; dy++) {
		const w = span(r, dy);
		if (w >= 0)
			p.port.fillColor(color, cx - w, cy + dy, w * 2 + 1, 1);
	}
}

/** Solid ellipse in grid units. */
function oval(p: Pen, x: number, y: number, rx: number, ry: number) {
	const cx = p.cx + u(p, x);
	const cy = p.cy + u(p, y);
	const a = Math.max(1, u(p, rx));
	const b = Math.max(1, u(p, ry));
	for (let dy = -b; dy <= b; dy++) {
		const w = Math.floor(a * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((b + 0.5) * (b + 0.5)))) + 0.5);
		p.port.fillColor(p.color, cx - w, cy + dy, w * 2 + 1, 1);
	}
}

function disc(p: Pen, x: number, y: number, r: number, color = p.color) {
	discPx(p, p.cx + u(p, x), p.cy + u(p, y), Math.max(1, u(p, r)), color);
}

/**
	Ring of stroke `p.t` around grid point (x, y), radius r (outer edge).
	`top`/`bottom` keep only the rows above / below the centre.
	`wedge` > 0 keeps |dx| <= |dy| * wedge, an arc opening upward (Wi-Fi).
*/
function ring(
	p: Pen,
	x: number,
	y: number,
	r: number,
	part: "all" | "top" | "bottom" = "all",
	wedge = 0,
) {
	const cx = p.cx + u(p, x);
	const cy = p.cy + u(p, y);
	const ro = Math.max(2, u(p, r));
	const ri = ro - p.t;
	const lo = part === "bottom" ? 0 : -ro;
	const hi = part === "top" ? 0 : ro;
	for (let dy = lo; dy <= hi; dy++) {
		const wo = span(ro, dy);
		if (wo < 0)
			continue;
		const wi = ri >= 0 ? span(ri, dy) : -1;
		let a = wo;
		let lim = a;
		if (wedge > 0)
			lim = Math.min(a, Math.floor(-dy * wedge));
		if (wi < 0) {
			if (lim >= 0)
				p.port.fillColor(p.color, cx - lim, cy + dy, lim * 2 + 1, 1);
			continue;
		}
		// Left and right runs: [wi+1, wo] clipped to lim.
		if (lim > wi) {
			const w = lim - wi;
			p.port.fillColor(p.color, cx - lim, cy + dy, w, 1);
			p.port.fillColor(p.color, cx + wi + 1, cy + dy, w, 1);
		}
	}
}

/** Disc at (x, y) radius r minus disc at (bx, by) radius br — a crescent. */
function crescent(p: Pen, x: number, y: number, r: number, bx: number, by: number, br: number) {
	const cx = p.cx + u(p, x);
	const cy = p.cy + u(p, y);
	const ro = u(p, r);
	const bcx = p.cx + u(p, bx);
	const bcy = p.cy + u(p, by);
	const rb = u(p, br);
	for (let dy = -ro; dy <= ro; dy++) {
		const w = span(ro, dy);
		if (w < 0)
			continue;
		const a = cx - w;
		const b = cx + w;
		const bw = span(rb, cy + dy - bcy);
		if (bw < 0) {
			p.port.fillColor(p.color, a, cy + dy, b - a + 1, 1);
			continue;
		}
		const c = bcx - bw;
		const d = bcx + bw;
		if (c > a)
			p.port.fillColor(p.color, a, cy + dy, Math.min(b + 1, c) - a, 1);
		if (d < b)
			p.port.fillColor(p.color, Math.max(a, d + 1), cy + dy, b - Math.max(a - 1, d), 1);
	}
}

/* ------------------------------------------------------------ icon file -- */

/*
	An icon is the text file fw/<id>/icon, copied to cadv/<id>.icon next to
	the image. One shape per line, grid units, `#` starts a comment:

		rect x y w h          filled rectangle, (x, y) top-left
		frame x y w h         stroked rectangle
		line x0 y0 x1 y1      stroke
		disc x y r            filled circle
		oval x y rx ry        filled ellipse
		ring x y r [top|bottom] [wedge]
		crescent x y r bx by br

	A trailing `red` paints that shape red on an unselected tile.
	Parsed once into a flat number list: opcode (| RED_BIT), then its args.
*/

export type Icon = number[];

const OP_RECT = 1;
const OP_FRAME = 2;
const OP_LINE = 3;
const OP_DISC = 4;
const OP_OVAL = 5;
const OP_RING = 6;
const OP_CRESCENT = 7;
const RED_BIT = 8;

/** Number of args after the opcode. */
const ARGS = [0, 4, 4, 4, 3, 4, 5, 6];

const NAMES: Record<string, number> = {
	rect: OP_RECT,
	frame: OP_FRAME,
	line: OP_LINE,
	disc: OP_DISC,
	oval: OP_OVAL,
	ring: OP_RING,
	crescent: OP_CRESCENT,
};

/** Upper bound on shapes, so a stray file cannot overrun the command list. */
const MAX_SHAPES = 32;

function parseLine(line: string, out: number[]): boolean {
	const hash = line.indexOf("#");
	const body = hash >= 0 ? line.slice(0, hash) : line;
	const words = body.split(/\s+/).filter(w => w.length > 0);
	if (!words.length)
		return true;
	const op = NAMES[words[0]];
	if (!op)
		return false;
	let red = false;
	if (words[words.length - 1] === "red") {
		red = true;
		words.pop();
	}
	const args: number[] = [];
	let part = 0;
	let wedge = 0;
	for (let i = 1; i < words.length; i++) {
		const w = words[i];
		if (op === OP_RING && args.length === 3) {
			if (w === "top" || w === "bottom" || w === "all") {
				part = w === "top" ? 1 : w === "bottom" ? 2 : 0;
				continue;
			}
		}
		const v = Number(w);
		if (!isFinite(v))
			return false;
		if (op === OP_RING && args.length === 3)
			wedge = v;
		else
			args.push(v);
	}
	if (op === OP_RING) {
		if (args.length !== 3)
			return false;
		args.push(part, wedge);
	}
	if (args.length !== ARGS[op])
		return false;
	out.push(red ? op | RED_BIT : op);
	for (let i = 0; i < args.length; i++)
		out.push(args[i]);
	return true;
}

/** Parse icon text. Bad lines are skipped; null when nothing usable is left. */
export function parseIcon(text: string, name = "icon"): Icon | null {
	const out: number[] = [];
	const lines = text.split("\n");
	let shapes = 0;
	for (let i = 0; i < lines.length && shapes < MAX_SHAPES; i++) {
		const before = out.length;
		if (!parseLine(lines[i], out))
			trace(`${name}:${i + 1} skipped\n`);
		else if (out.length > before)
			shapes++;
	}
	return out.length ? out : null;
}

/** Fallback for an image without an icon file: a chip with pins on four sides. */
const CHIP = parseIcon(`
	frame -7.5 -7.5 15 15
	rect -2.5 -2.5 5 5
	rect -11.5 -5 4 2
	rect 7.5 -5 4 2
	rect -5 -11.5 2 4
	rect -5 7.5 2 4
	rect -11.5 -1 4 2
	rect 7.5 -1 4 2
	rect -1 -11.5 2 4
	rect -1 7.5 2 4
	rect -11.5 3 4 2
	rect 7.5 3 4 2
	rect 3 -11.5 2 4
	rect 3 7.5 2 4
`) as Icon;

/** Draw a launcher icon; null draws the chip. */
export function drawFwIcon(
	port: PortContent,
	icon: Icon | null,
	cx: number,
	cy: number,
	size: number,
	color: string = ON,
) {
	const s = size < 14 ? 14 : size;
	const k = s / GRID;
	const p: Pen = { port, cx, cy, k, t: Math.max(2, Math.round(2 * k)), color };
	const red = color === ON ? RED : color;
	const a = icon || CHIP;
	for (let i = 0; i < a.length; ) {
		const code = a[i++];
		const op = code & 7;
		p.color = code & RED_BIT ? red : color;
		switch (op) {
		case OP_RECT: rect(p, a[i], a[i + 1], a[i + 2], a[i + 3]); break;
		case OP_FRAME: frame(p, a[i], a[i + 1], a[i + 2], a[i + 3]); break;
		case OP_LINE: line(p, a[i], a[i + 1], a[i + 2], a[i + 3]); break;
		case OP_DISC: disc(p, a[i], a[i + 1], a[i + 2]); break;
		case OP_OVAL: oval(p, a[i], a[i + 1], a[i + 2], a[i + 3]); break;
		case OP_RING:
			ring(p, a[i], a[i + 1], a[i + 2], a[i + 3] === 1 ? "top" : a[i + 3] === 2 ? "bottom" : "all", a[i + 4]);
			break;
		case OP_CRESCENT: crescent(p, a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5]); break;
		default: return;
		}
		i += ARGS[op];
	}
}
