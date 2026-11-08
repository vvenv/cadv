/*
	Phosphor primitives: Casio AE-style 7-segment readouts (italic lean, thick
	hex bars, 45° tips), disks, and binary marks (green check / red cross).
	Lit segments get one pixel of MID halo. One fillColor per scanline — not
	per-pixel loops — so HH:MM:SS stays inside commandListLength.

	Each Port fillColor / drawString queues into Piu's command list. The
	Application default is only 1024 bytes; a readout, disk, or mark face
	overflows it and leaves the backlight on a black panel. Callers must set
	commandListLength (and usually displayListLength) in main.ts — see
	fw/clock/main.ts and scripts/check-piu-lists.mjs. Sim/debug throws
	"command list overflowed".

	Status convention for every firmware: success → drawCheck + ON;
	failure → drawCross + RED. Prefer marks over 正确 / 不对 / 失败 text alone.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { AMBER, BG, DIM, INK, MID, ON, RED, type Glyph } from "ink";

const SEG = Object.freeze([
	0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011,
	0b1011011, 0b1011111, 0b1110000, 0b1111111, 0b1111011,
]);

/** Rightward italic shift in px for a digit of width `w` (Casio lean). */
function digitShear(w: number): number {
	return Math.max(2, Math.floor(w / 5));
}

/**
	Horizontal hex bar — pointed left/right. `shear` / `yRef` lean the bar
	like a Casio digit (top shifts right relative to the bottom).
*/
function fillHTrap(
	port: PortContent,
	x: number,
	y: number,
	w: number,
	t: number,
	color: string,
	shear: number,
	yRef: number,
	hShear: number,
) {
	if (w <= 1 || t <= 0)
		return;
	const c = Math.max(1, Math.min(t >> 1, (w - 1) >> 1));
	const denom = hShear < 1 ? 1 : hShear;
	for (let i = 0; i < t; i++) {
		const inset = Math.max(0, c - Math.min(i, t - 1 - i));
		const rw = w - (inset << 1);
		if (rw <= 0)
			continue;
		const yy = y + i;
		const xx = x + inset + Math.round((yRef - yy) * shear / denom);
		port.fillColor(color, xx, yy, rw, 1);
	}
}

/** Vertical hex bar — pointed top/bottom, same italic shear. */
function fillVTrap(
	port: PortContent,
	x: number,
	y: number,
	h: number,
	t: number,
	color: string,
	shear: number,
	yRef: number,
	hShear: number,
) {
	if (h <= 1 || t <= 0)
		return;
	const c = Math.max(1, Math.min(t >> 1, (h - 1) >> 1));
	const denom = hShear < 1 ? 1 : hShear;
	for (let i = 0; i < h; i++) {
		const inset = Math.max(0, c - Math.min(i, h - 1 - i));
		const rw = t - (inset << 1);
		if (rw <= 0)
			continue;
		const yy = y + i;
		const xx = x + inset + Math.round((yRef - yy) * shear / denom);
		port.fillColor(color, xx, yy, rw, 1);
	}
}

function paintH(
	port: PortContent,
	x: number,
	y: number,
	w: number,
	t: number,
	on: boolean,
	shear: number,
	yRef: number,
	hShear: number,
) {
	if (w <= 1 || t <= 0)
		return;
	if (on) {
		fillHTrap(port, x - 1, y - 1, w + 2, t + 2, MID, shear, yRef, hShear);
		fillHTrap(port, x, y, w, t, ON, shear, yRef, hShear);
	}
	else
		fillHTrap(port, x, y, w, t, DIM, shear, yRef, hShear);
}

function paintV(
	port: PortContent,
	x: number,
	y: number,
	h: number,
	t: number,
	on: boolean,
	shear: number,
	yRef: number,
	hShear: number,
) {
	if (h <= 1 || t <= 0)
		return;
	if (on) {
		fillVTrap(port, x - 1, y - 1, h + 2, t + 2, MID, shear, yRef, hShear);
		fillVTrap(port, x, y, h, t, ON, shear, yRef, hShear);
	}
	else
		fillVTrap(port, x, y, h, t, DIM, shear, yRef, hShear);
}

/** Thick polyline segment as stepped squares (few commands, readable at 20–64px). */
export function fillThickLine(
	port: PortContent,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	t: number,
	color: string,
) {
	const thick = t < 2 ? 2 : t;
	const dx = x1 - x0;
	const dy = y1 - y0;
	const steps = Math.max(Math.abs(dx) | 0, Math.abs(dy) | 0, 1);
	const half = thick >> 1;
	for (let i = 0; i <= steps; i++) {
		const x = Math.round(x0 + dx * i / steps) - half;
		const y = Math.round(y0 + dy * i / steps) - half;
		port.fillColor(color, x, y, thick, thick);
	}
}

/** Green check. `size` is the mark's bounding box edge. */
export function drawCheck(port: PortContent, cx: number, cy: number, size: number, color: string = ON) {
	const s = size < 12 ? 12 : size;
	const t = Math.max(3, Math.floor(s / 7));
	const x0 = cx - Math.floor(s * 0.42);
	const y0 = cy + Math.floor(s * 0.02);
	const x1 = cx - Math.floor(s * 0.08);
	const y1 = cy + Math.floor(s * 0.34);
	const x2 = cx + Math.floor(s * 0.44);
	const y2 = cy - Math.floor(s * 0.38);
	fillThickLine(port, x0, y0, x1, y1, t, color);
	fillThickLine(port, x1, y1, x2, y2, t, color);
}

/** Red cross. */
export function drawCross(port: PortContent, cx: number, cy: number, size: number, color: string = RED) {
	const s = size < 12 ? 12 : size;
	const t = Math.max(3, Math.floor(s / 7));
	const r = Math.floor(s * 0.36);
	fillThickLine(port, cx - r, cy - r, cx + r, cy + r, t, color);
	fillThickLine(port, cx + r, cy - r, cx - r, cy + r, t, color);
}

/** Battery outline + fill. `level` is 0..100. */
export function drawBattery(port: PortContent, cx: number, cy: number, size: number, level = 50, color: string = ON) {
	const w = Math.max(14, Math.floor(size * 1.2));
	const h = Math.max(8, Math.floor(size * 0.55));
	const x = cx - (w >> 1);
	const y = cy - (h >> 1);
	const tip = Math.max(2, Math.floor(h / 3));
	port.fillColor(color, x, y, w, 1);
	port.fillColor(color, x, y + h - 1, w, 1);
	port.fillColor(color, x, y, 1, h);
	port.fillColor(color, x + w - 1, y, 1, h);
	port.fillColor(color, x + w, cy - (tip >> 1), 2, tip);
	let pct = level | 0;
	if (pct < 0)
		pct = 0;
	if (pct > 100)
		pct = 100;
	const inner = w - 4;
	const fill = Math.max(pct > 0 ? 1 : 0, Math.floor(inner * pct / 100));
	const fillColor = pct <= 15 ? RED : pct <= 30 ? AMBER : color;
	if (fill > 0)
		port.fillColor(fillColor, x + 2, y + 2, fill, h - 4);
}

/** Sun disk + up to 4 rays. `level` is 1..4. */
export function drawBright(port: PortContent, cx: number, cy: number, size: number, level = 2, color: string = ON) {
	const s = size < 12 ? 12 : size;
	const r = Math.max(2, Math.floor(s / 5));
	fillDisk(port, cx, cy, r, color);
	let n = level | 0;
	if (n < 1)
		n = 1;
	if (n > 4)
		n = 4;
	const ray = Math.max(2, Math.floor(s / 7));
	const gap = r + 2;
	const arms = [
		[0, -1], [1, 0], [0, 1], [-1, 0],
	];
	for (let i = 0; i < n; i++) {
		const ax = arms[i][0];
		const ay = arms[i][1];
		port.fillColor(color, cx + ax * gap - (ray >> 1), cy + ay * gap - (ray >> 1), ray, ray);
	}
}

/** Speaker + 0..3 wedges from `level` 0..10. */
export function drawVolume(port: PortContent, cx: number, cy: number, size: number, level = 5, color: string = ON) {
	const s = size < 12 ? 12 : size;
	const bodyW = Math.max(3, Math.floor(s / 5));
	const bodyH = Math.max(6, Math.floor(s / 2));
	const x0 = cx - Math.floor(s * 0.35);
	port.fillColor(color, x0, cy - (bodyH >> 1), bodyW, bodyH);
	const tip = Math.max(4, Math.floor(s * 0.35));
	for (let i = 0; i < tip; i++) {
		const h = bodyH - Math.floor(i * bodyH / tip);
		port.fillColor(color, x0 + bodyW + i, cy - (h >> 1), 1, Math.max(2, h));
	}
	let n = level | 0;
	if (n < 0)
		n = 0;
	const waves = n <= 0 ? 0 : n <= 3 ? 1 : n <= 6 ? 2 : 3;
	for (let w = 0; w < waves; w++) {
		const ox = x0 + bodyW + tip + 2 + w * 3;
		port.fillColor(color, ox, cy - 2 - w * 2, 2, 5 + w * 4);
	}
}

export function drawMute(port: PortContent, cx: number, cy: number, size: number, color: string = RED) {
	drawVolume(port, cx, cy, size, 0, INK);
	const r = Math.floor(size * 0.38);
	fillThickLine(port, cx - r, cy - r, cx + r, cy + r, Math.max(2, Math.floor(size / 8)), color);
}

/** Wi-Fi fan: center dot + up to 3 arcs (`level` 0..3, default 3). */
export function drawWifi(port: PortContent, cx: number, cy: number, size: number, level = 3, color: string = ON) {
	const s = size < 12 ? 12 : size;
	fillDisk(port, cx, cy + Math.floor(s * 0.28), Math.max(1, Math.floor(s / 10)), color);
	let n = level | 0;
	if (n < 0)
		n = 0;
	if (n > 3)
		n = 3;
	for (let i = 1; i <= n; i++) {
		const r = Math.floor(s * (0.18 + i * 0.18));
		const y0 = cy + Math.floor(s * 0.28) - r;
		strokeDisk(port, cx, cy + Math.floor(s * 0.28), r, color);
		port.fillColor(BG, cx - r - 1, y0 + r, r * 2 + 2, r + 2);
	}
}

/** Bluetooth rune. */
export function drawBt(port: PortContent, cx: number, cy: number, size: number, color: string = ON) {
	const s = size < 12 ? 12 : size;
	const t = Math.max(2, Math.floor(s / 8));
	const h = Math.floor(s * 0.42);
	fillThickLine(port, cx, cy - h, cx, cy + h, t, color);
	fillThickLine(port, cx, cy - h, cx + Math.floor(s * 0.28), cy - Math.floor(h / 2), t, color);
	fillThickLine(port, cx + Math.floor(s * 0.28), cy - Math.floor(h / 2), cx, cy, t, color);
	fillThickLine(port, cx, cy, cx + Math.floor(s * 0.28), cy + Math.floor(h / 2), t, color);
	fillThickLine(port, cx + Math.floor(s * 0.28), cy + Math.floor(h / 2), cx, cy + h, t, color);
	fillThickLine(port, cx - Math.floor(s * 0.22), cy - Math.floor(h / 2), cx, cy, t, color);
	fillThickLine(port, cx - Math.floor(s * 0.22), cy + Math.floor(h / 2), cx, cy, t, color);
}

export function drawPlay(port: PortContent, cx: number, cy: number, size: number, color: string = ON) {
	const s = size < 12 ? 12 : size;
	const h = Math.floor(s * 0.7);
	const x0 = cx - Math.floor(s * 0.2);
	for (let i = 0; i < Math.floor(s * 0.45); i++) {
		const top = cy - (h >> 1) + Math.floor(i * h / (s * 0.9));
		const bot = cy + (h >> 1) - Math.floor(i * h / (s * 0.9));
		port.fillColor(color, x0 + i, top, 1, Math.max(1, bot - top));
	}
}

export function drawPause(port: PortContent, cx: number, cy: number, size: number, color: string = ON) {
	const s = size < 12 ? 12 : size;
	const barW = Math.max(3, Math.floor(s / 5));
	const barH = Math.floor(s * 0.7);
	const gap = Math.max(3, Math.floor(s / 6));
	port.fillColor(color, cx - gap - barW, cy - (barH >> 1), barW, barH);
	port.fillColor(color, cx + gap, cy - (barH >> 1), barW, barH);
}

export function drawRec(port: PortContent, cx: number, cy: number, size: number, color: string = RED) {
	fillDisk(port, cx, cy, Math.max(3, Math.floor(size * 0.32)), color);
}

/** Pill toggle. */
export function drawToggle(port: PortContent, cx: number, cy: number, size: number, on: boolean) {
	const w = Math.max(16, Math.floor(size * 1.35));
	const h = Math.max(8, Math.floor(size * 0.55));
	const x = cx - (w >> 1);
	const y = cy - (h >> 1);
	const color = on ? ON : DIM;
	port.fillColor(color, x + (h >> 1), y, w - h, h);
	fillDisk(port, x + (h >> 1), cy, h >> 1, color);
	fillDisk(port, x + w - (h >> 1), cy, h >> 1, color);
	const knob = Math.max(3, (h >> 1) - 1);
	const kx = on ? x + w - (h >> 1) : x + (h >> 1);
	fillDisk(port, kx, cy, knob, on ? BG : INK);
}

export function drawShuffle(port: PortContent, cx: number, cy: number, size: number, color: string = ON) {
	const s = size < 12 ? 12 : size;
	const t = Math.max(2, Math.floor(s / 8));
	const dx = Math.floor(s * 0.32);
	const dy = Math.floor(s * 0.22);
	fillThickLine(port, cx - dx, cy - dy, cx + dx, cy + dy, t, color);
	fillThickLine(port, cx - dx, cy + dy, cx + dx, cy - dy, t, color);
	port.fillColor(color, cx + dx - 1, cy - dy - 2, 4, 4);
	port.fillColor(color, cx + dx - 1, cy + dy - 2, 4, 4);
}

export function drawPhone(port: PortContent, cx: number, cy: number, size: number, color: string = ON) {
	const s = size < 12 ? 12 : size;
	port.fillColor(color, cx - 1, cy - Math.floor(s * 0.35), 2, Math.floor(s * 0.7));
	port.fillColor(color, cx - Math.floor(s * 0.28), cy - Math.floor(s * 0.2), Math.floor(s * 0.56), 2);
	port.fillColor(color, cx - Math.floor(s * 0.18), cy + Math.floor(s * 0.05), Math.floor(s * 0.36), 2);
}

export function drawMiss(port: PortContent, cx: number, cy: number, size: number, color: string = AMBER) {
	drawCross(port, cx, cy, Math.floor(size * 0.85), color);
}

export function drawSd(port: PortContent, cx: number, cy: number, size: number, color: string = INK) {
	const w = Math.max(10, Math.floor(size * 0.7));
	const h = Math.max(12, Math.floor(size * 0.85));
	const x = cx - (w >> 1);
	const y = cy - (h >> 1);
	const cut = Math.max(3, Math.floor(w / 3));
	port.fillColor(color, x + cut, y, w - cut, 1);
	port.fillColor(color, x, y + cut, 1, h - cut);
	port.fillColor(color, x, y + h - 1, w, 1);
	port.fillColor(color, x + w - 1, y, 1, h);
	fillThickLine(port, x, y + cut, x + cut, y, 1, color);
	port.fillColor(color, x + 3, y + Math.floor(h * 0.45), w - 6, 2);
}

export function drawUsb(port: PortContent, cx: number, cy: number, size: number, color: string = ON) {
	const s = size < 12 ? 12 : size;
	const t = Math.max(2, Math.floor(s / 8));
	port.fillColor(color, cx - 1, cy - Math.floor(s * 0.35), 2, Math.floor(s * 0.55));
	port.fillColor(color, cx - Math.floor(s * 0.22), cy + Math.floor(s * 0.1), Math.floor(s * 0.44), t);
	port.fillColor(color, cx - Math.floor(s * 0.22), cy + Math.floor(s * 0.1), t, Math.floor(s * 0.25));
	port.fillColor(color, cx + Math.floor(s * 0.22) - t, cy + Math.floor(s * 0.1), t, Math.floor(s * 0.25));
	port.fillColor(color, cx - 2, cy - Math.floor(s * 0.42), 4, 3);
}

export function drawRetry(port: PortContent, cx: number, cy: number, size: number, color: string = ON) {
	const s = size < 12 ? 12 : size;
	const r = Math.floor(s * 0.32);
	strokeDisk(port, cx, cy, r, color);
	port.fillColor(BG, cx, cy - r - 1, r + 2, r + 1);
	port.fillColor(color, cx + r - 2, cy - 3, 4, 4);
	port.fillColor(color, cx + r - 5, cy - 6, 4, 3);
}

export function drawCaps(port: PortContent, cx: number, cy: number, size: number, color: string = ON) {
	const s = size < 12 ? 12 : size;
	const bodyW = Math.floor(s * 0.55);
	const bodyH = Math.floor(s * 0.4);
	const x = cx - (bodyW >> 1);
	const y = cy - Math.floor(s * 0.05);
	port.fillColor(color, x, y, bodyW, bodyH);
	strokeDisk(port, cx, cy - Math.floor(s * 0.18), Math.floor(s * 0.18), color);
	port.fillColor(BG, x + 2, y - 2, bodyW - 4, 4);
}

/** Horizontal progress track. `level` is 0..100. */
export function drawProgress(port: PortContent, x: number, y: number, w: number, h: number, level = 0, color: string = ON) {
	if (w <= 2 || h <= 1)
		return;
	port.fillColor(DIM, x, y, w, h);
	let pct = level | 0;
	if (pct < 0)
		pct = 0;
	if (pct > 100)
		pct = 100;
	const fill = Math.floor((w - 2) * pct / 100);
	if (fill > 0)
		port.fillColor(color, x + 1, y + 1, fill, h - 2);
}

/** Dispatch any Glyph. No-op when kind is empty. */
export function drawGlyph(
	port: PortContent,
	cx: number,
	cy: number,
	size: number,
	kind: Glyph,
	level?: number,
	color?: string,
) {
	if (!kind)
		return;
	if (kind === "ok")
		drawCheck(port, cx, cy, size, color ?? ON);
	else if (kind === "bad")
		drawCross(port, cx, cy, size, color ?? RED);
	else if (kind === "batt")
		drawBattery(port, cx, cy, size, level ?? 50, color ?? ON);
	else if (kind === "bright")
		drawBright(port, cx, cy, size, level ?? 2, color ?? ON);
	else if (kind === "vol")
		drawVolume(port, cx, cy, size, level ?? 5, color ?? ON);
	else if (kind === "mute")
		drawMute(port, cx, cy, size, color ?? RED);
	else if (kind === "wifi")
		drawWifi(port, cx, cy, size, level ?? 3, color ?? ON);
	else if (kind === "bt")
		drawBt(port, cx, cy, size, color ?? ON);
	else if (kind === "play")
		drawPlay(port, cx, cy, size, color ?? ON);
	else if (kind === "pause")
		drawPause(port, cx, cy, size, color ?? ON);
	else if (kind === "rec")
		drawRec(port, cx, cy, size, color ?? RED);
	else if (kind === "on")
		drawToggle(port, cx, cy, size, true);
	else if (kind === "off")
		drawToggle(port, cx, cy, size, false);
	else if (kind === "shuffle")
		drawShuffle(port, cx, cy, size, color ?? ON);
	else if (kind === "phone")
		drawPhone(port, cx, cy, size, color ?? ON);
	else if (kind === "miss")
		drawMiss(port, cx, cy, size, color ?? AMBER);
	else if (kind === "sd")
		drawSd(port, cx, cy, size, color ?? INK);
	else if (kind === "usb")
		drawUsb(port, cx, cy, size, color ?? ON);
	else if (kind === "retry")
		drawRetry(port, cx, cy, size, color ?? ON);
	else if (kind === "caps")
		drawCaps(port, cx, cy, size, color ?? ON);
	else if (kind === "progress")
		drawProgress(port, cx - Math.floor(size * 0.7), cy - 3, Math.floor(size * 1.4), 6, level ?? 0, color ?? ON);
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

/**
	One digit box — Casio AE: chunky bars (~w/4.5), 45° tips, mild italic,
	V tips bite into H bands while H stays out of V columns (corner notch,
	no welded overlap). `mask` bit 6 is the top bar, bit 0 the middle bar.
*/
export function drawSegMask(port: PortContent, x: number, y: number, w: number, h: number, mask: number) {
	const t = Math.max(4, Math.min(10, Math.floor(w / 4.5)));
	const g = 2;
	const bite = Math.min(t >> 1, g + 1);
	const shear = digitShear(w);
	const yRef = y + h;
	let v = Math.floor((h - 3 * t - 4 * g + 2 * bite) / 2);
	if (v < 3)
		v = 3;
	const block = 3 * t + 2 * v + 4 * g - 2 * bite;
	const y0 = y + Math.max(0, Math.floor((h - block) / 2));
	const yMid = y0 + t + g + v + g - bite;
	const yBot = yMid + t + g + v + g - bite;
	const yU = y0 + t + g - bite;
	const yL = yMid + t + g - bite;
	const m = mask | 0;
	// H between V columns; V may share the H y-band via bite, never the x-band.
	const hx = x + t + g;
	const hw = Math.max(t, w - 2 * (t + g));
	paintH(port, hx, y0, hw, t, !!(m & 0b1000000), shear, yRef, h);
	paintV(port, x + w - t, yU, v, t, !!(m & 0b0100000), shear, yRef, h);
	paintV(port, x + w - t, yL, v, t, !!(m & 0b0010000), shear, yRef, h);
	paintH(port, hx, yBot, hw, t, !!(m & 0b0001000), shear, yRef, h);
	paintV(port, x, yL, v, t, !!(m & 0b0000100), shear, yRef, h);
	paintV(port, x, yU, v, t, !!(m & 0b0000010), shear, yRef, h);
	paintH(port, hx, yMid, hw, t, !!(m & 0b0000001), shear, yRef, h);
}

function drawColon(port: PortContent, x: number, y: number, w: number, h: number, on: boolean) {
	const s = Math.max(3, Math.floor(h / 14));
	const shear = digitShear(Math.max(w, 12));
	const yRef = y + h;
	const y1 = y + Math.floor(h * 0.32) - (s >> 1);
	const y2 = y + Math.floor(h * 0.68) - (s >> 1);
	const base = x + ((w - s) >> 1);
	const cx1 = base + Math.round((yRef - y1) * shear / h);
	const cx2 = base + Math.round((yRef - y2) * shear / h);
	if (on) {
		port.fillColor(MID, cx1 - 1, y1 - 1, s + 2, s + 2);
		port.fillColor(MID, cx2 - 1, y2 - 1, s + 2, s + 2);
		port.fillColor(ON, cx1, y1, s, s);
		port.fillColor(ON, cx2, y2, s, s);
	}
	else {
		port.fillColor(DIM, cx1, y1, s, s);
		port.fillColor(DIM, cx2, y2, s, s);
	}
}

function cellWidth(ch: string, digitW: number): number {
	if (ch === ":")
		return 0;
	if (ch === ".")
		return Math.max(4, digitW >> 2);
	return digitW;
}

/** Width of a readout, including gaps and the italic overhang of the last digit. */
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
	return w + digitShear(digitW);
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
