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
const KEY_FN = 0xff;
const KEY_OPT = 0x00;
const KEY_LEFT_CTRL = 0x80;
const KEY_LEFT_SHIFT = 0x81;
const KEY_LEFT_ALT = 0x82;

type KeyCell = { a: string | number; b: string | number };

const KEY_MAP: KeyCell[][] = [
	[
		{ a: "`", b: "~" }, { a: "1", b: "!" }, { a: "2", b: "@" }, { a: "3", b: "#" },
		{ a: "4", b: "$" }, { a: "5", b: "%" }, { a: "6", b: "^" }, { a: "7", b: "&" },
		{ a: "8", b: "*" }, { a: "9", b: "(" }, { a: "0", b: ")" }, { a: "-", b: "_" },
		{ a: "=", b: "+" }, { a: KEY_BACKSPACE, b: KEY_BACKSPACE },
	],
	[
		{ a: 0x2b, b: 0x2b }, { a: "q", b: "Q" }, { a: "w", b: "W" }, { a: "e", b: "E" },
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
];

export type KeyStroke = {
	chars: string[];
	enter: boolean;
	del: boolean;
	shift: boolean;
	/** Cardputer Esc: Fn+` or Ctrl+[ */
	esc: boolean;
};

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

function pointKey(x: number, y: number): string {
	return `${x},${y}`;
}

export class CardputerKeyboard {
	#bus: SMBus | undefined;
	#pressed = new Map<string, { x: number; y: number }>();
	#lastSig = "";
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
		const sig = [...this.#pressed.keys()].sort().join("|");
		if (sig === this.#lastSig)
			return null;
		this.#lastSig = sig;
		return this.#buildStroke();
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

	#buildStroke(): KeyStroke {
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
		const fn = mods.has(KEY_FN);
		const ctrl = mods.has(KEY_LEFT_CTRL);
		for (const { x, y } of this.#pressed.values()) {
			const cell = KEY_MAP[y]?.[x];
			if (!cell)
				continue;
			const code = cell.a;
			if (typeof code === "number") {
				if (code === KEY_ENTER)
					enter = true;
				else if (code === KEY_BACKSPACE)
					del = true;
				continue;
			}
			// Esc layer: Fn+` (silk Esc) or Ctrl+[
			if ((fn && code === "`") || (ctrl && code === "[")) {
				esc = true;
				continue;
			}
			if (fn || ctrl || mods.has(KEY_LEFT_ALT) || mods.has(KEY_OPT))
				continue;
			chars.push(shift ? String(cell.b) : String(cell.a));
		}
		return { chars, enter, del, shift, esc };
	}
}
