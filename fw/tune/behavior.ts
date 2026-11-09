import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir } from "keys";
import { helpList } from "help-ui";
import { asMenu } from "menu-view";
import { openMic, type MicFeed } from "mic";
import { fundamental, noteName } from "pitch";
import { Power } from "power";
import { acceptStroke } from "session";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asTune } from "view";

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
	name = "听";
	cents: number | null = null;
	hz = 0;
	measured = 0;
	helpIndex = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.power = new Power("blank");
		this.mic = openMic(pcm => this.push(pcm));
		this.name = this.mic ? "听" : "无麦克风";
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
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(app);
		if (stroke)
			this.handleStroke(app, stroke);
		else if (this.mode === "tune")
			this.paint(app);
	}

	measure() {
		const freq = fundamental(this.buf, RATE);
		const note = noteName(freq);
		if (!note) {
			this.name = "无声";
			this.cents = null;
			this.hz = 0;
			return;
		}
		this.name = note.name;
		this.cents = note.cents;
		this.hz = Math.round(freq);
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
			try { this.mic?.close(); } catch { /* */ }
			bootLauncher();
			return;
		}
		if (isHelp(stroke) && this.mode !== "help") {
			this.helpIndex = 0;
			this.mode = "help";
		}
		else if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke))
				this.mode = "tune";
			else {
				const dir = navDir(stroke);
				if (dir !== 0)
					this.helpIndex += dir;
			}
		}
		this.paint(app);
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
		const view = asTune(face);
		if (!view)
			return;
		view.setTune(face, "调音", this.name, this.cents, this.hz);
	}
}
