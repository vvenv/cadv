/*
	Metronome chrome for the Casio three-band face:
	top title / volume, shared sevenseg BPM, bottom beat lamps.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph, fillDisk, strokeDisk } from "draw";
import { BG, FONT_UI, INK, MID, ON } from "ink";
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

export function asMetroTop(target: unknown): MetroTopBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: MetroTopBehavior }).behavior;
	return b && typeof b.setTop === "function" ? b : null;
}

export function asMetroFooter(target: unknown): MetroFooterBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: MetroFooterBehavior }).behavior;
	return b && typeof b.setFooter === "function" ? b : null;
}

export class MetroTopBehavior extends Behavior {
	title = "节拍";
	volume = 0;
	on = false;

	setTop(port: unknown, title: string, volume: number, on: boolean) {
		if (title === this.title && volume === this.volume && on === this.on)
			return;
		this.title = title;
		this.volume = volume;
		this.on = on;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const height = port.height;
		const faceStyle = style();
		port.fillColor(BG, 0, 0, width, height);
		const cy = Math.floor(height / 2);
		const titleX = this.on ? 28 : 6;
		if (this.on)
			drawGlyph(port, 14, cy, 16, "play");
		const measured = port.measureString(this.title, faceStyle);
		const textY = Math.max(0, Math.floor((height - measured.height) / 2));
		port.drawString(this.title, faceStyle, this.on ? ON : INK, titleX, textY, Math.max(1, width - titleX - 36));
		drawGlyph(
			port,
			width - 16,
			cy,
			18,
			this.volume <= 0 ? "mute" : "vol",
			this.volume,
		);
	}
}

export class MetroFooterBehavior extends Behavior {
	beats = 4;
	/** Next beat index, matching the app counter. -1 hides every lamp. */
	beat = 0;
	on = false;

	setFooter(port: unknown, beats: number, beat: number, on: boolean) {
		if (beats === this.beats && beat === this.beat && on === this.on)
			return;
		this.beats = beats;
		this.beat = beat;
		this.on = on;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const height = port.height;
		port.fillColor(BG, 0, 0, width, height);
		const n = this.beats < 1 ? 1 : this.beats > 8 ? 8 : this.beats;
		const lit = this.on ? (this.beat + n - 1) % n : -1;
		const r = 7;
		const spanW = Math.min(width - 28, n * 34);
		const x0 = Math.floor((width - spanW) / 2);
		const cy = Math.floor(height / 2);
		for (let i = 0; i < n; i++) {
			const cx = x0 + Math.floor((i + 0.5) * spanW / n);
			if (i === lit) {
				const rad = i === 0 ? r + 2 : r;
				fillDisk(port, cx, cy, rad + 2, MID);
				fillDisk(port, cx, cy, rad, ON);
			}
			else
				strokeDisk(port, cx, cy, i === 0 ? r + 1 : r, MID);
		}
	}
}
