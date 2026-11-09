/*
	Step chrome for the Casio three-band face:
	top title, shared sevenseg middle, bottom meters / stride.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, FONT_UI, INK, ON } from "ink";
import { themeGeneration } from "theme";

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

export function asStepTop(target: unknown): StepTopBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: StepTopBehavior }).behavior;
	return b && typeof b.setTop === "function" ? b : null;
}

export function asStepFooter(target: unknown): StepFooterBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: StepFooterBehavior }).behavior;
	return b && typeof b.setFooter === "function" ? b : null;
}

export class StepTopBehavior extends Behavior {
	title = "";

	setTop(port: unknown, title: string) {
		if (title === this.title)
			return;
		this.title = title;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const height = port.height;
		const faceStyle = style();
		port.fillColor(BG, 0, 0, width, height);
		const titleW = port.measureString(this.title, faceStyle).width;
		const y = Math.max(0, Math.floor((height - 20) / 2) - 6);
		port.drawString(this.title, faceStyle, ON, Math.max(0, Math.floor((width - titleW) / 2)), y, Math.max(1, width - 4));
	}
}

export class StepFooterBehavior extends Behavior {
	metersText = "";
	strideText = "";

	setFooter(port: unknown, meters: number, stride: number) {
		const metersText = "约 " + meters + " 米";
		const strideText = "步幅 " + stride + "cm";
		if (metersText === this.metersText && strideText === this.strideText)
			return;
		this.metersText = metersText;
		this.strideText = strideText;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const height = port.height;
		const faceStyle = style();
		port.fillColor(BG, 0, 0, width, height);
		const y = Math.max(0, Math.floor((height - 20) / 2) - 6);
		port.drawString(this.metersText, faceStyle, INK, 6, y, Math.floor(width / 2) - 8);
		const strideW = port.measureString(this.strideText, faceStyle).width;
		port.drawString(this.strideText, faceStyle, INK, Math.max(6, width - 6 - strideW), y, strideW);
	}
}
