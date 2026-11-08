/*
	Tally face. Title mark + volume match shared chrome.
	Footer: − / step lamps / +. Listen mode adds a peak bar and play/pause mark.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph, drawProgress, drawReadout, fillDisk, readoutSpan, strokeDisk } from "draw";
import { BG, FONT_UI, INK, MID, ON, type Glyph } from "ink";
import { rowOrigin, rowTextY, ROW_PITCH } from "list";

const TITLE_MARK = 18;
const TITLE_MARK_GAP = 6;

export type Sense = "hand" | "ear";

let face: /* Style */ object | undefined;
function style(): /* Style */ any {
	if (!face)
		face = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
	return face;
}

function drawPlus(port: PortContent, cx: number, cy: number, arm: number, thick: number, color: string) {
	port.fillColor(color, cx - arm, cy - (thick >> 1), arm * 2 + 1, thick);
	port.fillColor(color, cx - (thick >> 1), cy - arm, thick, arm * 2 + 1);
}

function drawMinus(port: PortContent, cx: number, cy: number, arm: number, thick: number, color: string) {
	port.fillColor(color, cx - arm, cy - (thick >> 1), arm * 2 + 1, thick);
}

export function asCount(target: unknown): CountBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: CountBehavior }).behavior;
	return b && typeof b.setRun === "function" ? b : null;
}

export class CountBehavior extends Behavior {
	title = "计数";
	countText = "0";
	step = 1;
	stepIndex = 0;
	stepSlots = 1;
	volume = 0;
	/** +1 add, -1 subtract, 2 reset, 0 idle. */
	flash = 0;
	mark: Glyph = "";
	level = 0;
	sense: Sense = "hand";
	armed = false;
	peak = 0;

	setRun(
		port: unknown,
		title: string,
		count: number,
		step: number,
		stepIndex: number,
		stepSlots: number,
		volume: number,
		flash: number,
		mark: Glyph,
		level: number,
		sense: Sense,
		armed: boolean,
		peak: number,
	) {
		const countText = String(count < 0 ? 0 : count);
		const nextPeak = peak < 0 ? 0 : peak > 100 ? 100 : peak | 0;
		if (
			title === this.title
			&& countText === this.countText
			&& step === this.step
			&& stepIndex === this.stepIndex
			&& stepSlots === this.stepSlots
			&& volume === this.volume
			&& flash === this.flash
			&& mark === this.mark
			&& level === this.level
			&& sense === this.sense
			&& armed === this.armed
			&& nextPeak === this.peak
		)
			return;
		this.title = title;
		this.countText = countText;
		this.step = step;
		this.stepIndex = stepIndex;
		this.stepSlots = stepSlots < 1 ? 1 : stepSlots;
		this.volume = volume;
		this.flash = flash;
		this.mark = mark;
		this.level = level;
		this.sense = sense;
		this.armed = armed;
		this.peak = nextPeak;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const height = port.height;
		const faceStyle = style();
		port.fillColor(BG, 0, 0, width, height);

		const titleCy = rowOrigin(0) + Math.floor(ROW_PITCH / 2);
		const markW = this.mark ? TITLE_MARK + TITLE_MARK_GAP : 0;
		if (this.mark) {
			drawGlyph(
				port,
				6 + Math.floor(TITLE_MARK / 2),
				titleCy,
				TITLE_MARK,
				this.mark,
				this.level,
			);
		}
		port.drawString(
			this.title,
			faceStyle,
			this.sense === "ear" && this.armed ? ON : INK,
			6 + markW,
			rowTextY(0),
			Math.max(1, width - 12 - markW - 28),
		);
		drawGlyph(
			port,
			width - 16,
			titleCy,
			18,
			this.volume <= 0 ? "mute" : "vol",
			this.volume,
		);

		const text = this.countText;
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
		const digitH = Math.min(this.sense === "ear" ? 48 : 58, Math.floor(digitW * 1.55));
		const x = Math.floor((width - span) / 2);
		drawReadout(port, text, x, 26, digitW, digitH, 8, gap, this.flash !== 0);

		if (this.sense === "ear") {
			const barY = 26 + digitH + 6;
			drawProgress(port, 10, barY, width - 20, 6, this.armed ? this.peak : 0);
		}

		const cy = height - 16;
		const minusOn = this.flash < 0;
		const plusOn = this.flash > 0 && this.flash !== 2;
		const resetOn = this.flash === 2;
		drawMinus(port, 18, cy, 7, 3, minusOn ? ON : MID);
		drawPlus(port, width - 18, cy, 7, 3, plusOn || resetOn ? ON : MID);

		const slots = this.stepSlots;
		const lit = this.stepIndex < 0 ? 0 : this.stepIndex >= slots ? slots - 1 : this.stepIndex;
		const r = 5;
		const spanW = Math.min(width - 56, slots * 22);
		const x0 = Math.floor((width - spanW) / 2);
		for (let i = 0; i < slots; i++) {
			const cx = x0 + Math.floor((i + 0.5) * spanW / slots);
			if (i === lit) {
				fillDisk(port, cx, cy, r + 2, MID);
				fillDisk(port, cx, cy, r, ON);
			}
			else
				strokeDisk(port, cx, cy, r, MID);
		}

		const stepLabel = String(this.step);
		const stepW = port.measureString(stepLabel, faceStyle).width;
		port.drawString(
			stepLabel,
			faceStyle,
			resetOn ? ON : INK,
			Math.max(0, Math.floor((width - stepW) / 2)),
			rowTextY(4),
			stepW + 2,
		);
	}
}
