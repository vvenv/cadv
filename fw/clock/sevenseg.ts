/*
	7-segment Port behavior. Glyphs live in shared/draw.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawReadout, readoutSpan } from "draw";
import { formatNow } from "lunar";
import { BG } from "ink";

const DIGIT_W = 28;
const COLON_W = 14;
const GAP = 4;

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
		// Sample at paint time so a mode change is visible on this frame,
		// not one 250 ms tick later.
		this.blink = secondBlink();
		this.string = faceFromPort(port);
		port.fillColor(BG, 0, 0, port.width, port.height);
		const text = this.string;
		const span = readoutSpan(text, DIGIT_W, COLON_W, GAP);
		const x = Math.floor((port.width - span) / 2);
		const digitH = port.height - 6;
		drawReadout(port, text, x, 2, DIGIT_W, digitH, COLON_W, GAP, this.blink);
	}
}
