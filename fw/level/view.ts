/*
	Bubble-level Port. Flat → 2D vial; standing on an edge → 1D tube.
	Header uses the shared 22px band. The vial sits in the space below it.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, FONT_UI, INK, MID, ON } from "ink";
import { ROW_LEAD, ROW_PITCH, rowOrigin, rowTextY } from "list";

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
	port.drawString(text, style(), color, x, y, Math.max(1, port.width - x));
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
			drawString(port, text, INK, Math.max(0, Math.floor((port.width - w) / 2)), rowTextY(3));
			return;
		}
		if (f.mode === "flat")
			this.drawFlat(port, f);
		else
			this.drawEdge(port, f);
	}

	drawHeader(port: PortContent, left: string, right: string, rightColor: string) {
		const y = rowTextY(0);
		drawString(port, left, INK, 2, y);
		if (!right)
			return;
		const w = port.measureString(right, style()).width;
		drawString(port, right, rightColor, Math.max(2, port.width - 2 - w), y);
	}

	drawFlat(port: PortContent, f: LevelFrame) {
		const status = f.note ? f.note : (f.level ? "水平" : "调整");
		const statusColor = f.note || f.level ? ON : AMBER;
		this.drawHeader(port, "平放", status, statusColor);

		const bodyTop = rowOrigin(1);
		const bodyH = port.height - bodyTop;
		const r = 44;
		const cx = 8 + r;
		const cy = bodyTop + Math.floor(bodyH / 2);
		const ring = f.level ? ON : MID;
		strokeDisk(port, cx, cy, r, MID);
		strokeDisk(port, cx, cy, Math.floor(r * 2 / 3), MID);
		strokeDisk(port, cx, cy, Math.floor(r / 3), ring);
		port.fillColor(MID, cx - r + 4, cy, (r - 4) * 2 + 1, 1);
		port.fillColor(MID, cx, cy - r + 4, 1, (r - 4) * 2 + 1);
		port.fillColor(ON, cx, cy, 2, 2);

		const fx = clamp(f.roll / MAX_DEG, -1, 1);
		const fy = clamp(f.pitch / MAX_DEG, -1, 1);
		const bx = cx + Math.floor(fx * (r - 10));
		const by = cy + Math.floor(fy * (r - 10));
		drawBubble(port, bx, by, 9, f.level);

		const tx = cx + r + 14;
		const textTop = bodyTop + Math.floor((bodyH - ROW_PITCH * 4) / 2);
		const valueColor = f.level ? ON : AMBER;
		drawString(port, "俯仰", INK, tx, textTop - ROW_LEAD);
		drawString(port, formatDeg(f.pitch), valueColor, tx, textTop + ROW_PITCH - ROW_LEAD);
		drawString(port, "横滚", INK, tx, textTop + ROW_PITCH * 2 - ROW_LEAD);
		drawString(port, formatDeg(f.roll), valueColor, tx, textTop + ROW_PITCH * 3 - ROW_LEAD);
	}

	drawEdge(port: PortContent, f: LevelFrame) {
		const label = f.mode === "edgeY" ? "立边 Y" : "立边 X";
		const status = f.note ? f.note : (f.level ? "水平" : "调整");
		const statusColor = f.note || f.level ? ON : AMBER;
		this.drawHeader(port, label, status, statusColor);

		const cx = Math.floor(port.width / 2);
		const cy = 68;
		const tubeW = 208;
		const tubeH = 28;
		const x0 = cx - Math.floor(tubeW / 2);
		const y0 = cy - Math.floor(tubeH / 2);
		const rad = Math.floor(tubeH / 2);

		port.fillColor(MID, x0 + rad, y0, tubeW - rad * 2, tubeH);
		fillDisk(port, x0 + rad, cy, rad, MID);
		fillDisk(port, x0 + tubeW - rad, cy, rad, MID);
		port.fillColor(BG, x0 + rad, y0 + 2, tubeW - rad * 2, tubeH - 4);
		fillDisk(port, x0 + rad, cy, rad - 2, BG);
		fillDisk(port, x0 + tubeW - rad, cy, rad - 2, BG);

		port.fillColor(ON, cx, y0 - 4, 2, tubeH + 8);
		port.fillColor(MID, cx - 14, y0 + 5, 1, tubeH - 10);
		port.fillColor(MID, cx + 14, y0 + 5, 1, tubeH - 10);

		const fx = clamp(f.edge / MAX_DEG, -1, 1);
		const bx = cx + Math.floor(fx * (tubeW / 2 - 18));
		drawBubble(port, bx, cy, rad - 4, f.level);

		const text = formatDeg(f.edge);
		const tw = port.measureString(text, style()).width;
		drawString(port, text, f.level ? ON : AMBER, Math.floor((port.width - tw) / 2), cy + 22);
	}
}

export { TOLERANCE };
