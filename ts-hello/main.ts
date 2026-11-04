/*
	Cardputer-Adv Moddable + TypeScript hello.
	Clock: classic 7-segment, Beijing time (UTC+8 / CST).
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";

// Beijing = UTC+8, no DST (format via UTC getters so host TZ cannot skew)
const BEIJING_OFFSET_SEC = 8 * 3600;

const backgroundSkin = new Skin({ fill: "black" });
const titleStyle = new Style({ font: "16px Open Sans", color: "white", horizontal: "center", vertical: "middle" });
const subStyle = new Style({ font: "16px Open Sans", color: "#888888", horizontal: "center", vertical: "middle" });

const ON = "#39FF14";
const OFF = "#143214";

// bit7=a,6=b,5=c,4=d,3=e,2=f,1=g  (classic 7-seg)
const SEG: number[] = [
	0b1111110, // 0
	0b0110000, // 1
	0b1101101, // 2
	0b1111001, // 3
	0b0110011, // 4
	0b1011011, // 5
	0b1011111, // 6
	0b1110000, // 7
	0b1111111, // 8
	0b1111011, // 9
];

function pad2(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

/** Wall clock in Beijing time (UTC+8), independent of host TZ quirks. */
function formatNow(): string {
	const ms = Date.now() + BEIJING_OFFSET_SEC * 1000;
	const d = new Date(ms);
	return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function hbar(port: PortContent, x: number, y: number, w: number, t: number, on: boolean) {
	port.fillColor(on ? ON : OFF, x + t, y, w - 2 * t, t);
}

function vbar(port: PortContent, x: number, y: number, h: number, t: number, on: boolean) {
	port.fillColor(on ? ON : OFF, x, y + t, t, h - 2 * t);
}

function drawDigit(port: PortContent, x: number, y: number, w: number, h: number, digit: number) {
	const t = Math.max(3, Math.floor(Math.min(w, h) / 8));
	const mid = y + Math.floor((h - t) / 2);
	const mask = SEG[digit] | 0;
	hbar(port, x, y, w, t, !!(mask & 0b1000000));                 // a
	vbar(port, x + w - t, y, mid - y + t, t, !!(mask & 0b0100000)); // b
	vbar(port, x + w - t, mid, y + h - mid, t, !!(mask & 0b0010000)); // c
	hbar(port, x, y + h - t, w, t, !!(mask & 0b0001000));           // d
	vbar(port, x, mid, y + h - mid, t, !!(mask & 0b0000100));       // e
	vbar(port, x, y, mid - y + t, t, !!(mask & 0b0000010));         // f
	hbar(port, x, mid, w, t, !!(mask & 0b0000001));                 // g
}

function drawColon(port: PortContent, x: number, y: number, w: number, h: number, on: boolean) {
	const s = Math.max(3, Math.floor(Math.min(w, h) / 7));
	const cx = x + Math.floor((w - s) / 2);
	port.fillColor(on ? ON : OFF, cx, y + Math.floor(h * 0.28), s, s);
	port.fillColor(on ? ON : OFF, cx, y + Math.floor(h * 0.62), s, s);
}

class SevenSegBehavior extends Behavior {
	string: string = "--:--:--";
	blink: boolean = true;

	onDisplaying(port: PortContent) {
		this.string = formatNow();
		this.blink = true;
		port.interval = 500;
		port.start();
		port.invalidate();
	}
	onTimeChanged(port: PortContent) {
		this.blink = !this.blink;
		this.string = formatNow();
		port.invalidate();
	}
	onDraw(port: PortContent) {
		const text = this.string;
		const n = text.length; // "HH:MM:SS" → 8
		const gap = 4;
		const colonW = 10;
		let units = 0;
		for (let i = 0; i < n; i++)
			units += text.charAt(i) === ":" ? colonW : 28;
		units += gap * (n - 1);
		let x = Math.floor((port.width - units) / 2);
		const y = 4;
		const digitH = port.height - 8;
		const digitW = 28;
		for (let i = 0; i < n; i++) {
			const ch = text.charAt(i);
			if (ch === ":") {
				drawColon(port, x, y, colonW, digitH, this.blink);
				x += colonW + gap;
			}
			else {
				const d = ch.charCodeAt(0) - 48;
				drawDigit(port, x, y, digitW, digitH, (d >= 0 && d <= 9) ? d : 8);
				x += digitW + gap;
			}
		}
	}
}

const HelloApplication = Application.template($ => ({
	skin: backgroundSkin,
	contents: [
		Label($, {
			left: 0, right: 0, top: 2, height: 18,
			style: titleStyle,
			string: "Cardputer-Adv",
		}),
		Port($, {
			left: 0, right: 0, top: 24, bottom: 22,
			Behavior: SevenSegBehavior,
		}),
		Label($, {
			left: 0, right: 0, bottom: 2, height: 18,
			style: subStyle,
			string: "Beijing UTC+8",
		}),
	],
}));

export default new HelloApplication(null, { displayListLength: 4096, touchCount: 0 });
