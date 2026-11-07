import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher } from "keys";
import { asMenu } from "menu-view";
import { openMic, type MicFeed } from "mic";
import { fundamental, noteName } from "pitch";
import { Power } from "power";
import { acceptStroke, titleWithPower } from "session";
import { contentByName, type AppHost } from "ui";

type Mode = "tune" | "help";

const RATE = 16000;
const N = 1024;

export class AppBehavior extends Behavior {
	mode: Mode = "tune";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	mic: MicFeed | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	buf = new Int16Array(N);
	filled = 0;
	line = "听";
	cents = "";
	measured = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.power = new Power("blank");
		this.mic = openMic(pcm => this.push(pcm));
		this.line = this.mic ? "听" : "无麦克风";
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.paint(app);
	}

	push(pcm: Int16Array) {
		for (let i = 0; i < pcm.length; i++) {
			this.buf[this.filled % N] = pcm[i];
			this.filled++;
		}
	}

	onKeyboardTick(app: AppHost) {
		const now = Date.now();
		if (this.filled >= N && now - this.measured >= 200) {
			this.measured = now;
			this.measure();
		}
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		if (stroke)
			this.handleStroke(app, stroke);
		else if (this.mode === "tune")
			this.paint(app);
	}

	measure() {
		const freq = fundamental(this.buf, RATE);
		const note = noteName(freq);
		if (!note) {
			this.line = "无声";
			this.cents = "";
			return;
		}
		const sign = note.cents > 0 ? "+" : "";
		this.line = note.name;
		this.cents = Math.round(freq) + "Hz " + sign + note.cents;
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
			try { this.mic?.close(); } catch { /* */ }
			bootLauncher();
			return;
		}
		if (isHelp(stroke) && this.mode !== "help")
			this.mode = "help";
		else if (this.mode === "help" && (isBack(stroke) || isConfirm(stroke)))
			this.mode = "tune";
		this.paint(app);
	}

	paint(app: AppHost) {
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (!view)
			return;
		if (this.mode === "help") {
			view.setList(port, helpTitle(), helpFor().map(row => ({ text: row.key, right: row.action, selected: false })), "");
			return;
		}
		const title = this.power ? titleWithPower(this.power, "调音") : "调音";
		view.setList(port, title, [
			{ text: this.line, selected: true },
			{ text: this.cents || " ", selected: false },
		], "");
	}
}
