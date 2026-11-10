/*
	Launcher icons for the SD grid, one per firmware id.

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

/* ---------------------------------------------------------------- icons -- */

function clock(p: Pen) {
	ring(p, 0, 0, 11);
	line(p, 0, 0, 0, -7);
	line(p, 0, 0, 5, 3);
}

/** 拼写: a letter and the blank after it. */
function words(p: Pen) {
	line(p, -10, 8, -4, -9);
	line(p, -4, -9, 2, 8);
	line(p, -7, 2, -1, 2);
	rect(p, 5, 7, 6, 2);
}

/** 查词: open book. */
function dict(p: Pen) {
	line(p, 0, -6, -11, -9);
	line(p, -11, -9, -11, 7);
	line(p, -11, 7, 0, 10);
	line(p, 0, -6, 11, -9);
	line(p, 11, -9, 11, 7);
	line(p, 11, 7, 0, 10);
	line(p, 0, -6, 0, 10);
}

/** 键盘 */
function kb(p: Pen) {
	frame(p, -12.5, -8.5, 25, 17);
	for (let i = 0; i < 5; i++) {
		rect(p, -9.5 + i * 4, -4.5, 3, 2);
		rect(p, -9.5 + i * 4, -0.5, 3, 2);
	}
	rect(p, -5.5, 3.5, 11, 2);
}

/** 水平: spirit level with the bubble between the marks. */
function level(p: Pen) {
	frame(p, -12.5, -5.5, 25, 11);
	rect(p, -6.5, -3.5, 1, 7);
	rect(p, 5.5, -3.5, 1, 7);
	disc(p, 0, 0, 2.5);
}

/** 设备 and the fallback: a chip with pins on four sides. */
function chip(p: Pen) {
	frame(p, -7.5, -7.5, 15, 15);
	rect(p, -2.5, -2.5, 5, 5);
	for (let i = -1; i <= 1; i++) {
		const o = i * 4 - 1;
		rect(p, -11.5, o, 4, 2);
		rect(p, 7.5, o, 4, 2);
		rect(p, o, -11.5, 2, 4);
		rect(p, o, 7.5, 2, 4);
	}
}

/** 优盘: USB stick. */
function usb(p: Pen) {
	frame(p, -4.5, -11.5, 9, 9);
	rect(p, -2.5, -8.5, 2, 2);
	rect(p, 0.5, -8.5, 2, 2);
	frame(p, -6.5, -3.5, 13, 15);
}

/** 录音: record button. */
function rec(p: Pen, dot: string) {
	ring(p, 0, 0, 11);
	disc(p, 0, 0, 5.5, dot);
}

/** 记事: page with a folded corner and lines. */
function note(p: Pen) {
	rect(p, -8.5, -11.5, 12, 2);
	rect(p, -8.5, -11.5, 2, 23);
	rect(p, -8.5, 9.5, 17, 2);
	rect(p, 6.5, -5.5, 2, 17);
	line(p, 3, -11, 8, -6);
	rect(p, -4.5, -3.5, 9, 2);
	rect(p, -4.5, 0.5, 9, 2);
	rect(p, -4.5, 4.5, 6, 2);
}

/** 计算 */
function calc(p: Pen) {
	frame(p, -8.5, -11.5, 17, 23);
	rect(p, -5.5, -8.5, 11, 3);
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++)
			rect(p, -5.5 + c * 4, -2.5 + r * 4, 3, 3);
}

/** 扫描: radio arcs. */
function scan(p: Pen) {
	disc(p, 0, 8, 2);
	ring(p, 0, 8, 8, "top", 0.9);
	ring(p, 0, 8, 14, "top", 0.9);
	ring(p, 0, 8, 20, "top", 0.9);
}

/** 节拍: metronome. */
function metro(p: Pen) {
	line(p, -3, -10, 3, -10);
	line(p, -3, -10, -8, 10);
	line(p, 3, -10, 8, 10);
	rect(p, -10.5, 9.5, 21, 2);
	line(p, 0, 6, 2, -6);
	rect(p, -0.5, -2.5, 4, 2);
}

/** 调音: tuning fork. */
function tune(p: Pen) {
	rect(p, -6.5, -11.5, 2, 9);
	rect(p, 4.5, -11.5, 2, 9);
	ring(p, 0, -3, 6.5, "bottom");
	rect(p, -1, 3, 2, 9);
}

/** 计步: two footprints. */
function step(p: Pen) {
	oval(p, -5, 0, 3.5, 5);
	oval(p, -5, 8.5, 2.5, 2);
	oval(p, 5, -7.5, 3.5, 5);
	oval(p, 5, 1, 2.5, 2);
}

/** 计数: tally of five. */
function count(p: Pen) {
	for (let i = 0; i < 4; i++)
		rect(p, -8 + i * 4.5, -9.5, 2, 19);
	line(p, -11, 6, 11, -6);
}

/** 钢琴: three white keys, two black. */
function piano(p: Pen) {
	frame(p, -11.5, -10.5, 23, 21);
	rect(p, -4.5, -10.5, 2, 21);
	rect(p, 2.5, -10.5, 2, 21);
	rect(p, -6, -9, 5, 11);
	rect(p, 1, -9, 5, 11);
}

/** 基座: SD card. */
function sd(p: Pen) {
	rect(p, -2.5, -11.5, 10, 2);
	rect(p, 5.5, -11.5, 2, 23);
	rect(p, -7.5, 9.5, 15, 2);
	rect(p, -7.5, -6.5, 2, 18);
	line(p, -7, -6, -2, -11);
	for (let i = 0; i < 3; i++)
		rect(p, -2.5 + i * 3, -7.5, 2, 4);
}

/** 分贝: level bars. */
function db(p: Pen) {
	for (let i = 0; i < 5; i++) {
		const h = 4 + i * 4;
		rect(p, -11.5 + i * 5, 10.5 - h, 3, h);
	}
}

/** 骰子: five. */
function dice(p: Pen) {
	frame(p, -10.5, -10.5, 21, 21);
	disc(p, -5, -5, 1.5);
	disc(p, 5, -5, 1.5);
	disc(p, 0, 0, 1.5);
	disc(p, -5, 5, 1.5);
	disc(p, 5, 5, 1.5);
}

/** 游戏: gamepad. */
function game(p: Pen) {
	frame(p, -12.5, -6.5, 25, 13);
	rect(p, -9.5, -1, 7, 2);
	rect(p, -7, -3.5, 2, 7);
	disc(p, 4, 1.5, 1);
	disc(p, 8, -1.5, 1);
}

/** 摩斯: · — · over — · — */
function morse(p: Pen) {
	disc(p, -9, -4, 2);
	rect(p, -5, -6, 10, 4);
	disc(p, 9, -4, 2);
	rect(p, -11.5, 3, 8, 4);
	disc(p, 0, 5, 2);
	rect(p, 3.5, 3, 8, 4);
}

/** 助眠: crescent moon and a star. */
function noise(p: Pen) {
	crescent(p, -2, 2, 9.5, 3, -3, 8);
	rect(p, 7.5, -11.5, 1, 7);
	rect(p, 4.5, -8.5, 7, 1);
}

/** 遥控: handset sending upward. */
function remote(p: Pen) {
	frame(p, -5.5, -1.5, 11, 13);
	disc(p, 0, 3, 1.5);
	rect(p, -2.5, 7.5, 2, 2);
	rect(p, 0.5, 7.5, 2, 2);
	ring(p, 0, -1, 6, "top", 1);
	ring(p, 0, -1, 11, "top", 1);
}

/** 打字: text lines and a cursor. */
function type(p: Pen) {
	rect(p, -11.5, -8.5, 23, 2);
	rect(p, -11.5, -2.5, 23, 2);
	rect(p, -11.5, 3.5, 12, 2);
	rect(p, 3.5, 0.5, 2, 8);
}

/** Draw the launcher icon for a firmware id (`clock` from `clock.bin`). */
export function drawFwIcon(
	port: PortContent,
	id: string,
	cx: number,
	cy: number,
	size: number,
	color: string = ON,
) {
	const s = size < 14 ? 14 : size;
	const k = s / GRID;
	const p: Pen = { port, cx, cy, k, t: Math.max(2, Math.round(2 * k)), color };
	switch (id) {
	case "clock": clock(p); break;
	case "words": words(p); break;
	case "dict": dict(p); break;
	case "kb": kb(p); break;
	case "level": level(p); break;
	case "usb": usb(p); break;
	case "rec": rec(p, color === ON ? RED : color); break;
	case "note": note(p); break;
	case "calc": calc(p); break;
	case "scan": scan(p); break;
	case "metro": metro(p); break;
	case "tune": tune(p); break;
	case "step": step(p); break;
	case "count": count(p); break;
	case "piano": piano(p); break;
	case "sd": sd(p); break;
	case "db": db(p); break;
	case "dice": dice(p); break;
	case "game": game(p); break;
	case "morse": morse(p); break;
	case "noise": noise(p); break;
	case "remote": remote(p); break;
	case "type": type(p); break;
	default: chip(p);
	}
}
