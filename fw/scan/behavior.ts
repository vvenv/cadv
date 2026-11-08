import {} from "piu/MC";
import Timer from "timer";
import WiFi from "embedded:network/interface/wifi";
import { openAir, type Air, type Hit } from "air";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir } from "keys";
import { MENU_VISIBLE, menuStep } from "list";
import { asMenu } from "menu-view";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { noteGlyph } from "ink";
import { contentByName, type AppHost } from "ui";

type Mode = "list" | "help";
type Band = "wifi" | "ble";

export class AppBehavior extends Behavior {
	mode: Mode = "list";
	band: Band = "wifi";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	wifi: InstanceType<typeof WiFi> | null = null;
	air: Air | null = null;
	rows: Hit[] = [];
	index = 0;
	note = "扫描";
	helpIndex = 0;
	scanGen = 0;
	app: AppHost | null = null;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.app = app;
		this.power = new Power("blank");
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.scanWifi();
		this.paint(app);
	}

	onKeyboardTick(app: AppHost) {
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		if (stroke)
			this.handleStroke(app, stroke);
		else if (this.mode === "list")
			this.paint(app);
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
			this.scanGen++;
			this.closeRadios();
			this.power?.lamp("off");
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
			if (isBack(stroke) || isConfirm(stroke))
				this.mode = "list";
			else {
				const dir = navDir(stroke);
				if (dir !== 0)
					this.helpIndex += dir;
			}
			this.paint(app);
			return;
		}
		if (stroke.chars.some(ch => ch === "t" || ch === "T")) {
			this.band = this.band === "wifi" ? "ble" : "wifi";
			this.rows = [];
			this.index = 0;
			if (this.band === "wifi")
				this.scanWifi();
			else
				this.scanBle();
		}
		if (stroke.chars.some(ch => ch === "r" || ch === "R")) {
			this.rows = [];
			if (this.band === "wifi")
				this.scanWifi();
			else
				this.scanBle();
		}
		const dir = navDir(stroke);
		if (dir !== 0 && this.rows.length)
			this.index = menuStep(this.index, this.rows.length, dir);
		this.paint(app);
	}

	scanWifi() {
		const gen = ++this.scanGen;
		this.closeRadios();
		this.note = "无线";
		this.power?.lamp("scan");
		try {
			this.wifi = new WiFi({});
			this.wifi.scan({
				onFound: (hit) => {
					const name = hit.SSID || hit.BSSID || "?";
					const extra = hit.RSSI + " " + hit.channel + " " + hit.security;
					this.upsert({ name, extra });
				},
				onComplete: () => {
					if (gen !== this.scanGen)
						return;
					this.power?.lamp("off");
					this.note = this.rows.length ? "无线" : "没有";
					this.repaint();
				},
			});
		}
		catch {
			this.note = "无无线";
			this.power?.lamp("off");
		}
	}

	scanBle() {
		const gen = ++this.scanGen;
		this.closeRadios();
		this.note = "蓝牙";
		this.power?.lamp("scan");
		this.air = openAir(hit => this.upsert(hit));
		if (!this.air && gen === this.scanGen) {
			this.note = "无蓝牙";
			this.power?.lamp("off");
		}
	}

	upsert(hit: Hit) {
		for (let i = 0; i < this.rows.length; i++) {
			if (this.rows[i].name === hit.name) {
				this.rows[i] = hit;
				this.repaint();
				return;
			}
		}
		if (this.rows.length < 30)
			this.rows.push(hit);
		this.repaint();
	}

	repaint() {
		if (this.app && this.mode === "list")
			this.paint(this.app);
	}

	closeRadios() {
		try { this.wifi?.close(); } catch { /* */ }
		this.wifi = null;
		try { this.air?.close(); } catch { /* */ }
		this.air = null;
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
			view.setList(port, helpTitle() + " " + (start + 1) + "/" + n, lines, "");
			return;
		}
		const title = this.note;
		const g = noteGlyph(this.note).kind ? noteGlyph(this.note) : titleGlyph(this.power);
		const bandGlyph = g.kind || (this.band === "wifi" ? "wifi" : "bt");
		if (!this.rows.length) {
			view.setList(port, title, [{ text: "等待", selected: false }], "", bandGlyph, g.level);
			return;
		}
		const lines = this.rows.map((row, i) => ({
			text: row.name,
			right: row.extra,
			selected: i === this.index,
			glyph: this.band === "wifi" ? "wifi" as const : "bt" as const,
		}));
		view.setList(port, title, lines, "", bandGlyph, g.level);
	}
}
