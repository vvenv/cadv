import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, FONT_UI, INK, ON } from "ink";
import { rowTextY } from "list";

let face: object | undefined;
function style(): /* Style */ any {
	if (!face)
		face = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
	return face;
}

export function asMeter(target: unknown): MeterBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: MeterBehavior }).behavior;
	return b && typeof b.setMeter === "function" ? b : null;
}

export class MeterBehavior extends Behavior {
	title = "录音";
	peak = 0;
	sub = "";

	setMeter(port: unknown, title: string, peak: number, sub: string) {
		this.title = title;
		this.peak = peak < 0 ? 0 : peak > 100 ? 100 : peak;
		this.sub = sub;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const faceStyle = style();
		port.fillColor(BG, 0, 0, port.width, port.height);
		port.drawString(this.title, faceStyle, ON, 6, rowTextY(0), port.width - 12);
		const w = Math.floor((port.width - 24) * this.peak / 100);
		port.fillColor(ON, 12, 58, Math.max(1, w), 16);
		port.drawString(this.sub, faceStyle, INK, 6, rowTextY(4), port.width - 12);
	}
}
