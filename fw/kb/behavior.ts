/*
	Forward the matrix as a BLE HID keyboard.
	Fn+BS returns to the launcher. Fn+/ opens help. Fn+Tab forgets bonds.
	Every other key is sent. The simulator has no radio; it only echoes.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { CardputerKeyboard } from "keyboard";
import { clearBonds } from "bonds";
import { helpRows, helpTitle } from "help";
import {
	DEVICE_NAME,
	EMPTY,
	editsFor,
	heldFromHostKey,
	helpBack,
	helpDir,
	layout,
	localAction,
	type Edit,
	type HeldState,
} from "hid";
import { INK, ON, noteGlyph } from "ink";
import { MENU_VISIBLE } from "list";
import { asMarquee, MARQUEE_MS, setMarqueeText } from "marquee";
import { asMenu } from "menu-view";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { Power } from "power";
import { openRadio, type KeyboardRadio, type LinkState } from "radio";
import { cycleFwTheme, themeLabel } from "theme";

type Mode = "type" | "help";

const FLASH_MS = 450;
const ZERO_SLOTS = Object.freeze([0, 0, 0, 0, 0, 0]);

function brightDir(held: HeldState): -1 | 0 | 1 {
	if (!held.fn)
		return 0;
	for (let i = 0; i < held.keys.length; i++) {
		const code = held.keys[i].code;
		if (code === "[")
			return -1;
		if (code === "]")
			return 1;
	}
	return 0;
}

function themeHeld(held: HeldState): boolean {
	if (!held.fn)
		return false;
	for (let i = 0; i < held.keys.length; i++) {
		if (held.keys[i].code === "t")
			return true;
	}
	return false;
}

function zeroReport(): Uint8Array {
	return new Uint8Array(8);
}

export class AppBehavior extends Behavior {
	mode: Mode = "type";
	kb: CardputerKeyboard | null = null;
	radio: KeyboardRadio | null = null;
	power: Power | null = null;
	kbTimer: unknown = null;
	marqueeTimer: unknown = null;
	link: LinkState = "wait";
	radioOk = false;
	caps = false;
	echo = "";
	flash = "";
	flashUntil = 0;
	helpIndex = 0;
	prev: HeldState = EMPTY;
	slots: number[] = ZERO_SLOTS.slice();
	report: Uint8Array = zeroReport();
	leaving = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.power = new Power("blank");
		this.kb = new CardputerKeyboard();
		try {
			this.radio = openRadio({
				onStatus: (state) => {
					this.link = state;
					if (state === "ready")
						this.send();
					this.paint(app);
				},
				onCaps: (on) => {
					this.caps = on;
					this.paint(app);
				},
			});
			this.radioOk = true;
		}
		catch {
			this.link = "down";
			this.radioOk = false;
		}
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 10);
		this.marqueeTimer = Timer.repeat(() => this.tickMarquees(app), MARQUEE_MS);
		this.paint(app);
	}

	onKeyboardTick(app: AppHost) {
		if (this.flash && Date.now() >= this.flashUntil) {
			this.flash = "";
			if (this.mode === "type")
				this.paint(app);
		}
		const kb = this.kb;
		if (!kb?.available || this.leaving)
			return;
		this.power?.tick();
		const curr = kb.pollHeld();
		if (!curr)
			return;
		this.power?.activity();
		const prev = this.prev;
		this.prev = curr;
		this.apply(app, prev, curr);
	}

	onKeyDown(content: unknown, key: string) {
		if (this.kb?.available || this.leaving)
			return;
		const app = content as AppHost;
		if (key === "?") {
			if (this.mode === "help")
				this.exitHelp(app);
			else
				this.enterHelp(app);
			return;
		}
		const curr = heldFromHostKey(key);
		if (!curr)
			return;
		this.apply(app, EMPTY, curr);
		if (this.mode === "type" && !this.leaving)
			this.apply(app, curr, EMPTY);
		this.prev = EMPTY;
	}

	apply(app: AppHost, prev: HeldState, curr: HeldState) {
		if (this.leaving)
			return;
		const bright = brightDir(curr);
		if (bright !== 0 && brightDir(prev) === 0) {
			const note = this.power?.bump(bright) ?? "";
			if (note) {
				this.flash = note;
				this.flashUntil = Date.now() + 700;
				this.paint(app);
			}
			return;
		}
		if (themeHeld(curr) && !themeHeld(prev)) {
			const id = cycleFwTheme("kb");
			const note = this.power?.tell("主题 " + themeLabel(id)) ?? ("主题 " + themeLabel(id));
			this.flash = note;
			this.flashUntil = Date.now() + 700;
			this.paint(app);
			return;
		}
		const action = localAction(prev, curr);
		if (action === "launcher") {
			this.releaseHost();
			this.leaving = true;
			bootLauncher();
			return;
		}
		if (action === "forget") {
			this.forget(app);
			return;
		}
		if (action === "help") {
			if (this.mode === "help")
				this.exitHelp(app);
			else {
				this.releaseHost();
				this.enterHelp(app);
			}
			return;
		}
		if (this.mode === "help") {
			if (helpBack(prev, curr)) {
				this.exitHelp(app);
				return;
			}
			const dir = helpDir(prev, curr);
			if (dir !== 0)
				this.scrollHelp(app, dir);
			return;
		}
		const laid = layout(curr, this.slots);
		this.slots = laid.slots;
		this.report = laid.report;
		if (laid.rollover) {
			this.flash = "超6键";
			this.flashUntil = Date.now() + FLASH_MS;
		}
		else
			this.applyEdits(editsFor(prev, curr, this.caps));
		this.send();
		this.paint(app);
	}

	applyEdits(edits: Edit[]) {
		for (let i = 0; i < edits.length; i++) {
			const edit = edits[i];
			if (edit.op === "flash") {
				this.flash = edit.text;
				this.flashUntil = Date.now() + FLASH_MS;
			}
			else if (edit.op === "backspace") {
				this.flash = "";
				this.echo = this.echo.slice(0, -1);
			}
			else {
				this.flash = "";
				this.echo = (this.echo + edit.text).slice(-64);
			}
		}
	}

	releaseHost() {
		this.slots = ZERO_SLOTS.slice();
		this.report = zeroReport();
		this.send();
	}

	send() {
		if (this.link !== "ready")
			return;
		try {
			this.radio?.send(this.report);
		}
		catch {
			this.flash = "没发出去";
			this.flashUntil = Date.now() + FLASH_MS;
		}
	}

	forget(app: AppHost) {
		if (this.leaving)
			return;
		this.releaseHost();
		if (this.link === "sim" || !this.radioOk) {
			this.flash = this.link === "sim" ? "模拟器不能清配对" : "蓝牙没起来";
			this.flashUntil = Date.now() + 1200;
			this.paint(app);
			return;
		}
		this.leaving = true;
		this.mode = "type";
		setVisibleProp(contentByName(app, "listPort"), false);
		this.flash = "";
		this.echo = "";
		setMarqueeText(contentByName(app, "statusLabel"), "配对已清除", undefined, ON, undefined, undefined, "bt");
		setMarqueeText(contentByName(app, "echoLabel"), "对方也要忘掉", undefined, ON, undefined, undefined, "ok");
		setMarqueeText(contentByName(app, "hintLabel"), DEVICE_NAME, undefined, INK);
		Timer.set(() => clearBonds(), 250);
	}

	enterHelp(app: AppHost) {
		if (this.mode === "help")
			return;
		this.mode = "help";
		this.helpIndex = 0;
		setVisibleProp(contentByName(app, "listPort"), true);
		this.paintHelp(app);
	}

	exitHelp(app: AppHost) {
		this.mode = "type";
		setVisibleProp(contentByName(app, "listPort"), false);
		const curr = this.kb?.available ? this.kb.held : EMPTY;
		const laid = layout(curr, ZERO_SLOTS);
		this.slots = laid.slots;
		this.report = laid.report;
		this.send();
		this.paint(app);
	}

	scrollHelp(app: AppHost, dir: -1 | 1) {
		const n = helpRows().length;
		const max = n > MENU_VISIBLE ? n - MENU_VISIBLE : 0;
		let next = this.helpIndex + dir;
		if (next < 0)
			next = 0;
		if (next > max)
			next = max;
		if (next === this.helpIndex)
			return;
		this.helpIndex = next;
		this.paintHelp(app);
	}

	paintHelp(app: AppHost) {
		const page = helpRows();
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
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (view)
			view.setList(port, `${helpTitle()} ${start + 1}/${n}`, lines, "");
	}

	tickMarquees(app: AppHost) {
		if (this.mode !== "type")
			return;
		for (const name of ["statusLabel", "echoLabel", "hintLabel"]) {
			const port = contentByName(app, name);
			const b = asMarquee(port);
			if (b)
				b.tick(port as PortContent);
		}
	}

	paint(app: AppHost) {
		if (this.mode === "help")
			return;
		const status = this.statusLine();
		const echo = this.echoLine();
		let statusG = noteGlyph(status);
		if (!statusG.kind && this.link === "ready")
			statusG = this.caps ? { kind: "caps" } : { kind: "bt" };
		else if (!statusG.kind && (this.link === "link" || this.link === "down"))
			statusG = { kind: this.link === "down" ? "bad" : "bt" };
		const echoG = noteGlyph(echo);
		setMarqueeText(contentByName(app, "statusLabel"), status, undefined, this.statusColor(), undefined, undefined, statusG.kind, statusG.level);
		setMarqueeText(contentByName(app, "echoLabel"), echo, undefined, ON, undefined, undefined, echoG.kind, echoG.level);
		setMarqueeText(contentByName(app, "hintLabel"), this.hintLine(), undefined, INK);
	}

	statusColor(): string {
		if (this.flash && Date.now() < this.flashUntil)
			return ON;
		if (this.link === "ready")
			return ON;
		return INK;
	}

	statusLine(): string {
		if (this.flash && Date.now() < this.flashUntil)
			return this.flash;
		if (this.kb && !this.kb.available && this.link !== "sim")
			return "键盘失败";
		if (this.link === "ready")
			return this.caps ? "已连接  Caps" : "已连接";
		if (this.link === "link")
			return "连接中";
		if (this.link === "sim")
			return "模拟器无蓝牙";
		if (this.link === "down")
			return "蓝牙没起来";
		return "未连接";
	}

	echoLine(): string {
		if (this.echo)
			return this.echo;
		if (this.link === "ready")
			return "可以输入";
		if (this.link === "sim")
			return "桌面按键只在这里显示";
		if (this.link === "link")
			return "正在配对";
		if (this.link === "down")
			return "蓝牙失败";
		return DEVICE_NAME;
	}

	hintLine(): string {
		if (this.link === "ready")
			return "Fn+/ 帮助";
		if (this.link === "sim")
			return "? 帮助";
		return `蓝牙里选 ${DEVICE_NAME}`;
	}
}
