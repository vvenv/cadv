/*
	Bounce-scroll label Port behavior.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, FONT_UI, INK, MID } from "ink";

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
/** Gap between the scrolling line and a pinned tail. */
const TAIL_GAP = 6;
/** Inset so a pinned tail does not sit on the bezel. */
const TAIL_PAD = 4;

export function asMarquee(target: unknown): MarqueeBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: MarqueeBehavior }).behavior;
	return b && typeof b.setText === "function" && typeof b.tick === "function" ? b : null;
}

export function setMarqueeText(target: unknown, value: string, face?: object, color?: string, tail?: string, tailFace?: object) {
	const b = asMarquee(target);
	if (b)
		b.setText(target as PortContent, value, face, color, tail, tailFace);
}

/**
	Bounce-scroll a single line when it is wider than the port. Ticked by AppBehavior.
	`tail` is drawn in `tailFace` (default UI) and does not scroll: pinned to the right
	when the line is present, centered when the line is empty.
*/
export class MarqueeBehavior extends Behavior {
	string = "";
	tail = "";
	textW = 0;
	offset = 0;
	dir = 1;
	holdUntil = 0;
	color = INK;
	fontFace: object | undefined;
	tailFace: object | undefined;

	setText(port: PortContent, text: string, face?: object, color?: string, tail?: string, tailFace?: object) {
		const next = face ?? getMarqueeStyle();
		const ink = color ? color : INK;
		const nextTail = tail ? tail : "";
		if (text === this.string && next === this.fontFace && ink === this.color && nextTail === this.tail && tailFace === this.tailFace)
			return;
		const bodyChanged = text !== this.string || next !== this.fontFace;
		this.string = text;
		this.fontFace = next;
		this.color = ink;
		this.tail = nextTail;
		this.tailFace = tailFace;
		this.textW = text ? port.measureString(text, next).width : 0;
		if (bodyChanged) {
			this.offset = 0;
			this.dir = 1;
			this.holdUntil = Date.now() + MARQUEE_HOLD_MS;
		}
		port.invalidate();
	}

	/** Width the scrolling line may use. The tail keeps the rest. */
	bodyWidth(port: PortContent): number {
		if (!this.tail || !this.string)
			return port.width;
		const face = this.tailFace ?? getMarqueeStyle();
		const tailW = port.measureString(this.tail, face).width;
		const room = port.width - TAIL_PAD - tailW - TAIL_GAP;
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

	onDraw(port: PortContent) {
		const width = port.width;
		const height = port.height;
		port.fillColor(BG, 0, 0, width, height);
		const text = this.string;
		const tail = this.tail;
		const tailFace = this.tailFace ?? getMarqueeStyle();
		const share = tail.length > 0 && text.length > 0;
		let tailW = 0;
		let tailH = 0;
		if (tail) {
			const measuredTail = port.measureString(tail, tailFace);
			tailW = measuredTail.width;
			tailH = measuredTail.height;
		}
		const bodyW = share ? Math.max(1, width - TAIL_PAD - tailW - TAIL_GAP) : width;
		if (text) {
			const face = this.fontFace ?? getMarqueeStyle();
			const measured = port.measureString(text, face);
			const textW = measured.width;
			const maxScroll = textW - bodyW;
			const x = maxScroll <= 0
				? Math.floor((bodyW - textW) / 2)
				: -Math.floor(this.offset);
			const y = Math.max(0, Math.floor((height - measured.height) / 2));
			const drawW = Math.max(textW, bodyW);
			port.drawString(text, face, this.color, x, y, drawW);
		}
		if (share) {
			const tailX = width - TAIL_PAD - tailW;
			port.fillColor(BG, bodyW, 0, width - bodyW, height);
			const y = Math.max(0, Math.floor((height - tailH) / 2));
			port.drawString(tail, tailFace, this.color, tailX, y, Math.max(tailW, 1));
		}
		else if (tail) {
			const x = tailW >= width ? 0 : Math.floor((width - tailW) / 2);
			const y = Math.max(0, Math.floor((height - tailH) / 2));
			port.drawString(tail, tailFace, this.color, x, y, Math.max(tailW, width));
		}
		if (height > 36 || width <= 24)
			return;
		const rule = width - 20;
		port.fillColor(MID, 10, 1, rule, 1);
		port.fillColor(MID, 10, height - 2, rule, 1);
	}
}
