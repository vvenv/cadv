/*
	One octave. White keys are the well, black keys sit on top.
	The pressed key lights phosphor.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph } from "draw";
import { BG, FONT_UI, INK, MID, ON, WELL } from "ink";
import { rowOrigin, rowTextY, ROW_PITCH } from "list";

const WHITES = Object.freeze([0, 2, 4, 5, 7, 9, 11]);
const BLACKS = Object.freeze([
	{ semi: 1, after: 0 },
	{ semi: 3, after: 1 },
	{ semi: 6, after: 3 },
	{ semi: 8, after: 4 },
	{ semi: 10, after: 5 },
], true);

let face: /* Style */ object | undefined;
function style(): /* Style */ any {
	if (!face)
		face = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
	return face;
}

export function asPiano(target: unknown): PianoBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: PianoBehavior }).behavior;
	return b && typeof b.setKey === "function" ? b : null;
}

function drawText(port: PortContent, text: string, color: string, x: number, y: number, width: number) {
	if (width <= 0 || !text)
		return;
	port.drawString(text, style(), color, x, y, width);
}

export class PianoBehavior extends Behavior {
	title = "琴";
	name = "按键";
	hzText = "";
	volume = 0;
	/** Semitone 0–11, or -1 when nothing has been played. */
	key = -1;

	setKey(port: unknown, title: string, name: string, hz: number, key: number, volume: number) {
		const hzText = hz > 0 ? hz + "Hz" : "";
		if (title === this.title && name === this.name && hzText === this.hzText && volume === this.volume && key === this.key)
			return;
		this.title = title;
		this.name = name;
		this.hzText = hzText;
		this.volume = volume;
		this.key = key;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const height = port.height;
		port.fillColor(BG, 0, 0, width, height);
		drawText(port, this.title, ON, 6, rowTextY(0), Math.max(1, width - 40));
		drawGlyph(
			port,
			width - 16,
			rowOrigin(0) + Math.floor(ROW_PITCH / 2),
			18,
			this.volume <= 0 ? "mute" : "vol",
			this.volume,
		);

		const faceStyle = style();
		const nameW = port.measureString(this.name, faceStyle).width;
		const nameColor = this.key < 0 ? INK : ON;
		drawText(port, this.name, nameColor, Math.max(6, Math.floor((width - nameW) / 2)), rowTextY(1), nameW + 2);
		if (this.hzText) {
			const hzW = port.measureString(this.hzText, faceStyle).width;
			drawText(port, this.hzText, MID, width - 6 - hzW, rowTextY(1), hzW);
		}

		const margin = 8;
		const gap = 3;
		const keyW = Math.floor((width - margin * 2 - gap * (WHITES.length - 1)) / WHITES.length);
		const rowW = WHITES.length * keyW + gap * (WHITES.length - 1);
		const x0 = Math.floor((width - rowW) / 2);
		const keyH = 76;
		const y0 = height - 6 - keyH;
		for (let i = 0; i < WHITES.length; i++) {
			const x = x0 + i * (keyW + gap);
			const on = this.key === WHITES[i];
			if (on) {
				port.fillColor(ON, x, y0, keyW, keyH);
				port.fillColor(BG, x, y0 + keyH - 3, keyW, 3);
			}
			else {
				port.fillColor(MID, x, y0, keyW, keyH);
				port.fillColor(WELL, x + 1, y0 + 1, keyW - 2, keyH - 2);
				port.fillColor(MID, x + 1, y0 + keyH - 4, keyW - 2, 3);
			}
		}
		const blackW = Math.max(8, Math.floor(keyW * 0.62));
		const blackH = Math.floor(keyH * 0.58);
		for (let i = 0; i < BLACKS.length; i++) {
			const b = BLACKS[i];
			const x = x0 + (b.after + 1) * keyW + b.after * gap - Math.floor(blackW / 2);
			const on = this.key === b.semi;
			if (on) {
				port.fillColor(ON, x, y0, blackW, blackH);
				port.fillColor(BG, x, y0 + blackH - 2, blackW, 2);
			}
			else {
				port.fillColor(MID, x, y0, blackW, blackH);
				port.fillColor(BG, x + 1, y0 + 1, blackW - 2, blackH - 2);
			}
		}
	}
}
