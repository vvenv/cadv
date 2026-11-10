/*
	TV remote over the IR LED on GPIO 44. One key, one burst.
	The board LED flashes white on each send, since IR is invisible.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { BRANDS, encode, KEY_LABEL, type Brand, type Key } from "codes";
import { helpFor, helpTitle } from "help";
import { helpList } from "help-ui";
import { irAvailable, irClose, irSend } from "ir";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir } from "keys";
import { asMenu } from "menu-view";
import { pref } from "pref";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asRemote } from "view";

const store = pref("remote");
const IR_PIN = 44;
const FLASH_MS = 120;
/** Gap between brands in the power sweep. */
const SWEEP_GAP_MS = 250;

type Mode = "run" | "help";

/** Key from a stroke, or null. Letters are case-insensitive. */
function keyOf(stroke: KeyStroke): Key | null {
	if (stroke.enter)
		return "ok";
	if (stroke.del || stroke.esc)
		return "back";
	if (stroke.up)
		return "up";
	if (stroke.down)
		return "down";
	if (stroke.left)
		return "left";
	if (stroke.right)
		return "right";
	for (const ch of stroke.chars) {
		const c = ch.toLowerCase();
		if (c === "p")
			return "power";
		if (c === "=" || c === "+")
			return "volUp";
		if (c === "-" || c === "_")
			return "volDown";
		if (c === "]")
			return "chUp";
		if (c === "[")
			return "chDown";
		if (c === "m")
			return "mute";
		if (c === "i")
			return "input";
		if (c === ";")
			return "up";
		if (c === ".")
			return "down";
		if (c === ",")
			return "left";
		if (c === "/")
			return "right";
		if (c === "h")
			return "home";
	}
	return null;
}

export class AppBehavior extends Behavior {
	mode: Mode = "run";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	flashTimer: ReturnType<typeof Timer.set> | null = null;
	sweepTimer: ReturnType<typeof Timer.set> | null = null;
	brand = 0;
	/** RC5 toggle bit: flips on every new press. */
	toggle = false;
	last = "";
	lastCode = "";
	sending = false;
	note = "";
	helpIndex = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		const id = store.getString("brand", BRANDS[0].id);
		for (let i = 0; i < BRANDS.length; i++) {
			if (BRANDS[i].id === id)
				this.brand = i;
		}
		this.power = new Power("blank");
		if (!irAvailable)
			this.note = "无红外";
		this.paint(app);
		Timer.set(() => {
			this.kb = new CardputerKeyboard();
			this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		}, 1);
	}

	onKeyboardTick(app: AppHost) {
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(app);
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
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(content as AppHost);
		if (use)
			this.handleStroke(content as AppHost, use);
	}

	onKeyUp(_content: unknown, key: string) {
		if (key === "\r" || key === "\n")
			this.hostEnterDown = false;
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (isLauncher(stroke)) {
			this.stopSweep();
			try { irClose(); } catch { /* */ }
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
				this.mode = "run";
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.helpIndex += dir;
			this.paint(app);
			return;
		}
		if (stroke.tab) {
			this.stopSweep();
			this.brand = (this.brand + 1) % BRANDS.length;
			this.last = "";
			this.lastCode = "";
			try { store.set("brand", BRANDS[this.brand].id); } catch { /* */ }
			this.paint(app);
			return;
		}
		if (stroke.chars.some(ch => ch === "a" || ch === "A")) {
			this.sweep(app, 0);
			return;
		}
		const key = keyOf(stroke);
		if (!key)
			return;
		this.stopSweep();
		this.toggle = !this.toggle;
		this.send(app, BRANDS[this.brand], key);
	}

	send(app: AppHost, brand: Brand, key: Key): boolean {
		const burst = encode(brand, key, this.toggle);
		this.last = KEY_LABEL[key];
		if (!burst) {
			this.lastCode = "";
			this.note = brand.label + "没有这个键";
			this.paint(app);
			return false;
		}
		this.lastCode = brand.protocol.toUpperCase() + " " + hex(brand.address) + ":" + hex(brand.keys[key] ?? 0);
		this.note = "";
		this.flash(app);
		try {
			irSend(IR_PIN, burst.hz, burst.durations);
		}
		catch (e) {
			this.note = "发送失败";
			trace("ir: " + String(e) + "\n");
		}
		this.paint(app);
		return true;
	}

	/** Power on every brand in turn (all of them toggle, so this also turns sets on). */
	sweep(app: AppHost, index: number) {
		this.stopSweep();
		if (index >= BRANDS.length) {
			this.last = "都发了";
			this.lastCode = "";
			this.paint(app);
			return;
		}
		this.toggle = !this.toggle;
		this.send(app, BRANDS[index], "power");
		this.last = "电源 " + BRANDS[index].label;
		this.paint(app);
		this.sweepTimer = Timer.set(() => {
			this.sweepTimer = null;
			this.sweep(app, index + 1);
		}, SWEEP_GAP_MS);
	}

	stopSweep() {
		if (this.sweepTimer)
			Timer.clear(this.sweepTimer);
		this.sweepTimer = null;
	}

	flash(app: AppHost) {
		this.sending = true;
		this.power?.lamp("flash");
		if (this.flashTimer)
			Timer.clear(this.flashTimer);
		this.flashTimer = Timer.set(() => {
			this.flashTimer = null;
			this.sending = false;
			this.power?.lamp("off");
			this.paint(app);
		}, FLASH_MS);
	}

	paint(app: AppHost) {
		const list = contentByName(app, "listPort");
		const face = contentByName(app, "facePort");
		if (this.mode === "help") {
			setVisibleProp(face, false);
			setVisibleProp(list, true);
			const view = asMenu(list);
			if (view) {
				const page = helpList(helpFor(), this, helpTitle());
				view.setList(list, page.title, page.lines, "");
			}
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(face, true);
		const view = asRemote(face);
		if (!view)
			return;
		const brand = BRANDS[this.brand];
		const g = titleGlyph(this.power, this.note && this.note !== "无红外" ? { kind: "bad" as const } : "");
		view.setState(face, {
			title: "遥控 " + brand.label,
			right: (this.brand + 1) + "/" + BRANDS.length,
			last: this.last,
			code: this.lastCode,
			note: this.note,
			sending: this.sending,
			mark: g.kind,
			level: g.level === undefined ? 0 : g.level,
		});
	}
}

function hex(n: number): string {
	const s = (n & 0xff).toString(16).toUpperCase();
	return s.length < 2 ? "0" + s : s;
}
