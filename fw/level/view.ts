/*
	Bubble-level Port. Flat → 2D vial; standing on an edge → 1D tube.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, DIM, FONT_UI, INK, ON } from "ink";

export type LevelMode = "flat" | "edgeY" | "edgeX" | "none";

export type LevelFrame = {
	mode: LevelMode;
	pitch: number;
	roll: number;
	edge: number;
	level: boolean;
	note: string;
};

const TOLERANCE = 0.5;
const MAX_DEG = 12;
const AMBER = "#FFB000";

let faceStyle: /* Style */ object | undefined;
function style(): /* Style */ any {
	if (!faceStyle)
		faceStyle = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
	return faceStyle;
}

function clamp(v: number, lo: number, hi: number): number {
	if (v < lo)
		return lo;
	if (v > hi)
		return hi;
	return v;
}

function fillDisk(port: PortContent, cx: number, cy: number, r: number, color: string) {
	if (r <= 0)
		return;
	for (let dy = -r; dy <= r; dy++) {
		const rr = r * r - dy * dy;
		if (rr < 0)
			continue;
		const w = Math.floor(Math.sqrt(rr));
		port.fillColor(color, cx - w, cy + dy, w * 2 + 1, 1);
	}
}

function strokeDisk(port: PortContent, cx: number, cy: number, r: number, color: string) {
	if (r <= 0)
		return;
	for (let dy = -r; dy <= r; dy++) {
		const rr = r * r - dy * dy;
		if (rr < 0)
			continue;
		const w = Math.floor(Math.sqrt(rr));
		const inner = (r - 1) * (r - 1) - dy * dy;
		if (inner < 0) {
			port.fillColor(color, cx - w, cy + dy, w * 2 + 1, 1);
			continue;
		}
		const wi = Math.floor(Math.sqrt(inner));
		if (w > wi) {
			port.fillColor(color, cx - w, cy + dy, w - wi, 1);
			port.fillColor(color, cx + wi + 1, cy + dy, w - wi, 1);
		}
	}
}

function drawString(port: PortContent, text: string, color: string, x: number, y: number) {
	port.drawString(text, style(), color, x, y, Math.max(1, port.width - x), 30);
}

function formatDeg(deg: number): string {
	const sign = deg >= 0 ? "+" : "";
	return sign + deg.toFixed(1) + "\u00B0";
}

function drawBubble(port: PortContent, x: number, y: number, r: number, ok: boolean) {
	const fill = ok ? ON : AMBER;
	fillDisk(port, x, y, r, fill);
	fillDisk(port, x - Math.floor(r / 3), y - Math.floor(r / 3), Math.max(2, Math.floor(r / 3)), INK);
	strokeDisk(port, x, y, r, INK);
}

export function asLevel(target: unknown): LevelViewBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: LevelViewBehavior }).behavior;
	return b && typeof b.setFrame === "function" ? b : null;
}

export class LevelViewBehavior extends Behavior {
	frame: LevelFrame = {
		mode: "none",
		pitch: 0,
		roll: 0,
		edge: 0,
		level: false,
		note: "",
	};

	setFrame(port: unknown, frame: LevelFrame) {
		this.frame = frame;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		port.fillColor(BG, 0, 0, port.width, port.height);
		const f = this.frame;
		if (f.mode === "none") {
			const text = f.note || "无芯片";
			const w = port.measureString(text, style()).width;
			drawString(port, text, INK, Math.max(6, Math.floor((port.width - w) / 2)), 54);
			return;
		}
		if (f.mode === "flat")
			this.drawFlat(port, f);
		else
			this.drawEdge(port, f);
	}

	drawFlat(port: PortContent, f: LevelFrame) {
		const cx = 60;
		const cy = 68;
		const r = 46;
		drawString(port, "平放", INK, 6, 2);
		drawString(port, f.level ? "水平" : "调整", f.level ? ON : DIM, 190, 2);

		strokeDisk(port, cx, cy, r, DIM);
		strokeDisk(port, cx, cy, Math.floor(r * 2 / 3), DIM);
		strokeDisk(port, cx, cy, Math.floor(r / 3), DIM);
		port.fillColor(DIM, cx - r + 3, cy, (r - 3) * 2 + 1, 1);
		port.fillColor(DIM, cx, cy - r + 3, 1, (r - 3) * 2 + 1);
		port.fillColor(ON, cx, cy, 2, 2);

		const fx = clamp(f.roll / MAX_DEG, -1, 1);
		const fy = clamp(f.pitch / MAX_DEG, -1, 1);
		const bx = cx + Math.floor(fx * (r - 9));
		const by = cy + Math.floor(fy * (r - 9));
		drawBubble(port, bx, by, 9, f.level);

		const tx = 128;
		drawString(port, "俯仰", DIM, tx, 28);
		drawString(port, formatDeg(f.pitch), f.level ? ON : INK, tx, 48);
		drawString(port, "横滚", DIM, tx, 78);
		drawString(port, formatDeg(f.roll), f.level ? ON : INK, tx, 98);

		if (f.note)
			drawString(port, f.note, ON, 6, 114);
	}

	drawEdge(port: PortContent, f: LevelFrame) {
		const label = f.mode === "edgeY" ? "立边 Y" : "立边 X";
		drawString(port, label, INK, 6, 2);
		drawString(port, f.level ? "水平" : "调整", f.level ? ON : DIM, 190, 2);

		const cx = Math.floor(port.width / 2);
		const cy = 62;
		const tubeW = 200;
		const tubeH = 28;
		const x0 = cx - Math.floor(tubeW / 2);
		const y0 = cy - Math.floor(tubeH / 2);
		const rad = Math.floor(tubeH / 2);

		port.fillColor(DIM, x0 + rad, y0, tubeW - rad * 2, tubeH);
		fillDisk(port, x0 + rad, cy, rad, DIM);
		fillDisk(port, x0 + tubeW - rad, cy, rad, DIM);
		port.fillColor(BG, x0 + rad, y0 + 2, tubeW - rad * 2, tubeH - 4);
		fillDisk(port, x0 + rad, cy, rad - 2, BG);
		fillDisk(port, x0 + tubeW - rad, cy, rad - 2, BG);

		port.fillColor(ON, cx, y0 - 4, 2, tubeH + 8);
		port.fillColor(DIM, cx - 14, y0 + 5, 1, tubeH - 10);
		port.fillColor(DIM, cx + 14, y0 + 5, 1, tubeH - 10);

		const fx = clamp(f.edge / MAX_DEG, -1, 1);
		const bx = cx + Math.floor(fx * (tubeW / 2 - 18));
		drawBubble(port, bx, cy, rad - 4, f.level);

		const text = formatDeg(f.edge);
		const tw = port.measureString(text, style()).width;
		drawString(port, text, f.level ? ON : INK, Math.floor((port.width - tw) / 2), 96);

		if (f.note)
			drawString(port, f.note, ON, 6, 114);
	}
}

export { TOLERANCE };
