/*
	Day count as a phosphor readout. Meters and stride share the footer.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawReadout, readoutSpan } from "draw";
import { BG, FONT_UI, INK, ON } from "ink";
import { rowTextY } from "list";

let face: /* Style */ object | undefined;
function style(): /* Style */ any {
	if (!face)
		face = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
	return face;
}

export function asStep(target: unknown): StepBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: StepBehavior }).behavior;
	return b && typeof b.setStep === "function" ? b : null;
}

export class StepBehavior extends Behavior {
	title = "";
	stepsText = "0";
	metersText = "";
	strideText = "";

	setStep(port: unknown, title: string, steps: number, meters: number, stride: number) {
		const stepsText = String(steps < 0 ? 0 : steps);
		const metersText = "约 " + meters + " 米";
		const strideText = "步幅 " + stride + "cm";
		if (title === this.title && stepsText === this.stepsText && metersText === this.metersText && strideText === this.strideText)
			return;
		this.title = title;
		this.stepsText = stepsText;
		this.metersText = metersText;
		this.strideText = strideText;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const faceStyle = style();
		port.fillColor(BG, 0, 0, width, port.height);
		const titleW = port.measureString(this.title, faceStyle).width;
		port.drawString(this.title, faceStyle, ON, Math.max(0, Math.floor((width - titleW) / 2)), rowTextY(0), Math.max(1, width - 4));

		const text = this.stepsText;
		const n = text.length || 1;
		const gap = 4;
		const maxW = width - 16;
		let digitW = 40;
		let span = readoutSpan(text, digitW, 8, gap);
		if (span > maxW) {
			digitW = Math.floor((maxW - gap * (n - 1)) / n);
			if (digitW < 10)
				digitW = 10;
			span = readoutSpan(text, digitW, 8, gap);
		}
		const digitH = Math.min(68, Math.floor(digitW * 1.9));
		const x = Math.floor((width - span) / 2);
		drawReadout(port, text, x, 30, digitW, digitH, 8, gap, true);

		const y = rowTextY(5);
		port.drawString(this.metersText, faceStyle, INK, 6, y, Math.floor(width / 2) - 8);
		const strideW = port.measureString(this.strideText, faceStyle).width;
		port.drawString(this.strideText, faceStyle, INK, Math.max(6, width - 6 - strideW), y, strideW);
	}
}
