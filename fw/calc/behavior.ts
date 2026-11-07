/*
	Keycaps are the operations. / divides (? opens help), = equals, BS deletes.
	The line above the green number is the expression still in progress.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isLauncher, navDir } from "keys";
import { MENU_VISIBLE } from "list";
import { asMenu } from "menu-view";
import { Power } from "power";
import { acceptStroke, titleWithPower } from "session";
import { contentByName, type AppHost } from "ui";

type Mode = "calc" | "help";

const UNITS: { name: string; run: (n: number) => number }[] = [
	{ name: "℃→℉", run: n => n * 9 / 5 + 32 },
	{ name: "℉→℃", run: n => (n - 32) * 5 / 9 },
	{ name: "km→mi", run: n => n * 0.621371 },
	{ name: "mi→km", run: n => n / 0.621371 },
	{ name: "kg→lb", run: n => n * 2.20462 },
	{ name: "lb→kg", run: n => n / 2.20462 },
];

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class AppBehavior extends Behavior {
	mode: Mode = "calc";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	acc = 0;
	entry = "";
	op = "";
	fresh = false;
	hex = false;
	unit = -1;
	unitBase = 0;
	gen = false;
	/** Last key switched base, so C is still clear for one step. */
	justToggled = false;
	helpIndex = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.power = new Power("blank");
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.paint(app);
	}

	onKeyboardTick(app: AppHost) {
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		if (stroke)
			this.handleStroke(app, stroke);
	}

	onKeyDown(content: unknown, key: string) {
		if (key === "\r" || key === "\n") {
			if (this.hostEnterDown)
				return;
			this.hostEnterDown = true;
		}
		const stroke = hostStroke(key);
		const use = this.power ? acceptStroke(this.power, stroke, true) : stroke;
		if (use)
			this.handleStroke(content as AppHost, use);
	}

	onKeyUp(_content: unknown, key: string) {
		if (key === "\r" || key === "\n")
			this.hostEnterDown = false;
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (isLauncher(stroke)) {
			bootLauncher();
			return;
		}
		if (this.mode !== "help" && isQuestion(stroke)) {
			this.helpIndex = 0;
			this.mode = "help";
			this.paint(app);
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke)) {
				this.mode = "calc";
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.helpIndex += dir;
			this.paint(app);
			return;
		}
		if (stroke.esc) {
			this.clear(false);
			this.paint(app);
			return;
		}
		if (stroke.del) {
			this.backspace();
			this.paint(app);
			return;
		}
		let op = "";
		let eq = isConfirm(stroke);
		for (const ch of stroke.chars) {
			const c = ch.toLowerCase();
			if (c === " " || c === "?")
				continue;
			if (c === "=")
				eq = true;
			else if ((c >= "0" && c <= "9") || this.wantsHexDigit(c))
				this.appendDigit(c);
			else if (c === ".")
				this.appendDot();
			else if (c === "%")
				this.percent();
			else if (c === "n")
				this.negate();
			else if (c === "h")
				this.toggleHex();
			else if (c === "u")
				this.nextUnit();
			else if (c === "g")
				this.random();
			else if (c === "c")
				this.clear(true);
			else if (c === "+" || c === "-" || c === "*" || c === "/" || c === "x")
				op = c === "x" ? "*" : c;
		}
		if (op)
			this.pushOp(op);
		else if (eq)
			this.equals();
		this.paint(app);
	}

	wantsHexDigit(c: string): boolean {
		if (!this.hex || c < "a" || c > "f")
			return false;
		if (this.justToggled && c === "c")
			return false;
		if (this.typing())
			return true;
		return c !== "c";
	}

	typing(): boolean {
		return !this.gen && this.entry.length > 0 && !this.fresh;
	}

	appendDigit(c: string) {
		if (this.fresh || this.unit >= 0 || this.gen)
			this.entry = "";
		this.gen = false;
		this.fresh = false;
		this.unit = -1;
		this.justToggled = false;
		if (this.entry.length < 12)
			this.entry += c;
	}

	appendDot() {
		if (this.hex)
			return;
		if (this.fresh || this.unit >= 0 || this.gen)
			this.entry = "";
		this.gen = false;
		this.fresh = false;
		this.unit = -1;
		this.justToggled = false;
		if (this.entry.indexOf(".") >= 0)
			return;
		if (this.entry === "-")
			this.entry = "-0.";
		else
			this.entry += this.entry.length ? "." : "0.";
	}

	raw(): number {
		if (this.hex) {
			const n = parseInt(this.entry, 16);
			return n === n ? n : 0;
		}
		const n = parseFloat(this.entry);
		return n === n ? n : 0;
	}

	showingNumber(): number {
		if (this.unit >= 0)
			return UNITS[this.unit].run(this.unitBase);
		if (this.typing())
			return this.raw();
		return this.acc;
	}

	hasOperand(): boolean {
		return this.unit >= 0 || this.typing();
	}

	negate() {
		this.justToggled = false;
		if (this.gen) {
			this.gen = false;
			this.entry = "";
			this.fresh = true;
		}
		if (this.unit >= 0) {
			this.unitBase = -this.unitBase;
			return;
		}
		if (this.typing()) {
			if (this.entry.startsWith("-"))
				this.entry = this.entry.slice(1);
			else if (this.entry !== "0")
				this.entry = "-" + this.entry;
			return;
		}
		if (this.op) {
			this.entry = "-";
			this.fresh = false;
			return;
		}
		this.acc = -this.acc;
		this.fresh = true;
		this.entry = "";
		this.justToggled = false;
	}

	pushOp(next: string) {
		if (this.op && !this.hasOperand()) {
			this.op = next;
			this.fresh = true;
			this.entry = "";
			return;
		}
		this.equals();
		this.op = next;
		this.fresh = true;
		this.entry = "";
		this.unit = -1;
		this.justToggled = false;
	}

	equals() {
		if (!this.op) {
			if (this.hasOperand()) {
				this.acc = this.showingNumber();
				this.entry = "";
				this.fresh = true;
				this.unit = -1;
				this.gen = false;
			}
			return;
		}
		if (!this.hasOperand()) {
			this.op = "";
			this.fresh = true;
			return;
		}
		const b = this.showingNumber();
		const a = this.acc;
		let n = a;
		if (this.op === "+")
			n = a + b;
		else if (this.op === "-")
			n = a - b;
		else if (this.op === "*")
			n = a * b;
		else if (this.op === "/")
			n = b === 0 ? Number.NaN : a / b;
		this.acc = n;
		this.op = "";
		this.entry = "";
		this.fresh = true;
		this.unit = -1;
		this.gen = false;
		this.justToggled = false;
	}

	clear(keepHex: boolean) {
		this.acc = 0;
		this.entry = "";
		this.op = "";
		this.fresh = false;
		this.unit = -1;
		this.unitBase = 0;
		this.gen = false;
		this.justToggled = false;
		if (!keepHex)
			this.hex = false;
	}

	backspace() {
		this.justToggled = false;
		if (this.unit >= 0) {
			this.unit = -1;
			return;
		}
		if (this.gen) {
			this.entry = this.entry.slice(0, -1);
			if (!this.entry.length)
				this.gen = false;
			return;
		}
		if (this.typing()) {
			this.entry = this.entry.slice(0, -1);
			if (!this.entry.length && !this.op)
				this.acc = 0;
			return;
		}
		if (this.op) {
			this.op = "";
			this.fresh = true;
			return;
		}
		let text = this.hex ? hexDigits(this.acc) : trim(this.acc);
		if (!text || text === "0" || text === "不能除" || text === "太大") {
			this.acc = 0;
			return;
		}
		text = text.slice(0, -1);
		if (!text) {
			this.acc = 0;
			this.entry = "";
			this.fresh = true;
			return;
		}
		this.entry = text;
		this.fresh = false;
	}

	toggleHex() {
		if (this.gen) {
			this.gen = false;
			this.entry = "";
			this.fresh = true;
		}
		const typing = this.typing();
		const n = this.showingNumber();
		this.unit = -1;
		this.justToggled = false;
		this.hex = !this.hex;
		if (this.op && typing) {
			this.entry = this.hex ? hexDigits(n) : trim(n);
			this.fresh = false;
			this.justToggled = true;
			return;
		}
		this.acc = n;
		this.entry = "";
		this.fresh = true;
	}

	nextUnit() {
		if (this.gen) {
			this.gen = false;
			this.entry = "";
			this.fresh = true;
		}
		if (this.unit < 0) {
			this.unitBase = this.showingNumber();
			this.acc = this.unitBase;
			this.op = "";
			this.entry = "";
		}
		this.unit = (this.unit + 1) % UNITS.length;
		this.hex = false;
		this.fresh = true;
		this.justToggled = false;
	}

	percent() {
		const typing = this.typing();
		const b = typing ? this.raw() : this.showingNumber();
		let part = b / 100;
		if (typing && (this.op === "+" || this.op === "-"))
			part = this.acc * b / 100;
		let n = part;
		if (this.op && typing) {
			const a = this.acc;
			if (this.op === "+")
				n = a + part;
			else if (this.op === "-")
				n = a - part;
			else if (this.op === "*")
				n = a * part;
			else if (this.op === "/")
				n = part === 0 ? Number.NaN : a / part;
		}
		this.acc = n;
		this.op = "";
		this.entry = "";
		this.fresh = true;
		this.unit = -1;
		this.hex = false;
		this.gen = false;
		this.justToggled = false;
	}

	random() {
		let text = "";
		for (let i = 0; i < 8; i++)
			text += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
		this.entry = text;
		this.op = "";
		this.fresh = true;
		this.hex = false;
		this.unit = -1;
		this.gen = true;
		this.justToggled = false;
	}

	contextText(): string {
		if (this.unit >= 0)
			return UNITS[this.unit].name;
		if (this.gen)
			return "随机";
		if (this.op)
			return (this.hex ? hexText(this.acc) : trim(this.acc)) + " " + this.op;
		return "";
	}

	valueText(): string {
		if (this.unit >= 0)
			return trim(UNITS[this.unit].run(this.unitBase));
		if (this.gen)
			return this.entry;
		if (this.typing())
			return this.hex ? this.entry.toUpperCase() : this.entry;
		if (this.hex)
			return hexText(this.acc);
		return trim(this.acc);
	}

	paint(app: AppHost) {
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (!view)
			return;
		if (this.mode === "help") {
			const page = helpFor();
			const n = page.length;
			const vis = MENU_VISIBLE;
			let start = this.helpIndex;
			const max = n > vis ? n - vis : 0;
			if (start < 0)
				start = 0;
			if (start > max)
				start = max;
			this.helpIndex = start;
			const lines = [];
			for (let i = 0; i < vis; i++) {
				const row = page[start + i];
				if (row)
					lines.push({ text: row.key, right: row.action, selected: false });
			}
			const title = this.power ? titleWithPower(this.power, helpTitle()) : helpTitle();
			view.setList(port, title + " " + (start + 1) + "/" + n, lines, "");
			return;
		}
		const name = this.hex ? "十六进制" : "计算";
		const title = this.power ? titleWithPower(this.power, name) : name;
		const context = this.contextText();
		const lines = [];
		if (context)
			lines.push({ text: context, selected: false });
		lines.push({ text: this.valueText(), selected: true });
		view.setList(port, title, lines, "");
	}
}

function isQuestion(stroke: KeyStroke): boolean {
	for (let i = 0; i < stroke.chars.length; i++) {
		if (stroke.chars[i] === "?")
			return true;
	}
	return false;
}

function hexDigits(n: number): string {
	if (n !== n || n === Infinity || n === -Infinity)
		return "0";
	const i = n | 0;
	const body = Math.abs(i).toString(16);
	return i < 0 ? "-" + body : body;
}

function hexText(n: number): string {
	if (n !== n)
		return "不能除";
	if (n === Infinity || n === -Infinity)
		return "太大";
	const i = n | 0;
	const body = Math.abs(i).toString(16).toUpperCase();
	return i < 0 ? "-0x" + body : "0x" + body;
}

function trim(n: number): string {
	if (n !== n)
		return "不能除";
	if (n === Infinity || n === -Infinity || n > 999999999999 || n < -999999999999)
		return "太大";
	if (n === 0)
		return "0";
	const text = n.toFixed(6);
	let end = text.length;
	while (end > 0 && text.charAt(end - 1) === "0")
		end--;
	if (end > 0 && text.charAt(end - 1) === ".")
		end--;
	return text.slice(0, end) || "0";
}
