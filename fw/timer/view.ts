/*
	Timer chrome for the three-band face: top status / pose mark / volume,
	shared sevenseg MM:SS in the middle, a progress bar along the bottom.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph } from "draw";
import { AMBER, BG, FONT_UI, INK, MID, ON } from "ink";
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

function invalidate(port: unknown) {
	if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
		port.invalidate();
}

export type TimerState = "idle" | "run" | "pause" | "done";

export function asTimerTop(target: unknown): TimerTopBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: TimerTopBehavior }).behavior;
	return b && typeof b.setTop === "function" ? b : null;
}

export function asTimerFooter(target: unknown): TimerFooterBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: TimerFooterBehavior }).behavior;
	return b && typeof b.setFooter === "function" ? b : null;
}

/** Title text for each state; a status note (brightness, theme) replaces it briefly. */
function titleFor(state: TimerState): string {
	if (state === "run")
		return "进行";
	if (state === "pause")
		return "暂停";
	if (state === "done")
		return "到点";
	return "计时";
}

export class TimerTopBehavior extends Behavior {
	state: TimerState = "idle";
	note = "";
	/** Pose control on: "立" sits left of the volume glyph. */
	pose = true;
	volume = 0;

	setTop(port: unknown, state: TimerState, note: string, pose: boolean, volume: number) {
		if (state === this.state && note === this.note && pose === this.pose && volume === this.volume)
			return;
		this.state = state;
		this.note = note;
		this.pose = pose;
		this.volume = volume;
		invalidate(port);
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const height = port.height;
		const faceStyle = style();
		port.fillColor(BG, 0, 0, width, height);
		const cy = Math.floor(height / 2);
		const run = this.state === "run";
		const titleX = run ? 28 : 6;
		if (run)
			drawGlyph(port, 14, cy, 16, "play");
		const title = this.note || titleFor(this.state);
		const color = this.note ? INK : this.state === "done" ? AMBER : run ? ON : INK;
		const measured = port.measureString(title, faceStyle);
		const textY = Math.max(0, Math.floor((height - measured.height) / 2));
		let right = width - 36;
		if (this.pose) {
			const mark = "立";
			const w = port.measureString(mark, faceStyle).width;
			right -= w + 6;
			port.drawString(mark, faceStyle, MID, right + 3, textY, w);
		}
		port.drawString(title, faceStyle, color, titleX, textY, Math.max(1, right - titleX));
		drawGlyph(port, width - 16, cy, 18, this.volume <= 0 ? "mute" : "vol", this.volume);
	}
}

export class TimerFooterBehavior extends Behavior {
	/** 0..1 of the interval used up. */
	done = 0;
	state: TimerState = "idle";

	setFooter(port: unknown, done: number, state: TimerState) {
		const d = done < 0 ? 0 : done > 1 ? 1 : done;
		// Redraw only when the bar moves by a pixel or the state changes.
		if (state === this.state && Math.abs(d - this.done) * 200 < 1)
			return;
		this.done = d;
		this.state = state;
		invalidate(port);
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const height = port.height;
		port.fillColor(BG, 0, 0, width, height);
		const x = 12;
		const w = width - 24;
		const h = 12;
		const y = Math.floor((height - h) / 2);
		port.fillColor(MID, x, y, w, h);
		port.fillColor(BG, x + 2, y + 2, w - 4, h - 4);
		const fill = Math.round((w - 4) * this.done);
		if (fill > 0)
			port.fillColor(this.state === "done" ? AMBER : ON, x + 2, y + 2, fill, h - 4);
	}
}
