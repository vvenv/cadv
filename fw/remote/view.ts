/*
	Remote face: brand in the title, the last key sent in the middle with
	its protocol code, and a two-line key hint at the bottom.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph, fillDisk } from "draw";
import { AMBER, BG, DIM, FONT_UI, INK, MID, ON, type Glyph } from "ink";
import { rowOrigin, rowTextY, ROW_PITCH } from "list";
import { themeGeneration } from "theme";

export type RemoteState = {
	title: string;
	right: string;
	last: string;
	code: string;
	note: string;
	sending: boolean;
	mark: Glyph;
	level: number;
};

const HINT_1 = "P电源 M静音 I信号源";
const HINT_2 = "-= 音量  [] 频道  Tab";

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

export function asRemote(target: unknown): RemoteBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: RemoteBehavior }).behavior;
	return b && typeof b.setState === "function" ? b : null;
}

function same(a: RemoteState, b: RemoteState): boolean {
	return a.title === b.title && a.right === b.right && a.last === b.last && a.code === b.code
		&& a.note === b.note && a.sending === b.sending && a.mark === b.mark && a.level === b.level;
}

/** Three arcs of an IR "beam" to the right of (cx, cy). Lit while sending. */
function drawBeam(port: PortContent, cx: number, cy: number, lit: boolean) {
	fillDisk(port, cx, cy, 5, lit ? ON : MID);
	for (let i = 1; i <= 3; i++) {
		const r = 6 + i * 6;
		const color = lit ? ON : DIM;
		/* Right half of a ring, drawn as short vertical runs. */
		for (let dy = -r; dy <= r; dy++) {
			const rr = r * r - dy * dy;
			if (rr < 0 || Math.abs(dy) > r * 0.7)
				continue;
			const x = Math.floor(Math.sqrt(rr));
			port.fillColor(color, cx + x, cy + dy, 2, 1);
		}
	}
}

export class RemoteBehavior extends Behavior {
	state: RemoteState = { title: "", right: "", last: "", code: "", note: "", sending: false, mark: "", level: 0 };
	gen = -1;

	setState(port: unknown, next: RemoteState) {
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
		const rw = port.measureString(s.right, st).width;
		port.drawString(s.right, st, MID, width - 6 - rw, rowTextY(0), rw + 2);
		port.drawString(s.title, st, ON, tx, rowTextY(0), Math.max(1, width - tx - rw - 12));

		/* Middle: beam icon, last key, code (or a note). */
		const midY = ROW_PITCH + 30;
		drawBeam(port, 30, midY, s.sending);
		const label = s.last || "按键发送";
		const lw = port.measureString(label, st).width;
		port.drawString(label, st, s.last ? (s.sending ? ON : INK) : MID, 72, midY - 16, Math.min(lw + 2, width - 80));
		const sub = s.note || s.code;
		if (sub)
			port.drawString(sub, st, s.note ? AMBER : MID, 72, midY + 6, width - 80);

		const h1 = port.measureString(HINT_1, st).width;
		const h2 = port.measureString(HINT_2, st).width;
		port.drawString(HINT_1, st, MID, Math.max(4, Math.floor((width - h1) / 2)), rowTextY(4) + 2, width - 8);
		port.drawString(HINT_2, st, MID, Math.max(4, Math.floor((width - h2) / 2)), rowTextY(5), width - 8);
	}
}
