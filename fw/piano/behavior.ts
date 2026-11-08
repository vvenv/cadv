import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir, volumeDelta } from "keys";
import { MENU_VISIBLE } from "list";
import { asMenu } from "menu-view";
import { Power } from "power";
import { acceptStroke } from "session";
import { ClockSound } from "sound";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asPiano } from "view";

const KEYS = "awsedftgyhuj";
const NAMES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
const FREQ = Object.freeze([262, 277, 294, 311, 330, 349, 370, 392, 415, 440, 466, 494]);

type Mode = "play" | "help";

export class AppBehavior extends Behavior {
	mode: Mode = "play";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	sound: ClockSound | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	volume = VOL_DEFAULT;
	note = "按键";
	/** Semitone of the last key, or -1. */
	key = -1;
	hz = 0;
	helpIndex = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.power = new Power("blank");
		this.sound = new ClockSound();
		this.sound.setVolume(this.volume);
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
				this.mode = "play";
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.helpIndex += dir;
			this.paint(app);
			return;
		}
		const vol = volumeDelta(stroke.chars);
		if (vol !== 0) {
			this.volume = Math.max(VOL_MIN, Math.min(VOL_MAX, this.volume + vol));
			this.sound?.setVolume(this.volume);
		}
		for (const ch of stroke.chars) {
			const at = KEYS.indexOf(ch.toLowerCase());
			if (at < 0)
				continue;
			this.key = at;
			this.note = NAMES[at] + "4";
			this.hz = FREQ[at];
			this.sound?.play([{ hz: FREQ[at], ms: 280 }]);
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
			if (view)
				view.setList(list, helpTitle(), helpPage(helpFor(), this), "");
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(face, true);
		const view = asPiano(face);
		if (!view)
			return;
		view.setKey(face, "琴", this.note, this.hz, this.key, this.volume);
	}
}

function helpPage(rows: { key: string; action: string }[], host: { helpIndex: number }) {
	const n = rows.length;
	const vis = MENU_VISIBLE;
	let start = host.helpIndex;
	const max = n > vis ? n - vis : 0;
	if (start < 0)
		start = 0;
	if (start > max)
		start = max;
	host.helpIndex = start;
	const lines = [];
	for (let i = 0; i < vis; i++) {
		const row = rows[start + i];
		if (row)
			lines.push({ text: row.key, right: row.action, selected: false });
	}
	return lines;
}
