/*
	Cardputer-Adv keyboard via TCA8418 (I2C 0x34).
	M5Unified In_I2C: SCL=9, SDA=8, INT=11.
*/

import SMBus from "embedded:io/smbus";
import config from "mc/config";

const REG_CFG = 0x01;
const REG_INT_STAT = 0x02;
const REG_KEY_EVENT_A = 0x04;
const REG_KP_GPIO_1 = 0x1d;
const REG_KP_GPIO_2 = 0x1e;
const REG_KP_GPIO_3 = 0x1f;
const REG_GPI_EM_1 = 0x20;
const REG_GPI_EM_2 = 0x21;
const REG_GPI_EM_3 = 0x22;
const REG_GPIO_DIR_1 = 0x23;
const REG_GPIO_DIR_2 = 0x24;
const REG_GPIO_DIR_3 = 0x25;
const REG_GPIO_INT_LVL_1 = 0x26;
const REG_GPIO_INT_LVL_2 = 0x27;
const REG_GPIO_INT_LVL_3 = 0x28;
const REG_GPIO_INT_EN_1 = 0x1a;
const REG_GPIO_INT_EN_2 = 0x1b;
const REG_GPIO_INT_EN_3 = 0x1c;

const KEY_BACKSPACE = 0x2a;
const KEY_ENTER = 0x28;
const KEY_TAB = 0x2b;
const KEY_FN = 0xff;
const KEY_OPT = 0x00;
const KEY_LEFT_CTRL = 0x80;
const KEY_LEFT_SHIFT = 0x81;
const KEY_LEFT_ALT = 0x82;

type KeyCell = { a: string | number; b: string | number };

const KEY_MAP: KeyCell[][] = Object.freeze([
	[
		{ a: "`", b: "~" }, { a: "1", b: "!" }, { a: "2", b: "@" }, { a: "3", b: "#" },
		{ a: "4", b: "$" }, { a: "5", b: "%" }, { a: "6", b: "^" }, { a: "7", b: "&" },
		{ a: "8", b: "*" }, { a: "9", b: "(" }, { a: "0", b: ")" }, { a: "-", b: "_" },
		{ a: "=", b: "+" }, { a: KEY_BACKSPACE, b: KEY_BACKSPACE },
	],
	[
		{ a: KEY_TAB, b: KEY_TAB }, { a: "q", b: "Q" }, { a: "w", b: "W" }, { a: "e", b: "E" },
		{ a: "r", b: "R" }, { a: "t", b: "T" }, { a: "y", b: "Y" }, { a: "u", b: "U" },
		{ a: "i", b: "I" }, { a: "o", b: "O" }, { a: "p", b: "P" }, { a: "[", b: "{" },
		{ a: "]", b: "}" }, { a: "\\", b: "|" },
	],
	[
		{ a: KEY_FN, b: KEY_FN }, { a: KEY_LEFT_SHIFT, b: KEY_LEFT_SHIFT },
		{ a: "a", b: "A" }, { a: "s", b: "S" }, { a: "d", b: "D" }, { a: "f", b: "F" },
		{ a: "g", b: "G" }, { a: "h", b: "H" }, { a: "j", b: "J" }, { a: "k", b: "K" },
		{ a: "l", b: "L" }, { a: ";", b: ":" }, { a: "'", b: "\"" }, { a: KEY_ENTER, b: KEY_ENTER },
	],
	[
		{ a: KEY_LEFT_CTRL, b: KEY_LEFT_CTRL }, { a: KEY_OPT, b: KEY_OPT },
		{ a: KEY_LEFT_ALT, b: KEY_LEFT_ALT }, { a: "z", b: "Z" }, { a: "x", b: "X" },
		{ a: "c", b: "C" }, { a: "v", b: "V" }, { a: "b", b: "B" }, { a: "n", b: "N" },
		{ a: "m", b: "M" }, { a: ",", b: "<" }, { a: ".", b: ">" }, { a: "/", b: "?" },
		{ a: " ", b: " " },
	],
], true) as KeyCell[][];

export type KeyStroke = {
	chars: string[];
	enter: boolean;
	del: boolean;
	shift: boolean;
	/** Cardputer Esc: Fn+` or Ctrl+[ */
	esc: boolean;
	up: boolean;
	down: boolean;
	/** Simulator ←, or Fn+H on the board. */
	left: boolean;
	/** Simulator →, or Fn+L on the board. */
	right: boolean;
	/** Fn is held. Fn+BS returns to the SD launcher. */
	fn: boolean;
	/** Fn+[ dims, Fn+] brightens. */
	bright: -1 | 0 | 1;
	/** Fn+T cycles the firmware theme. T alone stays a letter. */
	theme: boolean;
	/** Fn+Q. The note app draws a short QR. Q alone stays a letter. */
	qr: boolean;
	/** Tab. Typing apps use it to switch modes, since every letter is input. */
	tab: boolean;
};

/** Physical keys currently down. Modifiers are flags, not entries in `keys`. */
export type HeldState = {
	keys: { code: string | number }[];
	fn: boolean;
	shift: boolean;
	ctrl: boolean;
	alt: boolean;
	opt: boolean;
};

const HELD_EMPTY: HeldState = Object.freeze({
	keys: Object.freeze([] as { code: string | number }[]),
	fn: false,
	shift: false,
	ctrl: false,
	alt: false,
	opt: false,
}, true) as HeldState;

type KbConfig = { sda: number; scl: number; address: number };

function readKbConfig(): KbConfig | null {
	const root = config as Record<string, unknown>;
	const kb = root.keyboard;
	if (!kb || typeof kb !== "object")
		return null;
	const o = kb as Record<string, unknown>;
	if (typeof o.sda !== "number" || typeof o.scl !== "number" || typeof o.address !== "number")
		return null;
	return { sda: o.sda, scl: o.scl, address: o.address };
}

function isModifier(code: string | number): boolean {
	return code === KEY_FN || code === KEY_LEFT_SHIFT || code === KEY_LEFT_CTRL || code === KEY_LEFT_ALT || code === KEY_OPT;
}

function pointKey(x: number, y: number): string {
	return `${x},${y}`;
}

export class CardputerKeyboard {
	#bus: SMBus | undefined;
	#pressed = new Map<string, { x: number; y: number }>();
	/** Keys down at the previous poll(); a stroke carries only keys not in here. */
	#prevDown = new Set<string>();
	#heldSig = "";
	#lastHeld: HeldState = HELD_EMPTY;
	#ok = false;
	status = "KB?";

	constructor() {
		const kb = readKbConfig();
		if (!kb) {
			this.status = "KB cfg";
			return;
		}
		try {
			this.#bus = new SMBus({
				hz: 400_000,
				address: kb.address,
				data: kb.sda,
				clock: kb.scl,
			});
			this.#init();
			// Probe: CFG write/read round-trip
			const cfg = this.#bus.readUint8(REG_CFG);
			this.#ok = true;
			this.status = `KB ok ${cfg.toString(16)}`;
		}
		catch (e) {
			this.status = "KB fail";
			try { this.#bus?.close(); } catch { /* */ }
			this.#bus = undefined;
			this.#ok = false;
		}
	}

	get available(): boolean {
		return this.#ok;
	}

	close() {
		this.#bus?.close();
		this.#bus = undefined;
		this.#ok = false;
	}

	poll(): KeyStroke | null {
		if (!this.#bus)
			return null;
		try {
			this.#drainEvents();
		}
		catch {
			return null;
		}
		/*
			One stroke per key press. Building from every key still down made
			rollover typing repeat letters (press b while a is down -> "a","b";
			release a -> "b" again) and re-sent Enter. Releases and lone
			modifiers produce nothing; modifiers still come from the full set.
		*/
		const fresh: { x: number; y: number }[] = [];
		for (const [key, at] of this.#pressed) {
			if (this.#prevDown.has(key))
				continue;
			const cell = KEY_MAP[at.y]?.[at.x];
			if (cell && !isModifier(cell.a))
				fresh.push(at);
		}
		this.#prevDown = new Set(this.#pressed.keys());
		if (!fresh.length)
			return null;
		return this.#buildStroke(fresh);
	}

	/**
	 * Current physical keys, or null if nothing changed.
	 * Separate from poll() so a HID firmware can see modifiers and key-up.
	 */
	pollHeld(): HeldState | null {
		if (!this.#bus)
			return null;
		try {
			this.#drainEvents();
		}
		catch {
			return null;
		}
		const sig = [...this.#pressed.keys()].sort().join("|");
		if (sig === this.#heldSig)
			return null;
		this.#heldSig = sig;
		this.#lastHeld = this.#captureHeld();
		return this.#lastHeld;
	}

	/** Last polled hold. Empty until the first change. */
	get held(): HeldState {
		return this.#lastHeld;
	}

	#init() {
		const bus = this.#bus!;
		bus.writeUint8(REG_GPIO_DIR_1, 0x00);
		bus.writeUint8(REG_GPIO_DIR_2, 0x00);
		bus.writeUint8(REG_GPIO_DIR_3, 0x00);
		bus.writeUint8(REG_GPI_EM_1, 0xff);
		bus.writeUint8(REG_GPI_EM_2, 0xff);
		bus.writeUint8(REG_GPI_EM_3, 0xff);
		bus.writeUint8(REG_GPIO_INT_LVL_1, 0x00);
		bus.writeUint8(REG_GPIO_INT_LVL_2, 0x00);
		bus.writeUint8(REG_GPIO_INT_LVL_3, 0x00);
		bus.writeUint8(REG_GPIO_INT_EN_1, 0xff);
		bus.writeUint8(REG_GPIO_INT_EN_2, 0xff);
		bus.writeUint8(REG_GPIO_INT_EN_3, 0xff);
		bus.writeUint8(REG_KP_GPIO_1, 0x7f);
		bus.writeUint8(REG_KP_GPIO_2, 0xff);
		bus.writeUint8(REG_KP_GPIO_3, 0x00);
		for (let i = 0; i < 16; i++) {
			if (!bus.readUint8(REG_KEY_EVENT_A))
				break;
		}
		bus.writeUint8(REG_INT_STAT, 0x03);
		bus.writeUint8(REG_CFG, 0x80 | 0x10 | 0x20 | 0x01);
	}

	#drainEvents() {
		const bus = this.#bus!;
		for (let i = 0; i < 16; i++) {
			const raw = bus.readUint8(REG_KEY_EVENT_A);
			if (!raw)
				break;
			const press = !!(raw & 0x80);
			const buf = (raw & 0x7f) - 1;
			if (buf < 0)
				continue;
			const row = Math.floor(buf / 10);
			const col = buf % 10;
			let outCol = row * 2;
			if (col > 3)
				outCol += 1;
			const outRow = (col + 4) % 4;
			const key = pointKey(outCol, outRow);
			if (press)
				this.#pressed.set(key, { x: outCol, y: outRow });
			else
				this.#pressed.delete(key);
		}
		bus.writeUint8(REG_INT_STAT, 0x03);
	}

	#buildStroke(fresh: { x: number; y: number }[]): KeyStroke {
		let shift = false;
		const mods = new Set<number>();
		for (const { x, y } of this.#pressed.values()) {
			const cell = KEY_MAP[y]?.[x];
			if (!cell)
				continue;
			const code = cell.a;
			if (typeof code === "number")
				mods.add(code);
			if (code === KEY_LEFT_SHIFT)
				shift = true;
		}

		const chars: string[] = [];
		let enter = false;
		let del = false;
		let esc = false;
		let up = false;
		let down = false;
		let left = false;
		let right = false;
		let bright: -1 | 0 | 1 = 0;
		let theme = false;
		let qr = false;
		let tab = false;
		const fn = mods.has(KEY_FN);
		const ctrl = mods.has(KEY_LEFT_CTRL);
		for (const { x, y } of fresh) {
			const cell = KEY_MAP[y]?.[x];
			if (!cell)
				continue;
			const code = cell.a;
			if (typeof code === "number") {
				if (code === KEY_ENTER)
					enter = true;
				else if (code === KEY_BACKSPACE)
					del = true;
				else if (code === KEY_TAB && !fn)
					tab = true;
				continue;
			}
			// Esc: Fn+` (silk Esc) or Ctrl+[
			if ((fn && code === "`") || (ctrl && code === "[")) {
				esc = true;
				continue;
			}
			// Arrow pad: Fn+H/J/K/L = ←↓↑→. The board has no arrow keys.
			if (fn && code === "h") {
				left = true;
				continue;
			}
			if (fn && code === "j") {
				down = true;
				continue;
			}
			if (fn && code === "k") {
				up = true;
				continue;
			}
			if (fn && code === "l") {
				right = true;
				continue;
			}
			if (fn && code === "[") {
				bright = -1;
				continue;
			}
			if (fn && code === "]") {
				bright = 1;
				continue;
			}
			if (fn && code === "t") {
				theme = true;
				continue;
			}
			if (fn && code === "q") {
				qr = true;
				continue;
			}
			if (fn || ctrl || mods.has(KEY_LEFT_ALT) || mods.has(KEY_OPT))
				continue;
			chars.push(shift ? String(cell.b) : String(cell.a));
		}
		return { chars, enter, del, shift, esc, up, down, left, right, fn, bright, theme, qr, tab };
	}

	#captureHeld(): HeldState {
		let fn = false;
		let shift = false;
		let ctrl = false;
		let alt = false;
		let opt = false;
		const found: { code: string | number; x: number; y: number }[] = [];
		for (const { x, y } of this.#pressed.values()) {
			const cell = KEY_MAP[y]?.[x];
			if (!cell)
				continue;
			const code = cell.a;
			if (code === KEY_FN) {
				fn = true;
				continue;
			}
			if (code === KEY_LEFT_SHIFT) {
				shift = true;
				continue;
			}
			if (code === KEY_LEFT_CTRL) {
				ctrl = true;
				continue;
			}
			if (code === KEY_LEFT_ALT) {
				alt = true;
				continue;
			}
			if (code === KEY_OPT) {
				opt = true;
				continue;
			}
			found.push({ code, x, y });
		}
		found.sort((p, q) => p.y - q.y || p.x - q.x);
		const keys: { code: string | number }[] = [];
		for (let i = 0; i < found.length; i++)
			keys.push({ code: found[i].code });
		return { keys, fn, shift, ctrl, alt, opt };
	}
}
