/*
	When an ILI9341 is detected on the EXT header, Piu targets that panel
	and the built-in 240×135 screen becomes a status strip: the running
	app, battery, uptime, heap, and backlight step.
*/

import Timer from "timer";
import { batteryLabel } from "battery";
import { BG, INK, ON } from "ink";
import { paintDeck, takePanel, panelStats, type PanelOut } from "panel";
import { boundFirmware, watchTheme } from "theme";

const NAMES: Record<string, string> = Object.freeze({
	base: "基座",
	calc: "计算",
	clock: "时钟",
	count: "计数",
	db: "分贝",
	dice: "骰子",
	dict: "查词",
	game: "游戏",
	info: "设备",
	kb: "键盘",
	level: "水平",
	metro: "节拍",
	morse: "摩斯",
	noise: "助眠",
	note: "记事",
	piano: "钢琴",
	rec: "录音",
	remote: "遥控",
	repl: "JS",
	scan: "扫描",
	step: "计步",
	timer: "计时",
	tune: "调音",
	type: "打字",
	usb: "优盘",
	words: "拼写",
});

type Builtin = {
	width: number;
	height: number;
	begin(x: number, y: number, w: number, h: number): void;
	send(pixels: Uint16Array): void;
	end(): void;
};

type IdleHost = { onIdle?: () => void };

let started = false;
let active = false;
let builtin: Builtin | null = null;
let battMv = -2;
let bright = -1;
let last = "";
let pulse: ReturnType<typeof Timer.repeat> | null = null;

function css565(color: string): number {
	let hex = "FFFFFF";
	if (color === "black")
		hex = "000000";
	else if (color === "white")
		hex = "FFFFFF";
	else if (color.length === 7 && color.charAt(0) === "#")
		hex = color.slice(1);
	const n = parseInt(hex, 16);
	if (n !== n)
		return 0xFFFF;
	const r = (n >> 16) & 255;
	const g = (n >> 8) & 255;
	const b = n & 255;
	return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

function qty(bytes: number): string {
	if (!(bytes > 0))
		return "0KB";
	if (bytes >= 1024 * 1024) {
		const tenths = Math.round((bytes / (1024 * 1024)) * 10);
		return Math.floor(tenths / 10) + "." + (tenths % 10) + "MB";
	}
	return Math.round(bytes / 1024) + "KB";
}

function uptime(sec: number): string {
	if (sec < 0 || sec !== sec)
		sec = 0;
	sec = Math.floor(sec);
	const s = sec % 60;
	const m = Math.floor(sec / 60) % 60;
	const h = Math.floor(sec / 3600);
	const pad = (n: number) => (n < 10 ? "0" + n : String(n));
	if (h >= 100) {
		const d = Math.floor(h / 24);
		return d + "d" + pad(h % 24) + ":" + pad(m);
	}
	return h + ":" + pad(m) + ":" + pad(s);
}

function appName(): string {
	const id = boundFirmware();
	if (!id)
		return "CADV";
	return NAMES[id] || id;
}

function statusText(): string {
	const parts = panelStats().split("\t");
	const up = Number(parts[0]);
	const free = Number(parts[1]);
	const total = Number(parts[2]);
	const mem = total > 0 ? qty(free) + "/" + qty(total) : qty(free);
	const level = bright > 0 ? String(bright) : "-";
	return [
		appName(),
		"电池\t" + batteryLabel(battMv),
		"运行\t" + uptime(up),
		"内存\t" + mem,
		"亮度\t" + level,
	].join("\n");
}

function paint() {
	const screen = builtin;
	if (!active || !screen)
		return;
	const bg = css565(BG);
	const ink = css565(INK);
	const accent = css565(ON);
	const text = statusText();
	const sig = bg + ":" + ink + ":" + accent + "\n" + text;
	if (sig === last)
		return;
	last = sig;
	try {
		paintDeck(screen, screen.width, screen.height, bg, ink, accent, text);
	}
	catch {
		last = "";
	}
}

/** Battery millivolts and backlight step 1..4, from Power. */
export function deckPower(mv: number, step: number) {
	if (mv === battMv && step === bright)
		return;
	battMv = mv;
	bright = step;
	paint();
}

function wrap(ext: PanelOut) {
	let ctx: IdleHost | undefined;
	let timer: ReturnType<typeof Timer.set> | undefined;
	return {
		get width() { return ext.width; },
		get height() { return ext.height; },
		get pixelFormat() { return ext.pixelFormat; },
		get async() { return ext.async; },
		get c_dispatch() { return ext.c_dispatch; },
		begin(x: number, y: number, w: number, h: number) { ext.begin(x, y, w, h); },
		send(pixels: Uint16Array, offset?: number, count?: number) { ext.send(pixels, offset, count); },
		end() { ext.end(); },
		continue() {},
		adaptInvalid(rect?: object) { ext.adaptInvalid?.(rect); },
		pixelsToBytes(count: number) { return ext.pixelsToBytes(count); },
		clear() {},
		animateColors() { return false; },
		set context(value: IdleHost | undefined) {
			if (!value) {
				if (timer) {
					Timer.clear(timer);
					timer = undefined;
				}
				ctx = undefined;
				return;
			}
			ctx = value;
			if (timer)
				return;
			timer = Timer.set(() => {
				ctx?.onIdle?.();
			}, 1, 100);
			Timer.schedule(timer);
		},
		get context() { return ctx; },
		start(interval: number) {
			if (!timer)
				return;
			if (interval < 5)
				interval = 5;
			Timer.schedule(timer, interval, interval);
		},
		stop() {
			if (!timer)
				return;
			Timer.schedule(timer);
		},
	};
}

export function startDeck() {
	if (started)
		return;
	const root = globalThis as { screen?: Builtin };
	const current = root.screen;
	if (!current || typeof current.begin !== "function" || typeof current.width !== "number")
		return;
	const ext = takePanel();
	if (!ext)
		return;
	started = true;
	builtin = current;
	active = true;
	root.screen = wrap(ext) as unknown as Builtin;
	watchTheme(() => paint());
	paint();
	pulse = Timer.repeat(() => paint(), 1000);
}
