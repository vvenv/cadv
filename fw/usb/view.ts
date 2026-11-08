/*
	Title plus a short status line for the USB disk screen.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, FONT_UI, INK, ON } from "ink";
import { rowTextY } from "list";

let face: /* Style */ object | undefined;
function style(): /* Style */ any {
	if (!face)
		face = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
	return face;
}

export function asUsb(target: unknown): UsbViewBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: UsbViewBehavior }).behavior;
	return b && typeof b.setFrame === "function" ? b : null;
}

export class UsbViewBehavior extends Behavior {
	title = "";
	line = "";
	note = "";

	setFrame(port: unknown, title: string, line: string, note = "") {
		this.title = title;
		this.line = line;
		this.note = note;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const faceStyle = style();
		const width = port.width;
		port.fillColor(BG, 0, 0, width, port.height);
		const titleW = port.measureString(this.title, faceStyle).width;
		const titleX = Math.max(0, Math.floor((width - titleW) / 2));
		port.drawString(this.title, faceStyle, ON, titleX, rowTextY(0), Math.max(1, width - titleX));
		if (this.line)
			port.drawString(this.line, faceStyle, ON, 2, rowTextY(2), Math.max(1, width - 4));
		if (this.note)
			port.drawString(this.note, faceStyle, INK, 2, rowTextY(3), Math.max(1, width - 4));
	}
}
