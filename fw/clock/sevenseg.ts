/*
	7-segment Port behavior.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { formatNow } from "lunar";
import { BG, DIM, ON } from "ink";

const SEG: number[] = [
	0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011,
	0b1011011, 0b1011111, 0b1110000, 0b1111111, 0b1111011,
];

function hbar(port: PortContent, x: number, y: number, w: number, t: number, on: boolean) {
	port.fillColor(on ? ON : DIM, x + t, y, w - 2 * t, t);
}
function vbar(port: PortContent, x: number, y: number, h: number, t: number, on: boolean) {
	port.fillColor(on ? ON : DIM, x, y + t, t, h - 2 * t);
}
function drawSegMask(port: PortContent, x: number, y: number, w: number, h: number, mask: number) {
	const t = Math.max(4, Math.floor(w / 6));
	const mid = y + Math.floor((h - t) / 2);
	const m = mask | 0;
	hbar(port, x, y, w, t, !!(m & 0b1000000));
	vbar(port, x + w - t, y, mid - y + t, t, !!(m & 0b0100000));
	vbar(port, x + w - t, mid, y + h - mid, t, !!(m & 0b0010000));
	hbar(port, x, y + h - t, w, t, !!(m & 0b0001000));
	vbar(port, x, mid, y + h - mid, t, !!(m & 0b0000100));
	vbar(port, x, y, mid - y + t, t, !!(m & 0b0000010));
	hbar(port, x, mid, w, t, !!(m & 0b0000001));
}
function drawDigit(port: PortContent, x: number, y: number, w: number, h: number, digit: number) {
	drawSegMask(port, x, y, w, h, SEG[digit] | 0);
}
function drawColon(port: PortContent, x: number, y: number, w: number, h: number, on: boolean) {
	const s = Math.max(4, Math.floor(h / 10));
	const cx = x + Math.floor((w - s) / 2);
	port.fillColor(on ? ON : DIM, cx, y + Math.floor(h * 0.28), s, s);
	port.fillColor(on ? ON : DIM, cx, y + Math.floor(h * 0.62), s, s);
}

function faceFromPort(port: PortContent): string {
	const container = port.container;
	if (container && typeof container === "object" && "behavior" in container) {
		const b = container.behavior;
		if (b && typeof b === "object" && "faceText" in b) {
			const fn = (b as { faceText?: unknown }).faceText;
			if (typeof fn === "function")
				return (fn as () => string).call(b);
		}
	}
	return formatNow();
}

/** Colon and edit caret: lit for the first half of each second. */
function secondBlink(): boolean {
	return (Date.now() % 1000) < 500;
}

export class SevenSegBehavior extends Behavior {
	string: string = "--:--:--";
	blink: boolean = true;

	onDisplaying(port: PortContent) {
		this.string = faceFromPort(port);
		this.blink = secondBlink();
		port.interval = 250;
		port.start();
		port.invalidate();
	}
	onTimeChanged(port: PortContent) {
		this.blink = secondBlink();
		this.string = faceFromPort(port);
		port.invalidate();
	}
	onDraw(port: PortContent) {
		port.fillColor(BG, 0, 0, port.width, port.height);
		const text = this.string;
		const n = text.length;
		const gap = 3;
		const colonW = 12;
		const digitW = 30;
		let units = 0;
		for (let i = 0; i < n; i++)
			units += text.charAt(i) === ":" ? colonW : digitW;
		units += gap * (n - 1);
		let x = Math.floor((port.width - units) / 2);
		const y = 4;
		const digitH = port.height - 8;
		for (let i = 0; i < n; i++) {
			const ch = text.charAt(i);
			if (ch === ":") {
				drawColon(port, x, y, colonW, digitH, this.blink);
				x += colonW + gap;
			}
			else if (ch === "_" || ch === " ") {
				// blank placeholder; blink mid bar as caret when `_`
				drawSegMask(port, x, y, digitW, digitH, (ch === "_" && this.blink) ? 0b0000001 : 0);
				x += digitW + gap;
			}
			else {
				const d = ch.charCodeAt(0) - 48;
				drawDigit(port, x, y, digitW, digitH, (d >= 0 && d <= 9) ? d : 8);
				x += digitW + gap;
			}
		}
	}
}
