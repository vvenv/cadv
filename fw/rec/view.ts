import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { AMBER, BG, DIM, FONT_UI, INK, MID, ON } from "ink";
import { rowTextY } from "list";

const SEGS = 14;

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
	/** 0–100, or -1 while playback should bounce. */
	peak = 0;
	sub = "";
	hold = 0;
	holdAt = 0;

	setMeter(port: unknown, title: string, peak: number, sub: string) {
		const anim = peak < 0;
		const next = anim ? -1 : peak > 100 ? 100 : peak;
		const now = Date.now();
		if (anim)
			this.hold = 0;
		else if (next >= this.hold) {
			this.hold = next;
			this.holdAt = now;
		}
		const decaying = !anim && this.hold > next && now - this.holdAt > 400;
		if (!anim && !decaying && title === this.title && next === this.peak && sub === this.sub)
			return;
		this.title = title;
		this.peak = next;
		this.sub = sub;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const faceStyle = style();
		const width = port.width;
		port.fillColor(BG, 0, 0, width, port.height);
		port.drawString(this.title, faceStyle, ON, 6, rowTextY(0), width - 12);
		let level = this.peak;
		if (level < 0) {
			const t = (Date.now() % 900) / 900;
			const s = Math.sin(t * Math.PI * 2);
			level = 36 + Math.floor((s < 0 ? -s : s) * 52);
		}
		else if (Date.now() - this.holdAt > 400 && this.hold > level) {
			this.hold = this.hold - 3 < level ? level : this.hold - 3;
		}
		const margin = 10;
		const gap = 2;
		const inner = width - margin * 2 - gap * (SEGS - 1);
		const segW = Math.max(1, Math.floor(inner / SEGS));
		const y = 54;
		const h = 26;
		const litN = Math.round(level / 100 * SEGS);
		const holdN = Math.round(this.hold / 100 * SEGS);
		const hot = SEGS - 3;
		for (let i = 0; i < SEGS; i++) {
			let color = DIM;
			if (i < litN)
				color = i >= hot ? AMBER : ON;
			else if (i === holdN - 1 && holdN > litN)
				color = MID;
			port.fillColor(color, margin + i * (segW + gap), y, segW, h);
		}
		port.drawString(this.sub, faceStyle, INK, 6, rowTextY(4), width - 12);
	}
}
