/*
	Forward the matrix as a BLE HID keyboard.
	Fn+BS returns to the launcher. Fn+/ opens help. Fn+Tab forgets bonds.
	Every other key is sent. The simulator has no radio; it only echoes.
*/

import {} from "piu/MC";
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
import { MENU_VISIBLE } from "list";
import { asMenu } from "menu-view";
import { contentByName, setStringProp, setVisibleProp, type AppHost } from "ui";
import { openRadio, type KeyboardRadio, type LinkState } from "radio";

type Mode = "type" | "help";

const FLASH_MS = 450;
const ZERO_SLOTS = [0, 0, 0, 0, 0, 0];

function tail(text: string): string {
	const n = 18;
	if (text.length <= n)
		return text;
	return text.slice(text.length - n);
}

function zeroReport(): Uint8Array {
	return new Uint8Array(8);
}

export class AppBehavior extends Behavior {
	mode: Mode = "type";
	kb: CardputerKeyboard | null = null;
	radio: KeyboardRadio | null = null;
	kbTimer: unknown = null;
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
		const curr = kb.pollHeld();
		if (!curr)
			return;
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
		setStringProp(contentByName(app, "statusLabel"), "配对已清除");
		setStringProp(contentByName(app, "echoLabel"), "对方也要忘掉");
		setStringProp(contentByName(app, "hintLabel"), DEVICE_NAME);
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

	paint(app: AppHost) {
		if (this.mode === "help")
			return;
		setStringProp(contentByName(app, "statusLabel"), this.statusLine());
		setStringProp(contentByName(app, "echoLabel"), this.echoLine());
		setStringProp(contentByName(app, "hintLabel"), this.hintLine());
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
			return tail(this.echo);
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
