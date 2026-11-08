/*
	US QWERTY HID reports for the Cardputer matrix.
	The host's layout decides the glyph. Shift is a modifier bit, not a second usage.
	Enter (0x28), Backspace (0x2a), and Tab (0x2b) match the matrix codes in shared/keyboard.ts.
*/

export type HeldState = {
	keys: { code: string | number }[];
	fn: boolean;
	shift: boolean;
	ctrl: boolean;
	alt: boolean;
	opt: boolean;
};

export const EMPTY: HeldState = Object.freeze({
	keys: Object.freeze([] as { code: string | number }[]),
	fn: false,
	shift: false,
	ctrl: false,
	alt: false,
	opt: false,
}, true) as HeldState;

export const DEVICE_NAME = "CADV KB";

const CODE_ENTER = 0x28;
const CODE_BACKSPACE = 0x2a;
const CODE_TAB = 0x2b;

const HID_ESC = 0x29;
const HID_F1 = 0x3a;
const HID_HOME = 0x4a;
const HID_PAGE_UP = 0x4b;
const HID_DELETE = 0x4c;
const HID_END = 0x4d;
const HID_PAGE_DOWN = 0x4e;
const HID_RIGHT = 0x4f;
const HID_LEFT = 0x50;
const HID_DOWN = 0x51;
const HID_UP = 0x52;

/** Fn layer. Unlisted keys are swallowed while Fn is held. */
const FN: Record<string, number | "help"> = Object.freeze({
	"`": HID_ESC,
	"1": HID_F1,
	"2": HID_F1 + 1,
	"3": HID_F1 + 2,
	"4": HID_F1 + 3,
	"5": HID_F1 + 4,
	"6": HID_F1 + 5,
	"7": HID_F1 + 6,
	"8": HID_F1 + 7,
	"9": HID_F1 + 8,
	"0": HID_F1 + 9,
	"-": HID_F1 + 10,
	"=": HID_F1 + 11,
	h: HID_LEFT,
	j: HID_DOWN,
	k: HID_UP,
	l: HID_RIGHT,
	u: HID_HOME,
	i: HID_PAGE_UP,
	o: HID_END,
	p: HID_DELETE,
	n: HID_PAGE_DOWN,
	"/": "help",
}) as Record<string, number | "help">;

const SYMBOL: Record<string, number> = Object.freeze({
	"`": 0x35,
	"-": 0x2d,
	"=": 0x2e,
	"[": 0x2f,
	"]": 0x30,
	"\\": 0x31,
	";": 0x33,
	"'": 0x34,
	",": 0x36,
	".": 0x37,
	"/": 0x38,
	" ": 0x2c,
}) as Record<string, number>;

const SHIFTED_SYMBOL: Record<string, string> = Object.freeze({
	"!": "1",
	"@": "2",
	"#": "3",
	"$": "4",
	"%": "5",
	"^": "6",
	"&": "7",
	"*": "8",
	"(": "9",
	")": "0",
	"_": "-",
	"+": "=",
	"~": "`",
	"{": "[",
	"}": "]",
	"|": "\\",
	":": ";",
	"\"": "'",
	"<": ",",
	">": ".",
	"?": "/",
}) as Record<string, string>;

export type LocalAction = "launcher" | "forget" | "help";

export type Edit =
	| { op: "char"; text: string }
	| { op: "backspace" }
	| { op: "flash"; text: string };

export type Layout = {
	report: Uint8Array;
	slots: number[];
	rollover: boolean;
};

function heldCode(state: HeldState, code: string | number): boolean {
	for (let i = 0; i < state.keys.length; i++) {
		if (state.keys[i].code === code)
			return true;
	}
	return false;
}

/** HID usage, a local chord, or null when the key is not sent. */
export function usage(code: string | number, fn: boolean): number | LocalAction | null {
	if (fn && typeof code === "number") {
		if (code === CODE_BACKSPACE)
			return "launcher";
		if (code === CODE_TAB)
			return "forget";
		return null;
	}
	if (fn && typeof code === "string") {
		if (Object.prototype.hasOwnProperty.call(FN, code))
			return FN[code];
		return null;
	}
	if (typeof code === "number") {
		if (code === CODE_ENTER || code === CODE_BACKSPACE || code === CODE_TAB)
			return code;
		return null;
	}
	if (code.length === 1 && code >= "a" && code <= "z")
		return 0x04 + code.charCodeAt(0) - 97;
	if (code.length === 1 && code >= "1" && code <= "9")
		return 0x1e + code.charCodeAt(0) - 49;
	if (code === "0")
		return 0x27;
	return SYMBOL[code] ?? null;
}

export function localAction(prev: HeldState, curr: HeldState): LocalAction | null {
	if (!curr.fn)
		return null;
	let help = false;
	for (let i = 0; i < curr.keys.length; i++) {
		const code = curr.keys[i].code;
		if (heldCode(prev, code))
			continue;
		const u = usage(code, true);
		if (u === "launcher")
			return "launcher";
		if (u === "forget")
			return "forget";
		if (u === "help")
			help = true;
	}
	return help ? "help" : null;
}

/** Rising Backspace, or Fn+` (Esc), closes help. */
export function helpBack(prev: HeldState, curr: HeldState): boolean {
	for (let i = 0; i < curr.keys.length; i++) {
		const code = curr.keys[i].code;
		if (heldCode(prev, code))
			continue;
		if (code === CODE_BACKSPACE && !curr.fn)
			return true;
		if (code === "`" && curr.fn)
			return true;
	}
	return false;
}

/** Rising K/J (and the comma/period aliases). Fn+K/J are the arrow keys, same letters. */
export function helpDir(prev: HeldState, curr: HeldState): -1 | 0 | 1 {
	let dir: -1 | 0 | 1 = 0;
	for (let i = 0; i < curr.keys.length; i++) {
		const code = curr.keys[i].code;
		if (heldCode(prev, code))
			continue;
		if (code === "k" || code === ",")
			dir = -1;
		else if (code === "j" || code === ".")
			dir = 1;
	}
	return dir;
}

function modifierByte(curr: HeldState): number {
	return (curr.ctrl ? 0x01 : 0) |
		(curr.shift ? 0x02 : 0) |
		(curr.alt ? 0x04 : 0) |
		(curr.opt ? 0x08 : 0);
}

/** Boot keyboard report. Slots stay put so a release does not reshuffle the other keys. */
export function layout(curr: HeldState, prevSlots: readonly number[]): Layout {
	const want: number[] = [];
	for (let i = 0; i < curr.keys.length; i++) {
		const u = usage(curr.keys[i].code, curr.fn);
		if (typeof u === "number")
			want.push(u);
	}
	const slots = [0, 0, 0, 0, 0, 0];
	const pending = want.slice();
	for (let i = 0; i < 6; i++) {
		const prev = prevSlots[i] ?? 0;
		if (!prev)
			continue;
		const at = pending.indexOf(prev);
		if (at < 0)
			continue;
		slots[i] = prev;
		pending.splice(at, 1);
	}
	let rollover = false;
	for (let p = 0; p < pending.length; p++) {
		let hole = -1;
		for (let i = 0; i < 6; i++) {
			if (slots[i] === 0) {
				hole = i;
				break;
			}
		}
		if (hole < 0) {
			rollover = true;
			break;
		}
		slots[hole] = pending[p];
	}
	const report = new Uint8Array(8);
	report[0] = modifierByte(curr);
	if (rollover) {
		for (let i = 0; i < 6; i++)
			report[2 + i] = 0x01;
		return { report, slots: [0x01, 0x01, 0x01, 0x01, 0x01, 0x01], rollover: true };
	}
	for (let i = 0; i < 6; i++)
		report[2 + i] = slots[i];
	return { report, slots, rollover: false };
}

function flashName(usageId: number): string | null {
	if (usageId === CODE_ENTER)
		return "Enter";
	if (usageId === CODE_TAB)
		return "Tab";
	if (usageId === HID_ESC)
		return "Esc";
	if (usageId === HID_LEFT)
		return "←";
	if (usageId === HID_DOWN)
		return "↓";
	if (usageId === HID_UP)
		return "↑";
	if (usageId === HID_RIGHT)
		return "→";
	if (usageId === HID_DELETE)
		return "Del";
	if (usageId === HID_HOME)
		return "Home";
	if (usageId === HID_END)
		return "End";
	if (usageId === HID_PAGE_UP)
		return "PgUp";
	if (usageId === HID_PAGE_DOWN)
		return "PgDn";
	if (usageId >= HID_F1 && usageId <= HID_F1 + 11)
		return `F${usageId - HID_F1 + 1}`;
	return null;
}

function symbolChar(usageId: number, shift: boolean): string | null {
	const plain: Record<number, string> = {
		0x2c: " ",
		0x2d: "-",
		0x2e: "=",
		0x2f: "[",
		0x30: "]",
		0x31: "\\",
		0x33: ";",
		0x34: "'",
		0x35: "`",
		0x36: ",",
		0x37: ".",
		0x38: "/",
		0x1e: "1",
		0x1f: "2",
		0x20: "3",
		0x21: "4",
		0x22: "5",
		0x23: "6",
		0x24: "7",
		0x25: "8",
		0x26: "9",
		0x27: "0",
	};
	const shifted: Record<number, string> = {
		0x2c: " ",
		0x2d: "_",
		0x2e: "+",
		0x2f: "{",
		0x30: "}",
		0x31: "|",
		0x33: ":",
		0x34: "\"",
		0x35: "~",
		0x36: "<",
		0x37: ">",
		0x38: "?",
		0x1e: "!",
		0x1f: "@",
		0x20: "#",
		0x21: "$",
		0x22: "%",
		0x23: "^",
		0x24: "&",
		0x25: "*",
		0x26: "(",
		0x27: ")",
	};
	const table = shift ? shifted : plain;
	return table[usageId] ?? null;
}

function editFor(usageId: number, shift: boolean, caps: boolean): Edit | null {
	if (usageId === CODE_BACKSPACE)
		return { op: "backspace" };
	const named = flashName(usageId);
	if (named)
		return { op: "flash", text: named };
	if (usageId >= 0x04 && usageId <= 0x1d) {
		const letter = String.fromCharCode(97 + usageId - 0x04);
		const upper = shift !== caps;
		return { op: "char", text: upper ? letter.toUpperCase() : letter };
	}
	const text = symbolChar(usageId, shift);
	if (text)
		return { op: "char", text };
	return null;
}

/** Echo edits for keys that just went down. */
export function editsFor(prev: HeldState, curr: HeldState, caps: boolean): Edit[] {
	const edits: Edit[] = [];
	for (let i = 0; i < curr.keys.length; i++) {
		const code = curr.keys[i].code;
		if (heldCode(prev, code))
			continue;
		const u = usage(code, curr.fn);
		if (typeof u !== "number")
			continue;
		const edit = editFor(u, curr.shift, caps);
		if (edit)
			edits.push(edit);
	}
	return edits;
}

/** One simulator key, already shifted by the host. */
export function heldFromHostKey(key: string): HeldState | null {
	const state: HeldState = {
		keys: [],
		fn: false,
		shift: false,
		ctrl: false,
		alt: false,
		opt: false,
	};
	if (key === "\r" || key === "\n") {
		state.keys.push({ code: CODE_ENTER });
		return state;
	}
	if (key === "\b" || key === "\u007f") {
		state.keys.push({ code: CODE_BACKSPACE });
		return state;
	}
	if (key === "\u001b") {
		state.fn = true;
		state.keys.push({ code: "`" });
		return state;
	}
	if (key === "\uf700") {
		state.fn = true;
		state.keys.push({ code: "k" });
		return state;
	}
	if (key === "\uf701") {
		state.fn = true;
		state.keys.push({ code: "j" });
		return state;
	}
	if (key === "\uf702") {
		state.fn = true;
		state.keys.push({ code: "h" });
		return state;
	}
	if (key === "\uf703") {
		state.fn = true;
		state.keys.push({ code: "l" });
		return state;
	}
	if (key === "\t") {
		state.keys.push({ code: CODE_TAB });
		return state;
	}
	if (key.length !== 1)
		return null;
	if (key >= "A" && key <= "Z") {
		state.shift = true;
		state.keys.push({ code: key.toLowerCase() });
		return state;
	}
	if (key >= "a" && key <= "z") {
		state.keys.push({ code: key });
		return state;
	}
	const unshifted = SHIFTED_SYMBOL[key];
	if (unshifted) {
		state.shift = true;
		state.keys.push({ code: unshifted });
		return state;
	}
	state.keys.push({ code: key });
	return state;
}
