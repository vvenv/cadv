/*
	Cents needle. The center notch is the in-tune window (±8).
	Null cents parks a dim needle and shows the status in `name`.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { AMBER, BG, FONT_UI, INK, MID, ON } from "ink";
import { rowTextY } from "list";
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

function clamp(v: number, lo: number, hi: number): number {
	if (v < lo)
		return lo;
	if (v > hi)
		return hi;
	return v;
}

export function asTune(target: unknown): TuneBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: TuneBehavior }).behavior;
	return b && typeof b.setTune === "function" ? b : null;
}

export class TuneBehavior extends Behavior {
	title = "调音";
	name = "听";
	caption = "";
	cents: number | null = null;

	setTune(port: unknown, title: string, name: string, cents: number | null, hz: number) {
		let caption = "";
		if (cents !== null) {
			const sign = cents > 0 ? "+" : "";
			caption = hz + "Hz  " + sign + cents;
		}
		if (title === this.title && name === this.name && caption === this.caption && cents === this.cents)
			return;
		this.title = title;
		this.name = name;
		this.caption = caption;
		this.cents = cents;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const faceStyle = style();
		port.fillColor(BG, 0, 0, width, port.height);
		const titleW = port.measureString(this.title, faceStyle).width;
		port.drawString(this.title, faceStyle, ON, Math.max(0, Math.floor((width - titleW) / 2)), rowTextY(0), titleW + 2);

		const live = this.cents !== null;
		const tuned = live && this.cents !== null && this.cents <= 8 && this.cents >= -8;
		const nameColor = !live ? INK : tuned ? ON : AMBER;
		const nameW = port.measureString(this.name, faceStyle).width;
		port.drawString(this.name, faceStyle, nameColor, Math.max(6, Math.floor((width - nameW) / 2)), rowTextY(1), nameW + 2);

		const x0 = 18;
		const x1 = width - 18;
		const mid = (x0 + x1) >> 1;
		const y = 86;
		const half = mid - x0;
		port.fillColor(MID, x0, y, x1 - x0, 2);
		const marks = [-50, -25, 0, 25, 50];
		for (let i = 0; i < marks.length; i++) {
			const c = marks[i];
			const x = mid + Math.floor(c / 50 * half);
			const h = c === 0 ? 16 : 8;
			port.fillColor(c === 0 ? ON : MID, x, y - h, c === 0 ? 2 : 1, h);
		}
		const win = Math.floor(8 / 50 * half);
		port.fillColor(ON, mid - win, y + 8, win * 2, 3);

		const cents = this.cents === null ? 0 : this.cents;
		const nx = mid + Math.floor(clamp(cents, -50, 50) / 50 * half);
		const color = !live ? MID : tuned ? ON : AMBER;
		port.fillColor(color, nx - 4, y - 34, 9, 3);
		port.fillColor(color, nx - 1, y - 31, 3, 28);

		if (!this.caption)
			return;
		const capW = port.measureString(this.caption, faceStyle).width;
		port.drawString(this.caption, faceStyle, nameColor, Math.max(6, Math.floor((width - capW) / 2)), rowTextY(5), capW + 2);
	}
}
