/*
	Bounce-scroll label Port behavior.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, FONT_UI, INK } from "ink";

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

export function asMarquee(target: unknown): MarqueeBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: MarqueeBehavior }).behavior;
	return b && typeof b.setText === "function" && typeof b.tick === "function" ? b : null;
}

export function setMarqueeText(target: unknown, value: string, face?: object, color?: string) {
	const b = asMarquee(target);
	if (b)
		b.setText(target as PortContent, value, face, color);
}

/** Bounce-scroll a single line when it is wider than the port. Ticked by AppBehavior. */
export class MarqueeBehavior extends Behavior {
	string = "";
	textW = 0;
	offset = 0;
	dir = 1;
	holdUntil = 0;
	color = INK;
	fontFace: object | undefined;

	setText(port: PortContent, text: string, face?: object, color?: string) {
		const next = face ?? getMarqueeStyle();
		const ink = color ? color : INK;
		if (text === this.string && next === this.fontFace && ink === this.color)
			return;
		this.string = text;
		this.fontFace = next;
		this.color = ink;
		this.textW = text ? port.measureString(text, next).width : 0;
		this.offset = 0;
		this.dir = 1;
		this.holdUntil = Date.now() + MARQUEE_HOLD_MS;
		port.invalidate();
	}

	tick(port: PortContent) {
		if (!this.string)
			return;
		this.textW = port.measureString(this.string, this.fontFace ?? getMarqueeStyle()).width;
		const maxScroll = this.textW - port.width;
		if (maxScroll <= 0) {
			if (this.offset !== 0) {
				this.offset = 0;
				port.invalidate();
			}
			return;
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
		port.fillColor(BG, 0, 0, port.width, port.height);
		const text = this.string;
		if (!text)
			return;
		const face = this.fontFace ?? getMarqueeStyle();
		const measured = port.measureString(text, face);
		const textW = measured.width;
		const maxScroll = textW - port.width;
		const x = maxScroll <= 0
			? Math.floor((port.width - textW) / 2)
			: -Math.floor(this.offset);
		const y = Math.max(0, Math.floor((port.height - measured.height) / 2));
		const drawW = Math.max(textW, port.width);
		port.drawString(text, face, this.color, x, y, drawW);
	}
}
