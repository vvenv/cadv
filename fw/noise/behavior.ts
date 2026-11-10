/*
	Sleep sounds. PCM is synthesised into a few SharedArrayBuffer slabs and
	fed to AudioOut as RawSamples; each slab's Callback refills it.
	The sleep timer fades out over the last FADE_MS, then stops.
*/

import {} from "piu/MC";
import AudioOut from "pins/audioout";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { helpList } from "help-ui";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir, sideDir, volumeDelta } from "keys";
import { asMenu, type MenuLine } from "menu-view";
import { pref } from "pref";
import { Power } from "power";
import { acceptStroke } from "session";
import { releaseMic, writeCodec } from "sound";
import { SOUNDS, soundLabel, Synth, type Sound } from "synth";
import { audioVolume, VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { contentByName, type AppHost } from "ui";

const store = pref("noise");
const SAMPLES = 1024;
const BUFFERS = 3;
/** Sleep timer choices in minutes; 0 = never. */
const TIMERS = Object.freeze([15, 30, 60, 90, 0]);
const FADE_MS = 30_000;

type Mode = "run" | "help";

function clock(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return m + ":" + (s < 10 ? "0" : "") + s;
}

export class AppBehavior extends Behavior {
	mode: Mode = "run";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	audio: InstanceType<typeof AudioOut> | null = null;
	synth: Synth | null = null;
	free: Int16Array[] = [];
	busy: Int16Array[] = [];
	selected = 0;
	playing: Sound | null = null;
	timerIndex = 1;
	endsAt = 0;
	volume = VOL_DEFAULT;
	note = "";
	lastShown = "";
	helpIndex = 0;
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		const s = store.getString("sound", "pink");
		this.selected = Math.max(0, SOUNDS.indexOf(s as Sound));
		this.timerIndex = store.getInt("timer", 1, 0, TIMERS.length - 1);
		this.volume = store.getInt("volume", VOL_DEFAULT, VOL_MIN, VOL_MAX);
		this.power = new Power("blank");
		this.paint(app);
		Timer.set(() => {
			this.kb = new CardputerKeyboard();
			this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		}, 1);
	}

	onKeyboardTick(app: AppHost) {
		if (this.playing && this.endsAt && Date.now() >= this.endsAt) {
			this.stop();
			this.note = "定时到了";
			this.paint(app);
		}
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(app);
		if (stroke)
			this.handleStroke(app, stroke);
		else if (this.playing && this.endsAt) {
			/* Repaint once a second for the countdown. */
			const shown = clock(this.endsAt - Date.now());
			if (shown !== this.lastShown)
				this.paint(app);
		}
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
			this.stop();
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
		this.note = "";
		const vol = volumeDelta(stroke.chars);
		if (vol !== 0) {
			this.volume = Math.max(VOL_MIN, Math.min(VOL_MAX, this.volume + vol));
			this.applyVolume();
			this.save();
			this.paint(app);
			return;
		}
		const dir = navDir(stroke);
		if (dir !== 0) {
			this.selected = (this.selected + dir + SOUNDS.length) % SOUNDS.length;
			/* Switching while playing changes the sound at once. */
			if (this.playing && this.synth) {
				this.playing = SOUNDS[this.selected];
				this.synth = new Synth(this.playing);
			}
			this.save();
			this.paint(app);
			return;
		}
		const side = sideDir(stroke);
		if (side !== 0 && !stroke.left) {
			this.timerIndex = Math.max(0, Math.min(TIMERS.length - 1, this.timerIndex + side));
			if (this.playing)
				this.armTimer();
			this.save();
			this.paint(app);
			return;
		}
		if (isConfirm(stroke)) {
			if (this.playing)
				this.stop();
			else
				this.start(SOUNDS[this.selected]);
			this.paint(app);
			return;
		}
		if (isBack(stroke) && this.playing) {
			this.stop();
			this.paint(app);
		}
	}

	armTimer() {
		const min = TIMERS[this.timerIndex];
		this.endsAt = min ? Date.now() + min * 60_000 : 0;
	}

	start(sound: Sound) {
		this.stop();
		this.synth = new Synth(sound);
		this.free = [];
		this.busy = [];
		for (let i = 0; i < BUFFERS; i++)
			this.free.push(new Int16Array(new SharedArrayBuffer(SAMPLES * 2)));
		try {
			releaseMic();
			if (!writeCodec(false)) {
				this.note = "无喇叭";
				this.synth = null;
				return;
			}
			const audio = new AudioOut({ sampleRate: 16000, bitsPerSample: 16, numChannels: 1, streams: 1 });
			this.audio = audio;
			audio.callback = () => this.onSlabDone();
			audio.enqueue(0, AudioOut.Volume, audioVolume(this.volume));
			this.playing = sound;
			this.armTimer();
			while (this.free.length)
				this.feed();
			audio.start();
			/* M5 enables the DAC after the I2S clocks run (same as rec). */
			writeCodec(false);
			this.power?.activity();
		}
		catch {
			this.note = "无法播放";
			this.stop();
		}
	}

	onSlabDone() {
		const done = this.busy.shift();
		if (done)
			this.free.push(done);
		if (!this.playing)
			return;
		while (this.free.length)
			this.feed();
	}

	feed() {
		const audio = this.audio;
		const synth = this.synth;
		const buf = this.free.pop();
		if (!audio || !synth || !buf)
			return;
		let gain = 1;
		if (this.endsAt) {
			const left = this.endsAt - Date.now();
			if (left < FADE_MS)
				gain = Math.max(0, left / FADE_MS);
		}
		synth.fill(buf, gain);
		try {
			/* RawSamples needs a non-relocatable buffer: SharedArrayBuffer. */
			audio.enqueue(0, AudioOut.RawSamples, buf.buffer as unknown as HostBuffer, 1, 0, SAMPLES);
			audio.enqueue(0, AudioOut.Callback, 0);
			this.busy.push(buf);
		}
		catch {
			this.free.push(buf);
		}
	}

	applyVolume() {
		if (!this.audio)
			return;
		try {
			this.audio.enqueue(0, AudioOut.Volume, audioVolume(this.volume));
		}
		catch {
			/* queue full: the next slab picks it up */
		}
	}

	stop() {
		const audio = this.audio;
		this.audio = null;
		this.playing = null;
		this.synth = null;
		this.endsAt = 0;
		this.busy = [];
		this.free = [];
		if (audio) {
			try { audio.callback = () => {}; } catch { /* */ }
			try { audio.stop(); } catch { /* */ }
			try { audio.close(); } catch { /* */ }
		}
	}

	save() {
		try {
			store.set("sound", SOUNDS[this.selected]);
			store.set("timer", this.timerIndex);
			store.set("volume", this.volume);
		}
		catch {
			/* */
		}
	}

	paint(app: AppHost) {
		const list = contentByName(app, "listPort");
		const view = asMenu(list);
		if (!view)
			return;
		if (this.mode === "help") {
			const page = helpList(helpFor(), this, helpTitle());
			view.setList(list, page.title, page.lines, "");
			return;
		}
		const min = TIMERS[this.timerIndex];
		const timerText = min ? min + "分" : "不关";
		let title = "助眠 " + timerText;
		this.lastShown = "";
		if (this.note)
			title = this.note;
		else if (this.playing && this.endsAt) {
			this.lastShown = clock(this.endsAt - Date.now());
			title = "剩 " + this.lastShown;
		}
		else if (this.playing)
			title = "播放中 不关";
		const lines: MenuLine[] = [];
		for (let i = 0; i < SOUNDS.length; i++) {
			const s = SOUNDS[i];
			const on = this.playing === s;
			lines.push({
				text: soundLabel(s),
				right: on ? "播放" : "",
				selected: i === this.selected,
				glyph: on ? "play" : undefined,
			});
		}
		view.setList(list, title, lines, "", this.volume <= 0 ? "mute" : "vol", this.volume);
	}
}
