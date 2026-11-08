/*
	Count chrome for the Casio three-band face:
	top title strip, shared sevenseg middle, footer − / step / +.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph, drawProgress, fillDisk, strokeDisk } from "draw";
import { BG, FONT_UI, INK, MID, ON, type Glyph } from "ink";

const TITLE_MARK = 18;
const TITLE_MARK_GAP = 6;

export type Sense = "hand" | "ear";
/** Listen threshold: high = easiest to trigger. */
export type Gain = "high" | "mid" | "low";

export function gainLabel(gain: Gain): string {
	if (gain === "high")
		return "高";
	if (gain === "low")
		return "低";
	return "中";
}

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

export function asCountTop(target: unknown): CountTopBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: CountTopBehavior }).behavior;
	return b && typeof b.setTop === "function" ? b : null;
}

export function asCountFooter(target: unknown): CountFooterBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: CountFooterBehavior }).behavior;
	return b && typeof b.setFooter === "function" ? b : null;
}

export class CountTopBehavior extends Behavior {
	title = "计数";
	volume = 0;
	mark: Glyph = "";
	level = 0;
	sense: Sense = "hand";
	armed = false;

	setTop(
		port: unknown,
		title: string,
		volume: number,
		mark: Glyph,
		level: number,
		sense: Sense,
		armed: boolean,
	) {
		if (
			title === this.title
			&& volume === this.volume
			&& mark === this.mark
			&& level === this.level
			&& sense === this.sense
			&& armed === this.armed
		)
			return;
		this.title = title;
		this.volume = volume;
		this.mark = mark;
		this.level = level;
		this.sense = sense;
		this.armed = armed;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const height = port.height;
		const faceStyle = style();
		port.fillColor(BG, 0, 0, width, height);

		const titleCy = Math.floor(height / 2);
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
		const measured = port.measureString(this.title, faceStyle);
		const textY = Math.max(0, Math.floor((height - measured.height) / 2));
		port.drawString(
			this.title,
			faceStyle,
			this.sense === "ear" && this.armed ? ON : INK,
			6 + markW,
			textY,
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
	}
}

export class CountFooterBehavior extends Behavior {
	step = 1;
	stepIndex = 0;
	stepSlots = 1;
	flash = 0;
	sense: Sense = "hand";
	gain: Gain = "mid";
	armed = false;
	peak = 0;

	setFooter(
		port: unknown,
		step: number,
		stepIndex: number,
		stepSlots: number,
		flash: number,
		sense: Sense,
		gain: Gain,
		armed: boolean,
		peak: number,
	) {
		const nextPeak = peak < 0 ? 0 : peak > 100 ? 100 : peak | 0;
		if (
			step === this.step
			&& stepIndex === this.stepIndex
			&& stepSlots === this.stepSlots
			&& flash === this.flash
			&& sense === this.sense
			&& gain === this.gain
			&& armed === this.armed
			&& nextPeak === this.peak
		)
			return;
		this.step = step;
		this.stepIndex = stepIndex;
		this.stepSlots = stepSlots < 1 ? 1 : stepSlots;
		this.flash = flash;
		this.sense = sense;
		this.gain = gain;
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

		const ear = this.sense === "ear";
		if (ear) {
			const label = gainLabel(this.gain);
			const labelW = port.measureString(label, faceStyle).width;
			drawProgress(port, 10, 2, width - 28 - labelW, 4, this.armed ? this.peak : 0);
			port.drawString(label, faceStyle, this.armed ? ON : INK, width - 10 - labelW, -2, labelW + 2);
		}

		const cy = ear ? height - 12 : Math.floor(height / 2) + 2;
		const minusOn = this.flash < 0;
		const plusOn = this.flash > 0 && this.flash !== 2;
		const resetOn = this.flash === 2;
		drawMinus(port, 18, cy, 6, 3, minusOn ? ON : MID);
		drawPlus(port, width - 18, cy, 6, 3, plusOn || resetOn ? ON : MID);

		const slots = this.stepSlots;
		const lit = this.stepIndex < 0 ? 0 : this.stepIndex >= slots ? slots - 1 : this.stepIndex;
		const r = 4;
		const spanW = Math.min(width - 56, slots * 20);
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

		if (!ear) {
			const stepLabel = String(this.step);
			const stepW = port.measureString(stepLabel, faceStyle).width;
			port.drawString(
				stepLabel,
				faceStyle,
				resetOn ? ON : INK,
				Math.max(0, Math.floor((width - stepW) / 2)),
				-2,
				stepW + 2,
			);
		}
	}
}
