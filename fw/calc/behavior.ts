/*
	Four operations, hex, a few unit conversions, and a random string.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir } from "keys";
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
		if (isHelp(stroke) && this.mode !== "help") {
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
		let op = "";
		for (const ch of stroke.chars) {
			const c = ch.toLowerCase();
			if (c >= "0" && c <= "9" || (this.hex && c >= "a" && c <= "f")) {
				if (this.fresh)
					this.entry = "";
				this.fresh = false;
				this.unit = -1;
				if (this.entry.length < 12)
					this.entry += c;
			}
			else if (c === "." && !this.hex && this.entry.indexOf(".") < 0) {
				this.entry += this.entry.length ? "." : "0.";
				this.fresh = false;
			}
			else if (c === "%") {
				this.entry = String(this.read() / 100);
				this.fresh = true;
			}
			else if (c === "n")
				this.negate();
			else if (c === "h") {
				this.hex = !this.hex;
				this.entry = "";
				this.fresh = true;
			}
			else if (c === "u") {
				this.unit = (this.unit + 1) % UNITS.length;
				this.fresh = true;
			}
			else if (c === "g")
				this.random();
			else if (c === "c")
				this.clear();
			else if (c === "+" || c === "-" || c === "*" || c === "/" || c === "x")
				op = c === "x" ? "*" : c;
		}
		if (op)
			this.pushOp(op);
		if (isConfirm(stroke))
			this.equals();
		this.paint(app);
	}

	read(): number {
		if (!this.entry.length)
			return this.acc;
		if (this.hex)
			return parseInt(this.entry, 16);
		return parseFloat(this.entry);
	}

	negate() {
		if (this.entry.length && this.entry !== "0") {
			this.entry = this.entry.startsWith("-") ? this.entry.slice(1) : "-" + this.entry;
			return;
		}
		this.acc = -this.acc;
		this.fresh = true;
	}

	pushOp(next: string) {
		this.equals();
		this.op = next;
		this.fresh = true;
		this.entry = "";
	}

	equals() {
		if (!this.op) {
			if (this.entry.length) {
				this.acc = this.read();
				this.entry = "";
				this.fresh = true;
			}
			return;
		}
		const b = this.read();
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
	}

	clear() {
		this.acc = 0;
		this.entry = "";
		this.op = "";
		this.fresh = false;
		this.unit = -1;
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
	}

	shown(): string {
		if (this.unit >= 0) {
			const n = this.read();
			const out = UNITS[this.unit].run(n);
			return UNITS[this.unit].name + " " + trim(out);
		}
		if (this.entry.length && !this.fresh)
			return this.entry;
		if (this.entry.length && this.randomShown())
			return this.entry;
		if (this.hex)
			return "0x" + (this.acc | 0).toString(16).toUpperCase();
		if (this.acc !== this.acc)
			return "不能除";
		return trim(this.acc);
	}

	randomShown(): boolean {
		return this.entry.length > 0 && this.entry.charCodeAt(0) > 57 && !this.hex;
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
		const title = this.power ? titleWithPower(this.power, this.op || "计算") : (this.op || "计算");
		view.setList(port, title, [{ text: this.shown(), selected: true }], "");
	}
}

function trim(n: number): string {
	if (n !== n)
		return "不能除";
	const text = n.toFixed(6);
	let end = text.length;
	while (end > 0 && text.charAt(end - 1) === "0")
		end--;
	if (end > 0 && text.charAt(end - 1) === ".")
		end--;
	return text.slice(0, end) || "0";
}
