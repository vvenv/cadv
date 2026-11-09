/*
	Small phosphor icons for the SD launcher grid.
	Known firmware ids get a distinct mark; unknown ids fall back to a chip.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import {
	drawBt,
	drawGlyph,
	drawPlay,
	drawRec,
	drawSd,
	drawUsb,
	drawWifi,
	fillDisk,
	fillThickLine,
	strokeDisk,
} from "draw";
import { BG, ON, RED } from "ink";

function box(port: PortContent, cx: number, cy: number, size: number, color: string) {
	const s = size < 12 ? 12 : size;
	const w = Math.floor(s * 0.7);
	const h = Math.floor(s * 0.55);
	const x = cx - (w >> 1);
	const y = cy - (h >> 1);
	port.fillColor(color, x, y, w, 1);
	port.fillColor(color, x, y + h - 1, w, 1);
	port.fillColor(color, x, y, 1, h);
	port.fillColor(color, x + w - 1, y, 1, h);
}

function clockFace(port: PortContent, cx: number, cy: number, size: number, color: string) {
	const s = size < 12 ? 12 : size;
	const r = Math.floor(s * 0.38);
	strokeDisk(port, cx, cy, r, color);
	fillThickLine(port, cx, cy, cx, cy - Math.floor(r * 0.55), 2, color);
	fillThickLine(port, cx, cy, cx + Math.floor(r * 0.45), cy + Math.floor(r * 0.1), 2, color);
}

function book(port: PortContent, cx: number, cy: number, size: number, color: string) {
	const s = size < 12 ? 12 : size;
	const w = Math.floor(s * 0.55);
	const h = Math.floor(s * 0.7);
	const x = cx - (w >> 1);
	const y = cy - (h >> 1);
	port.fillColor(color, x, y, w, 1);
	port.fillColor(color, x, y + h - 1, w, 1);
	port.fillColor(color, x, y, 1, h);
	port.fillColor(color, x + w - 1, y, 1, h);
	port.fillColor(color, cx, y + 2, 1, h - 4);
	port.fillColor(color, x + 3, cy - 2, Math.floor(w / 2) - 4, 1);
	port.fillColor(color, cx + 3, cy - 2, Math.floor(w / 2) - 4, 1);
}

function keys(port: PortContent, cx: number, cy: number, size: number, color: string) {
	const s = size < 12 ? 12 : size;
	const w = Math.floor(s * 0.75);
	const h = Math.floor(s * 0.45);
	const x = cx - (w >> 1);
	const y = cy - (h >> 1);
	port.fillColor(color, x, y, w, h);
	port.fillColor(BG, x + 2, y + 2, w - 4, h - 4);
	const cell = Math.max(2, Math.floor((w - 6) / 3));
	for (let row = 0; row < 2; row++) {
		for (let col = 0; col < 3; col++) {
			port.fillColor(
				color,
				x + 3 + col * (cell + 1),
				y + 3 + row * (cell + 1),
				cell,
				cell,
			);
		}
	}
}

function bubble(port: PortContent, cx: number, cy: number, size: number, color: string) {
	const s = size < 12 ? 12 : size;
	strokeDisk(port, cx, cy, Math.floor(s * 0.38), color);
	fillDisk(port, cx + 2, cy - 1, Math.max(2, Math.floor(s * 0.12)), color);
}

function chip(port: PortContent, cx: number, cy: number, size: number, color: string) {
	const s = size < 12 ? 12 : size;
	const w = Math.floor(s * 0.5);
	const h = Math.floor(s * 0.5);
	const x = cx - (w >> 1);
	const y = cy - (h >> 1);
	port.fillColor(color, x, y, w, h);
	port.fillColor(BG, x + 2, y + 2, w - 4, h - 4);
	for (let i = 0; i < 3; i++) {
		port.fillColor(color, x - 3, y + 2 + i * 4, 3, 2);
		port.fillColor(color, x + w, y + 2 + i * 4, 3, 2);
	}
}

function notepad(port: PortContent, cx: number, cy: number, size: number, color: string) {
	box(port, cx, cy, size, color);
	const s = size < 12 ? 12 : size;
	const w = Math.floor(s * 0.4);
	const x = cx - (w >> 1);
	port.fillColor(color, x, cy - 4, w, 1);
	port.fillColor(color, x, cy, w - 2, 1);
	port.fillColor(color, x, cy + 4, w - 4, 1);
}

function calc(port: PortContent, cx: number, cy: number, size: number, color: string) {
	box(port, cx, cy, size, color);
	const t = Math.max(2, Math.floor(size / 10));
	port.fillColor(color, cx - 5, cy - 1, 11, t);
	port.fillColor(color, cx - 1, cy - 5, t, 11);
}

function foot(port: PortContent, cx: number, cy: number, size: number, color: string) {
	const s = size < 12 ? 12 : size;
	fillDisk(port, cx - 2, cy + 2, Math.floor(s * 0.2), color);
	fillDisk(port, cx + 4, cy - 3, Math.floor(s * 0.14), color);
	port.fillColor(color, cx - 1, cy - 6, 3, Math.floor(s * 0.35));
}

function piano(port: PortContent, cx: number, cy: number, size: number, color: string) {
	const s = size < 12 ? 12 : size;
	const keyW = Math.max(3, Math.floor(s / 7));
	const keyH = Math.floor(s * 0.7);
	const x0 = cx - Math.floor((keyW * 3 + 4) / 2);
	const y0 = cy - (keyH >> 1);
	for (let i = 0; i < 3; i++) {
		const x = x0 + i * (keyW + 2);
		port.fillColor(color, x, y0, keyW, keyH);
		port.fillColor(BG, x + 1, y0 + 1, keyW - 2, keyH - 2);
	}
	const blackW = Math.max(2, keyW - 1);
	const blackH = Math.floor(keyH * 0.55);
	port.fillColor(color, x0 + keyW, y0, blackW, blackH);
	port.fillColor(color, x0 + 2 * (keyW + 2) - 1, y0, blackW, blackH);
}

function meter(port: PortContent, cx: number, cy: number, size: number, color: string) {
	const s = size < 12 ? 12 : size;
	const t = Math.max(2, Math.floor(s / 10));
	fillThickLine(port, cx, cy + Math.floor(s * 0.3), cx, cy - Math.floor(s * 0.35), t, color);
	fillThickLine(port, cx, cy - Math.floor(s * 0.35), cx + Math.floor(s * 0.28), cy - Math.floor(s * 0.1), t, color);
	fillDisk(port, cx, cy + Math.floor(s * 0.32), Math.max(2, Math.floor(s * 0.12)), color);
}

function hash(port: PortContent, cx: number, cy: number, size: number, color: string) {
	const s = size < 12 ? 12 : size;
	const t = Math.max(2, Math.floor(s / 10));
	const d = Math.floor(s * 0.22);
	fillThickLine(port, cx - d, cy - Math.floor(s * 0.32), cx - d + 3, cy + Math.floor(s * 0.32), t, color);
	fillThickLine(port, cx + d - 3, cy - Math.floor(s * 0.32), cx + d, cy + Math.floor(s * 0.32), t, color);
	fillThickLine(port, cx - Math.floor(s * 0.32), cy - d, cx + Math.floor(s * 0.32), cy - d, t, color);
	fillThickLine(port, cx - Math.floor(s * 0.32), cy + d, cx + Math.floor(s * 0.32), cy + d, t, color);
}

function abc(port: PortContent, cx: number, cy: number, size: number, color: string) {
	box(port, cx, cy, size, color);
	const s = size < 12 ? 12 : size;
	const t = Math.max(2, Math.floor(s / 10));
	fillThickLine(port, cx - 4, cy + 4, cx, cy - 5, t, color);
	fillThickLine(port, cx, cy - 5, cx + 4, cy + 4, t, color);
	port.fillColor(color, cx - 2, cy + 1, 5, t);
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
	if (id === "clock")
		clockFace(port, cx, cy, size, color);
	else if (id === "words")
		abc(port, cx, cy, size, color);
	else if (id === "dict")
		book(port, cx, cy, size, color);
	else if (id === "kb")
		keys(port, cx, cy, size, color);
	else if (id === "level")
		bubble(port, cx, cy, size, color);
	else if (id === "info")
		chip(port, cx, cy, size, color);
	else if (id === "usb")
		drawUsb(port, cx, cy, size, color);
	else if (id === "rec")
		drawRec(port, cx, cy, size, color === ON ? RED : color);
	else if (id === "note")
		notepad(port, cx, cy, size, color);
	else if (id === "calc")
		calc(port, cx, cy, size, color);
	else if (id === "scan")
		drawWifi(port, cx, cy, size, 3, color);
	else if (id === "metro")
		meter(port, cx, cy, size, color);
	else if (id === "tune")
		drawGlyph(port, cx, cy, size, "vol", 6, color);
	else if (id === "step")
		foot(port, cx, cy, size, color);
	else if (id === "count")
		hash(port, cx, cy, size, color);
	else if (id === "piano")
		piano(port, cx, cy, size, color);
	else if (id === "sd")
		drawSd(port, cx, cy, size, color);
	else if (id.indexOf("bt") >= 0 || id === "ble")
		drawBt(port, cx, cy, size, color);
	else if (id.indexOf("play") >= 0)
		drawPlay(port, cx, cy, size, color);
	else
		chip(port, cx, cy, size, color);
}
