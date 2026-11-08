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
import { asSevenSeg } from "sevenseg";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asMetroFooter, asMetroTop } from "view";

type Mode = "run" | "help";

export class AppBehavior extends Behavior {
	mode: Mode = "run";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	sound: ClockSound | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	beatTimer: ReturnType<typeof Timer.repeat> | null = null;
	bpm = 100;
	beats = 4;
	beat = 0;
	volume = VOL_DEFAULT;
	on = false;
	helpIndex = 0;
	hostEnterDown = false;
	app: AppHost | null = null;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.app = app;
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
		const vol = volumeDelta(stroke.chars);
		if (vol !== 0) {
			this.volume = Math.max(VOL_MIN, Math.min(VOL_MAX, this.volume + vol));
			this.sound?.setVolume(this.volume);
		}
		const dir = navDir(stroke);
		if (dir !== 0) {
			this.bpm = Math.max(40, Math.min(240, this.bpm + dir * 4));
			if (this.on)
				this.arm();
		}
		if (stroke.chars.some(ch => ch === "b" || ch === "B"))
			this.beats = this.beats >= 6 ? 2 : this.beats + 1;
		if (isConfirm(stroke)) {
			this.on = !this.on;
			if (this.on)
				this.arm();
			else if (this.beatTimer) {
				Timer.clear(this.beatTimer);
				this.beatTimer = null;
			}
		}
		this.paint(app);
	}

	arm() {
		if (this.beatTimer)
			Timer.clear(this.beatTimer);
		this.beat = 0;
		this.click();
		this.beatTimer = Timer.repeat(() => this.click(), Math.round(60000 / this.bpm));
	}

	click() {
		const accent = this.beat === 0;
		this.sound?.play([{ hz: accent ? 1760 : 880, ms: accent ? 40 : 24 }]);
		this.beat = (this.beat + 1) % this.beats;
		if (this.app && this.mode === "run")
			this.paint(this.app);
	}

	paint(app: AppHost) {
		const list = contentByName(app, "listPort");
		const titlePort = contentByName(app, "titlePort");
		const face = contentByName(app, "facePort");
		const footer = contentByName(app, "footerPort");
		if (this.mode === "help") {
			setVisibleProp(titlePort, false);
			setVisibleProp(face, false);
			setVisibleProp(footer, false);
			setVisibleProp(list, true);
			const view = asMenu(list);
			if (view)
				view.setList(list, helpTitle(), helpPage(helpFor(), this), "");
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(titlePort, true);
		setVisibleProp(face, true);
		setVisibleProp(footer, true);
		const top = asMetroTop(titlePort);
		if (top)
			top.setTop(titlePort, this.on ? "进行" : "节拍", this.volume, this.on);
		const seg = asSevenSeg(face);
		if (seg)
			seg.setFace(face, String(this.bpm), true);
		const foot = asMetroFooter(footer);
		if (foot)
			foot.setFooter(footer, this.beats, this.beat, this.on);
	}
}

function helpPage(rows: readonly { key: string; action: string }[], host: { helpIndex: number }) {
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
