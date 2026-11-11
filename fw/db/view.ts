/*
	Meter face: title strip with average / max, a 7-seg readout, and a
	scrolling bar history coloured by loudness.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph, drawReadout, readoutSpan } from "draw";
import { AMBER, BG, DIM, FONT_UI, INK, MID, ON, RED, type Glyph } from "ink";
import { rowOrigin, rowTextY, ROW_PITCH } from "list";
import { themeGeneration } from "theme";

/** Bars across the panel: 2 px each with 1 px gaps under 240 px. */
export const HISTORY = 76;

const LOUD = 70;
const HOT = 85;
/** Graph spans this dB range bottom to top. */
const GRAPH_LO = 30;
const GRAPH_HI = 110;

export type MeterState = {
	title: string;
	/** "dBA" / "dBZ". */
	unit: string;
	/** -1 = no reading yet. */
	value: number;
	avg: number;
	max: number;
	bars: number[];
	mark: Glyph;
	level: number;
};

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

export function asMeter(target: unknown): MeterBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: MeterBehavior }).behavior;
	return b && typeof b.setState === "function" ? b : null;
}

function colorFor(db: number): string {
	if (db >= HOT)
		return RED;
	if (db >= LOUD)
		return AMBER;
	return ON;
}

function same(a: MeterState, b: MeterState): boolean {
	if (a.title !== b.title || a.unit !== b.unit || a.value !== b.value || a.avg !== b.avg || a.max !== b.max
		|| a.mark !== b.mark || a.level !== b.level || a.bars.length !== b.bars.length)
		return false;
	for (let i = 0; i < a.bars.length; i++) {
		if (a.bars[i] !== b.bars[i])
			return false;
	}
	return true;
}

export class MeterBehavior extends Behavior {
	state: MeterState = { title: "", unit: "dB", value: -1, avg: -1, max: -1, bars: [], mark: "", level: 0 };
	gen = -1;

	setState(port: unknown, next: MeterState) {
		const gen = themeGeneration();
		if (gen === this.gen && same(this.state, next))
			return;
		this.state = next;
		this.gen = gen;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const s = this.state;
		const width = port.width;
		const height = port.height;
		const st = style();
		port.fillColor(BG, 0, 0, width, height);

		const titleCy = rowOrigin(0) + Math.floor(ROW_PITCH / 2);
		let tx = 6;
		if (s.mark) {
			drawGlyph(port, tx + 9, titleCy, 18, s.mark, s.level);
			tx += 24;
		}
		const stats = "均" + (s.avg < 0 ? "--" : s.avg) + " 高" + (s.max < 0 ? "--" : s.max);
		const sw = port.measureString(stats, st).width;
		port.drawString(stats, st, MID, width - 6 - sw, rowTextY(0), sw + 2);
		port.drawString(s.title, st, ON, tx, rowTextY(0), Math.max(1, width - tx - sw - 12));

		/* Readout: up to three digits plus the unit. */
		const top = ROW_PITCH + 2;
		const digitH = 46;
		const digitW = 26;
		const gap = 5;
		const text = s.value < 0 ? "   " : String(Math.min(999, s.value));
		const span = readoutSpan(text, digitW, 12, gap);
		const unit = s.unit;
		const uw = port.measureString(unit, st).width;
		const x0 = Math.floor((width - span - uw - 6) / 2);
		drawReadout(port, text, x0, top, digitW, digitH, 12, gap, true);
		port.drawString(unit, st, s.value < 0 ? DIM : colorFor(s.value), x0 + span + 6, top + digitH - 22, uw + 2);

		/* History, newest on the right. Threshold ticks at LOUD and HOT. */
		const gTop = top + digitH + 8;
		const gH = height - gTop - 2;
		const yFor = (db: number) => {
			const t = (Math.max(GRAPH_LO, Math.min(GRAPH_HI, db)) - GRAPH_LO) / (GRAPH_HI - GRAPH_LO);
			return gTop + gH - Math.round(t * gH);
		};
		const pitch = 3;
		const left = width - 4 - HISTORY * pitch;
		port.fillColor(DIM, left, yFor(LOUD), HISTORY * pitch, 1);
		port.fillColor(DIM, left, yFor(HOT), HISTORY * pitch, 1);
		const n = s.bars.length;
		for (let i = 0; i < n; i++) {
			const v = s.bars[i];
			const y = yFor(v);
			const h = gTop + gH - y;
			if (h <= 0)
				continue;
			port.fillColor(colorFor(v), left + (HISTORY - n + i) * pitch, y, pitch - 1, h);
		}
	}
}
