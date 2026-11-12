/*
	Countdown timer you drive by how the board rests: stand it on the keyboard
	edge to start, lay it down to pause. Enter does the same from the keys.
	At zero it rings a few times; any key, or laying it down, stops the ring.
	Interval, pose control and volume are remembered.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { helpList } from "help-ui";
import { openImu, type ImuHandle } from "imu";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir, volumeDelta } from "keys";
import { asMenu } from "menu-view";
import { PoseTracker, type Pose } from "pose";
import { pref } from "pref";
import { Power } from "power";
import { acceptStroke } from "session";
import { ClockSound } from "sound";
import { asSevenSeg } from "sevenseg";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { asTimerFooter, asTimerTop, type TimerState } from "view";

const store = pref("timer");

/** Intervals in minutes. */
const MINUTES = Object.freeze([1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60]);
const DEFAULT_INDEX = 7; // 25 min
const RINGS = 4;
const RING_MS = 2500;
const NOTE_MS = 1500;
const IMU_MS = 100;

type Mode = "run" | "help";

function formatLeft(ms: number): string {
	const s = Math.ceil(Math.max(0, ms) / 1000);
	const m = Math.floor(s / 60);
	const r = s % 60;
	return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
}

function hasChar(stroke: KeyStroke, ch: string): boolean {
	const lower = ch.toLowerCase();
	return stroke.chars.some(c => c.toLowerCase() === lower);
}

export class AppBehavior extends Behavior {
	mode: Mode = "run";
	state: TimerState = "idle";
	index = DEFAULT_INDEX;
	/** Time left while not running. */
	leftMs = 0;
	/** Date.now() at zero while running. */
	endAt = 0;
	usePose = true;
	volume = VOL_DEFAULT;
	note = "";
	noteAt = 0;
	rings = 0;
	helpIndex = 0;
	hostEnterDown = false;
	app: AppHost | null = null;
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	sound: ClockSound | null = null;
	imu: ImuHandle | null = null;
	tracker = new PoseTracker();
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	tickTimer: ReturnType<typeof Timer.repeat> | null = null;
	imuTimer: ReturnType<typeof Timer.repeat> | null = null;
	ringTimer: ReturnType<typeof Timer.repeat> | null = null;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.app = app;
		this.index = store.getInt("index", DEFAULT_INDEX, 0, MINUTES.length - 1);
		this.usePose = store.getBool("pose", true);
		this.volume = store.getInt("volume", VOL_DEFAULT, VOL_MIN, VOL_MAX);
		this.leftMs = this.totalMs();
		this.power = new Power("blank");
		this.sound = new ClockSound();
		this.sound.setVolume(this.volume);
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.tickTimer = Timer.repeat(() => this.onTick(app), 200);
		this.setPose(this.usePose);
		this.paint(app);
	}

	totalMs(): number {
		return MINUTES[this.index] * 60000;
	}

	remainingMs(): number {
		return this.state === "run" ? Math.max(0, this.endAt - Date.now()) : this.leftMs;
	}

	// ---- input ----

	onKeyboardTick(app: AppHost) {
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		this.takeNote();
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
		this.takeNote();
		if (use)
			this.handleStroke(content as AppHost, use);
	}

	onKeyUp(_content: unknown, key: string) {
		if (key === "\r" || key === "\n")
			this.hostEnterDown = false;
	}

	takeNote() {
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.showNote(note);
	}

	showNote(note: string) {
		this.note = note;
		this.noteAt = Date.now();
		if (this.app)
			this.paint(this.app);
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (isLauncher(stroke)) {
			bootLauncher();
			return;
		}
		if (this.state === "done" && this.rings > 0) {
			this.stopRing(); // any key silences; it does nothing else
			this.paint(app);
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
				this.mode = "run";
			else {
				const dir = navDir(stroke);
				if (dir !== 0)
					this.helpIndex += dir;
			}
			this.paint(app);
			return;
		}
		const vol = volumeDelta(stroke.chars);
		if (vol !== 0) {
			this.volume = Math.max(VOL_MIN, Math.min(VOL_MAX, this.volume + vol));
			this.sound?.setVolume(this.volume);
			store.set("volume", this.volume);
		}
		const dir = navDir(stroke);
		if (dir !== 0 && this.state !== "run") {
			// K (up) lengthens, J (down) shortens. Changing it starts the interval over.
			const next = Math.max(0, Math.min(MINUTES.length - 1, this.index - dir));
			if (next !== this.index) {
				this.index = next;
				store.set("index", next);
			}
			this.reset();
		}
		if (hasChar(stroke, "r"))
			this.reset();
		if (hasChar(stroke, "g")) {
			this.setPose(!this.usePose);
			store.set("pose", this.usePose);
			this.showNote(this.usePose ? "姿态开" : "姿态关");
		}
		if (isConfirm(stroke)) {
			if (this.state === "run")
				this.pause();
			else
				this.start();
		}
		this.paint(app);
	}

	// ---- pose ----

	setPose(on: boolean) {
		this.usePose = on;
		if (this.imuTimer) {
			Timer.clear(this.imuTimer);
			this.imuTimer = null;
		}
		this.imu?.close();
		this.imu = null;
		this.tracker.reset();
		if (!on)
			return;
		this.imu = openImu();
		if (!this.imu) {
			this.usePose = false;
			this.showNote("无陀螺仪");
			return;
		}
		this.imuTimer = Timer.repeat(() => this.onImu(), IMU_MS);
	}

	onImu() {
		const s = this.imu?.sample();
		if (!s)
			return;
		const pose = this.tracker.feed(s.x, s.y, s.z, Date.now());
		if (pose)
			this.onPose(pose);
	}

	onPose(pose: Pose) {
		if (pose === "stand") {
			if (this.state !== "run")
				this.start();
		}
		else if (pose === "flat") {
			if (this.state === "run")
				this.pause();
			else if (this.state === "done")
				this.stopRing();
		}
		this.power?.activity();
		if (this.app)
			this.paint(this.app);
	}

	// ---- timing ----

	start() {
		this.stopRing();
		if (this.state === "done" || this.leftMs <= 0)
			this.leftMs = this.totalMs();
		this.endAt = Date.now() + this.leftMs;
		this.state = "run";
		this.sound?.click();
	}

	pause() {
		this.leftMs = Math.max(0, this.endAt - Date.now());
		this.state = "pause";
	}

	reset() {
		this.stopRing();
		this.state = "idle";
		this.leftMs = this.totalMs();
	}

	onTick(app: AppHost) {
		if (this.note && Date.now() - this.noteAt > NOTE_MS)
			this.note = "";
		if (this.state === "run") {
			// Keep the screen lit while counting; it is a clock you glance at.
			this.power?.activity();
			if (Date.now() >= this.endAt)
				this.finish();
		}
		if (this.mode === "run")
			this.paint(app);
	}

	finish() {
		this.state = "done";
		this.leftMs = 0;
		this.rings = RINGS;
		this.ring();
		this.ringTimer = Timer.repeat(() => this.ring(), RING_MS);
	}

	ring() {
		if (this.rings <= 0) {
			this.stopRing();
			return;
		}
		this.rings--;
		this.sound?.alarmChime();
	}

	stopRing() {
		this.rings = 0;
		if (this.ringTimer) {
			Timer.clear(this.ringTimer);
			this.ringTimer = null;
		}
	}

	// ---- paint ----

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
			if (view) {
				const page = helpList(helpFor(), this, helpTitle());
				view.setList(list, page.title, page.lines, "");
			}
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(titlePort, true);
		setVisibleProp(face, true);
		setVisibleProp(footer, true);
		const left = this.remainingMs();
		asTimerTop(titlePort)?.setTop(titlePort, this.state, this.note, this.usePose, this.volume);
		asSevenSeg(face)?.setFace(face, formatLeft(left), this.state === "run");
		const total = this.totalMs();
		asTimerFooter(footer)?.setFooter(footer, total > 0 ? 1 - left / total : 0, this.state);
	}
}
