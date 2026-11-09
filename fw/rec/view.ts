import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph } from "draw";
import { AMBER, BG, DIM, FONT_UI, INK, MID, ON, type Glyph } from "ink";
import { rowOrigin, rowTextY, ROW_PITCH } from "list";
import { themeGeneration } from "theme";

const SEGS = 14;
const TITLE_MARK = 18;
const TITLE_MARK_GAP = 6;

let face: object | undefined;
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
	return b && typeof b.setMeter === "function" ? b : null;
}

export class MeterBehavior extends Behavior {
	title = "录音";
	/** 0–100, or -1 while playback should bounce. */
	peak = 0;
	sub = "";
	mark: Glyph = "";
	level = 0;
	hold = 0;
	holdAt = 0;

	setMeter(port: unknown, title: string, peak: number, sub: string, mark: Glyph = "", level?: number) {
		const anim = peak < 0;
		const next = anim ? -1 : peak > 100 ? 100 : peak;
		const now = Date.now();
		const nextLevel = level === undefined ? 0 : level;
		if (anim)
			this.hold = 0;
		else if (next >= this.hold) {
			this.hold = next;
			this.holdAt = now;
		}
		const decaying = !anim && this.hold > next && now - this.holdAt > 400;
		if (!anim && !decaying && title === this.title && next === this.peak && sub === this.sub && mark === this.mark && nextLevel === this.level)
			return;
		this.title = title;
		this.peak = next;
		this.sub = sub;
		this.mark = mark;
		this.level = nextLevel;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const faceStyle = style();
		const width = port.width;
		port.fillColor(BG, 0, 0, width, port.height);
		const markW = this.mark ? TITLE_MARK + TITLE_MARK_GAP : 0;
		if (this.mark) {
			drawGlyph(
				port,
				6 + Math.floor(TITLE_MARK / 2),
				rowOrigin(0) + Math.floor(ROW_PITCH / 2),
				TITLE_MARK,
				this.mark,
				this.level,
			);
		}
		port.drawString(this.title, faceStyle, ON, 6 + markW, rowTextY(0), Math.max(1, width - 12 - markW));
		let level = this.peak;
		if (level < 0) {
			const t = (Date.now() % 900) / 900;
			const s = Math.sin(t * Math.PI * 2);
			level = 36 + Math.floor((s < 0 ? -s : s) * 52);
		}
		else if (Date.now() - this.holdAt > 400 && this.hold > level) {
			this.hold = this.hold - 3 < level ? level : this.hold - 3;
		}
		const margin = 10;
		const gap = 2;
		const inner = width - margin * 2 - gap * (SEGS - 1);
		const segW = Math.max(1, Math.floor(inner / SEGS));
		const y = 54;
		const h = 26;
		const litN = Math.round(level / 100 * SEGS);
		const holdN = Math.round(this.hold / 100 * SEGS);
		const hot = SEGS - 3;
		for (let i = 0; i < SEGS; i++) {
			let color = DIM;
			if (i < litN)
				color = i >= hot ? AMBER : ON;
			else if (i === holdN - 1 && holdN > litN)
				color = MID;
			port.fillColor(color, margin + i * (segW + gap), y, segW, h);
		}
		port.drawString(this.sub, faceStyle, INK, 6, rowTextY(4), width - 12);
	}
}
