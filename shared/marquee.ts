/*
	Bounce-scroll label Port behavior.
	Optional Glyph: empty text → large centered glyph;
	short text + glyph → glyph+text cluster centered on the band;
	overflowing text → small glyph pinned left, line scrolls in the rest.
	Optional rightMark stays pinned on the right (clock battery, etc.).
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph, drawProgress } from "draw";
import { BG, FONT_UI, INK, type Glyph } from "ink";

/** Lazily built — Moddable link rejects top-level `new Style` outside main. */
let marqueeStyle: /* Style */ object | undefined;
function getMarqueeStyle(): /* Style */ any {
	if (!marqueeStyle)
		marqueeStyle = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "middle" });
	return marqueeStyle;
}

const MARQUEE_HOLD_MS = 900;
export const MARQUEE_MS = 50;
const MARQUEE_PX = 1;
const TAIL_GAP = 6;
const TAIL_PAD = 4;
const MARK_PAD = 4;
const MARK_GAP = 6;

export function asMarquee(target: unknown): MarqueeBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: MarqueeBehavior }).behavior;
	return b && typeof b.setText === "function" && typeof b.tick === "function" ? b : null;
}

export function setMarqueeText(
	target: unknown,
	value: string,
	face?: object,
	color?: string,
	tail?: string,
	tailFace?: object,
	mark?: Glyph,
	level?: number,
	rightMark?: Glyph,
	rightLevel?: number,
) {
	const b = asMarquee(target);
	if (b)
		b.setText(target as PortContent, value, face, color, tail, tailFace, mark, level, rightMark, rightLevel);
}

/** Flash a full-band glyph (clears the scrolling line). */
export function setMarqueeMark(target: unknown, mark: Glyph, level?: number) {
	const b = asMarquee(target);
	if (b)
		b.setText(target as PortContent, "", undefined, undefined, "", undefined, mark, level);
}

export class MarqueeBehavior extends Behavior {
	string = "";
	tail = "";
	mark: Glyph = "";
	level = 0;
	rightMark: Glyph = "";
	rightLevel = 0;
	textW = 0;
	offset = 0;
	dir = 1;
	holdUntil = 0;
	color = INK;
	fontFace: object | undefined;
	tailFace: object | undefined;

	setText(
		port: PortContent,
		text: string,
		face?: object,
		color?: string,
		tail?: string,
		tailFace?: object,
		mark?: Glyph,
		level?: number,
		rightMark?: Glyph,
		rightLevel?: number,
	) {
		const next = face ?? getMarqueeStyle();
		const ink = color ? color : INK;
		const nextTail = tail ? tail : "";
		const nextMark = mark ? mark : "";
		const nextLevel = level === undefined ? 0 : level;
		const nextRight = rightMark ? rightMark : "";
		const nextRightLevel = rightLevel === undefined ? 0 : rightLevel;
		if (
			text === this.string
			&& next === this.fontFace
			&& ink === this.color
			&& nextTail === this.tail
			&& tailFace === this.tailFace
			&& nextMark === this.mark
			&& nextLevel === this.level
			&& nextRight === this.rightMark
			&& nextRightLevel === this.rightLevel
		)
			return;
		const bodyChanged = text !== this.string || next !== this.fontFace || nextMark !== this.mark
			|| nextRight !== this.rightMark;
		this.string = text;
		this.fontFace = next;
		this.color = ink;
		this.tail = nextTail;
		this.tailFace = tailFace;
		this.mark = nextMark;
		this.level = nextLevel;
		this.rightMark = nextRight;
		this.rightLevel = nextRightLevel;
		this.textW = text ? port.measureString(text, next).width : 0;
		if (bodyChanged) {
			this.offset = 0;
			this.dir = 1;
			this.holdUntil = Date.now() + MARQUEE_HOLD_MS;
		}
		port.invalidate();
	}

	glyphSide(port: PortContent, kind: Glyph): number {
		if (!kind)
			return 0;
		if (kind === "progress")
			return Math.min(port.width >> 1, 72);
		const side = Math.min(port.height - MARK_PAD * 2, 22);
		// Battery outline is wider than tall.
		if (kind === "batt")
			return Math.max(side, Math.floor(side * 1.35));
		return side;
	}

	markReserve(port: PortContent): number {
		if (!this.mark || !this.string)
			return 0;
		return this.glyphSide(port, this.mark) + MARK_GAP;
	}

	rightReserve(port: PortContent): number {
		if (!this.rightMark)
			return 0;
		return this.glyphSide(port, this.rightMark) + MARK_GAP;
	}

	bodyWidth(port: PortContent): number {
		const markW = this.markReserve(port);
		const rightW = this.rightReserve(port);
		let room = port.width - markW - rightW;
		if (this.tail && this.string) {
			const face = this.tailFace ?? getMarqueeStyle();
			const tailW = port.measureString(this.tail, face).width;
			room -= TAIL_PAD + tailW + TAIL_GAP;
		}
		return room > 1 ? room : 1;
	}

	tick(port: PortContent) {
		if (!this.string)
			return;
		this.textW = port.measureString(this.string, this.fontFace ?? getMarqueeStyle()).width;
		const maxScroll = this.textW - this.bodyWidth(port);
		if (maxScroll <= 0) {
			if (this.offset !== 0) {
				this.offset = 0;
				port.invalidate();
			}
			return;
		}
		if (this.offset > maxScroll) {
			this.offset = maxScroll;
			port.invalidate();
		}
		const now = Date.now();
		if (now < this.holdUntil)
			return;
		this.offset += this.dir * MARQUEE_PX;
		if (this.offset >= maxScroll) {
			this.offset = maxScroll;
			this.dir = -1;
			this.holdUntil = now + MARQUEE_HOLD_MS;
		}
		else if (this.offset <= 0) {
			this.offset = 0;
			this.dir = 1;
			this.holdUntil = now + MARQUEE_HOLD_MS;
		}
		port.invalidate();
	}

	paintMark(port: PortContent, kind: Glyph, level: number, cx: number, cy: number, size: number) {
		if (kind === "progress") {
			const w = Math.max(24, size);
			drawProgress(port, cx - (w >> 1), cy - 3, w, 6, level);
			return;
		}
		drawGlyph(port, cx, cy, size, kind, level);
	}

	onDraw(port: PortContent) {
		const width = port.width;
		const height = port.height;
		port.fillColor(BG, 0, 0, width, height);
		const text = this.string;
		const tail = this.tail;
		const mark = this.mark;
		const rightMark = this.rightMark;
		if (mark && !text && !tail && !rightMark) {
			const size = Math.min(width, height) - MARK_PAD * 2;
			this.paintMark(port, mark, this.level, Math.floor(width / 2), Math.floor(height / 2), size);
			return;
		}
		const markW = this.markReserve(port);
		const rightW = this.rightReserve(port);
		const tailFace = this.tailFace ?? getMarqueeStyle();
		const share = tail.length > 0 && text.length > 0;
		let tailW = 0;
		let tailH = 0;
		if (tail) {
			const measuredTail = port.measureString(tail, tailFace);
			tailW = measuredTail.width;
			tailH = measuredTail.height;
		}
		const bodyW = this.bodyWidth(port);
		const face = this.fontFace ?? getMarqueeStyle();
		let textW = 0;
		let textH = 0;
		if (text) {
			const measured = port.measureString(text, face);
			textW = measured.width;
			textH = measured.height;
		}
		const maxScroll = text ? textW - bodyW : 0;
		// Short line + left glyph: center the cluster in the band left of a fixed
		// right mark (battery), so status like 正在连接 still looks centered.
		const cluster = markW > 0 && text.length > 0 && maxScroll <= 0 && !share;
		const usable = width - rightW;
		const bodyX = cluster
			? Math.floor((usable - (markW + textW)) / 2) + markW
			: markW;
		if (mark && markW > 0) {
			const side = markW - MARK_GAP;
			const markLeft = cluster ? bodyX - markW : 0;
			this.paintMark(
				port,
				mark,
				this.level,
				markLeft + MARK_PAD + Math.floor(side / 2),
				Math.floor(height / 2),
				side,
			);
		}
		if (text) {
			const x = bodyX + (maxScroll <= 0
				? (cluster ? 0 : Math.floor((bodyW - textW) / 2))
				: -Math.floor(this.offset));
			const y = Math.max(0, Math.floor((height - textH) / 2));
			const drawW = Math.max(textW, bodyW);
			port.drawString(text, face, this.color, x, y, drawW);
		}
		if (share) {
			const shareBodyX = markW;
			const tailX = width - rightW - TAIL_PAD - tailW;
			port.fillColor(BG, shareBodyX + bodyW, 0, width - rightW - (shareBodyX + bodyW), height);
			const y = Math.max(0, Math.floor((height - tailH) / 2));
			port.drawString(tail, tailFace, this.color, tailX, y, Math.max(tailW, 1));
		}
		else if (tail) {
			const x = tailW >= usable ? 0 : Math.floor((usable - tailW) / 2);
			const y = Math.max(0, Math.floor((height - tailH) / 2));
			port.drawString(tail, tailFace, this.color, x, y, Math.max(tailW, usable));
		}
		if (rightMark && rightW > 0) {
			const side = rightW - MARK_GAP;
			this.paintMark(
				port,
				rightMark,
				this.rightLevel,
				width - MARK_PAD - Math.floor(side / 2),
				Math.floor(height / 2),
				side,
			);
		}
	}
}
