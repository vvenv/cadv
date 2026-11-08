/*
	Middle-band 7-segment Port. Glyphs live in shared/draw (upright hex bars).
	Clock drives it via Application faceText() + a 250 ms tick;
	other faces call setFace from paint.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawReadout, readoutSpan } from "draw";
import { BG } from "ink";

/** Digit proportions inside the middle band (clock HH:MM:SS). */
const DIGIT_W = 24;
const COLON_W = 12;
const GAP = 4;

function faceFromPort(port: PortContent): string | null {
	const container = port.container;
	if (!container || typeof container !== "object" || !("behavior" in container))
		return null;
	const b = (container as { behavior?: { faceText?: unknown } }).behavior;
	if (!b || typeof b !== "object" || !("faceText" in b))
		return null;
	const fn = b.faceText;
	if (typeof fn !== "function")
		return null;
	return (fn as () => string).call(b);
}

/** Colon and edit caret: lit for the first half of each second. */
function secondBlink(): boolean {
	return (Date.now() % 1000) < 500;
}

export function asSevenSeg(target: unknown): SevenSegBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: SevenSegBehavior }).behavior;
	return b && typeof b.setFace === "function" ? b : null;
}

export class SevenSegBehavior extends Behavior {
	string: string = "0";
	blink: boolean = true;
	/** Parent faceText + second blink (clock / stopwatch / …). */
	live: boolean = false;

	setFace(port: unknown, text: string, blink: boolean = true) {
		const next = text.length ? text : "0";
		if (next === this.string && blink === this.blink) {
			this.live = false;
			return;
		}
		this.live = false;
		this.string = next;
		this.blink = blink;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDisplaying(port: PortContent) {
		const fromParent = faceFromPort(port);
		if (fromParent !== null) {
			this.live = true;
			this.string = fromParent;
			this.blink = secondBlink();
			port.interval = 250;
			port.start();
		}
		port.invalidate();
	}
	onTimeChanged(port: PortContent) {
		if (!this.live)
			return;
		this.blink = secondBlink();
		const t = faceFromPort(port);
		if (t !== null)
			this.string = t;
		port.invalidate();
	}
	onDraw(port: PortContent) {
		if (this.live) {
			this.blink = secondBlink();
			const t = faceFromPort(port);
			if (t !== null)
				this.string = t;
		}
		port.fillColor(BG, 0, 0, port.width, port.height);
		const text = this.string;
		const digitH = Math.max(12, port.height - 6);
		const n = text.length || 1;
		const maxW = port.width - 8;
		let digitW = DIGIT_W;
		let colonW = COLON_W;
		let span = readoutSpan(text, digitW, colonW, GAP);
		if (span > maxW) {
			digitW = Math.floor((maxW - GAP * Math.max(0, n - 1)) / n);
			if (digitW < 8)
				digitW = 8;
			colonW = Math.max(4, digitW >> 1);
			span = readoutSpan(text, digitW, colonW, GAP);
		}
		const x = Math.floor((port.width - span) / 2);
		drawReadout(port, text, x, 2, digitW, digitH, colonW, GAP, this.blink);
	}
}
