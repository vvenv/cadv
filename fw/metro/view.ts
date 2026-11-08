/*
	BPM readout plus one lamp per beat. The lit lamp is the beat that just sounded.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph, drawReadout, fillDisk, readoutSpan, strokeDisk } from "draw";
import { BG, FONT_UI, INK, MID, ON } from "ink";
import { rowOrigin, rowTextY, ROW_PITCH } from "list";

let face: /* Style */ object | undefined;
function style(): /* Style */ any {
	if (!face)
		face = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
	return face;
}

export function asMetro(target: unknown): MetroBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: MetroBehavior }).behavior;
	return b && typeof b.setRun === "function" ? b : null;
}

export class MetroBehavior extends Behavior {
	title = "节拍";
	bpmText = "100";
	volume = 0;
	beats = 4;
	/** Next beat index, matching the app counter. -1 hides every lamp. */
	beat = 0;
	on = false;

	setRun(port: unknown, title: string, bpm: number, beats: number, beat: number, on: boolean, volume: number) {
		const bpmText = String(bpm);
		if (title === this.title && bpmText === this.bpmText && volume === this.volume && beats === this.beats && beat === this.beat && on === this.on)
			return;
		this.title = title;
		this.bpmText = bpmText;
		this.volume = volume;
		this.beats = beats;
		this.beat = beat;
		this.on = on;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const faceStyle = style();
		port.fillColor(BG, 0, 0, width, port.height);
		const titleX = this.on ? 28 : 6;
		if (this.on)
			drawGlyph(port, 14, rowOrigin(0) + Math.floor(ROW_PITCH / 2), 16, "play");
		port.drawString(this.title, faceStyle, this.on ? ON : INK, titleX, rowTextY(0), Math.max(1, width - titleX - 36));
		drawGlyph(
			port,
			width - 16,
			rowOrigin(0) + Math.floor(ROW_PITCH / 2),
			18,
			this.volume <= 0 ? "mute" : "vol",
			this.volume,
		);

		const digitW = 36;
		const digitH = 52;
		const gap = 4;
		const span = readoutSpan(this.bpmText, digitW, 12, gap);
		const x = Math.floor((width - span) / 2);
		drawReadout(port, this.bpmText, x, 28, digitW, digitH, 12, gap, true);

		const n = this.beats < 1 ? 1 : this.beats > 8 ? 8 : this.beats;
		const lit = this.on ? (this.beat + n - 1) % n : -1;
		const r = 8;
		const spanW = Math.min(width - 28, n * 34);
		const x0 = Math.floor((width - spanW) / 2);
		const cy = port.height - 16;
		for (let i = 0; i < n; i++) {
			const cx = x0 + Math.floor((i + 0.5) * spanW / n);
			if (i === lit) {
				const rad = i === 0 ? r + 3 : r;
				fillDisk(port, cx, cy, rad + 2, MID);
				fillDisk(port, cx, cy, rad, ON);
			}
			else
				strokeDisk(port, cx, cy, i === 0 ? r + 1 : r, MID);
		}
	}
}
