/*
	Mount onboard microSD as a USB disk. Eject on the host before Fn+BS.
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
import { start as mscStart, stop as mscStop, status as mscStatus } from "msc";
import { Power } from "power";
import { acceptStroke, titleWithPower } from "session";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asUsb } from "view";

type Mode = "usb" | "help";

export class AppBehavior extends Behavior {
	mode: Mode = "usb";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	helpIndex = 0;
	hostEnterDown = false;
	line = "正在挂载…";
	note = "";
	ready = false;
	leaving = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.power = new Power("blank");
		this.paint(app);
		Timer.set(() => this.mount(app), 1);
	}

	mount(app: AppHost) {
		const err = mscStart();
		if (err) {
			this.ready = false;
			this.line = err;
			this.note = "检查卡后重开本应用";
		}
		else {
			this.ready = true;
			const st = mscStatus();
			const mb = st.sectors && st.sectorSize
				? Math.round((st.sectors * st.sectorSize) / (1024 * 1024))
				: 0;
			this.line = "电脑可打开此卡 · 用完先弹出";
			this.note = mb > 0 ? mb + "MB · Fn+BS 退出" : "Fn+BS 退出";
		}
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.paint(app);
	}

	onKeyboardTick(app: AppHost) {
		if (this.leaving)
			return;
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		if (stroke)
			this.handleStroke(app, stroke);
	}

	onKeyDown(content: unknown, key: string) {
		if (this.leaving)
			return;
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
			this.leave();
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
				this.mode = "usb";
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0) {
				this.helpIndex += dir;
				this.paint(app);
			}
		}
	}

	leave() {
		if (this.leaving)
			return;
		this.leaving = true;
		mscStop();
		bootLauncher();
	}

	paint(app: AppHost) {
		const face = contentByName(app, "usbPort");
		const list = contentByName(app, "listPort");
		if (this.mode === "help") {
			setVisibleProp(face, false);
			setVisibleProp(list, true);
			const view = asMenu(list);
			if (!view)
				return;
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
			const title = this.power
				? titleWithPower(this.power, `${helpTitle()} ${start + 1}/${n}`)
				: `${helpTitle()} ${start + 1}/${n}`;
			view.setList(list, title, lines, "");
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(face, true);
		const view = asUsb(face);
		if (!view)
			return;
		const title = this.power ? titleWithPower(this.power, "USB 盘") : "USB 盘";
		const banner = this.power?.banner() ?? "";
		const note = banner ? (this.note ? banner + " " + this.note : banner) : this.note;
		view.setFrame(face, title, this.line, note);
	}
}
