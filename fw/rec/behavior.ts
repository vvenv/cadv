/*
	Record 16 kHz mono WAV into cadv/rec, then play it back.
	The mic and the speaker share I2S1, so playback closes the mic first.
*/

import {} from "piu/MC";
import Timer from "timer";
import AudioOut from "pins/audioout";
import { bootLauncher } from "boot";
import { clipNames, clipSeconds, nextClip, openClip, openClips } from "clips";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir, volumeDelta } from "keys";
import { MENU_VISIBLE, menuStep } from "list";
import { asMenu } from "menu-view";
import { noteGlyph } from "ink";
import { micFault, openMic, type MicFeed } from "mic";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { releaseMic, writeCodec } from "sound";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asMeter } from "view";
import { audioVolume, VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { wavHeader } from "wav";
import type { Directory, File } from "embedded:storage/files";

type Mode = "live" | "list" | "play" | "help";

const CHUNK = 2048;
/** Keep two PCM slabs so RawSamples is never rewritten while the mixer still holds it. */
const PLAY_BUFFERS = 2;

export class AppBehavior extends Behavior {
	mode: Mode = "live";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	mic: MicFeed | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	dir: Directory | null = null;
	file: File | null = null;
	name = "";
	pcm = 0;
	pending: Int16Array[] = [];
	names: string[] = [];
	index = 0;
	helpIndex = 0;
	playAt = 44;
	playSize = 0;
	playFree: Uint8Array[] = [];
	playBusy: Uint8Array[] = [];
	audio: InstanceType<typeof AudioOut> | null = null;
	endingPlay = false;
	volume = VOL_DEFAULT;
	note = "";
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.power = new Power("blank");
		this.attachMic();
		this.dir = openClips();
		if (!this.mic)
			this.note = micFault() || "无麦克风";
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 40);
		this.paint(app);
	}

	onKeyboardTick(app: AppHost) {
		if (this.mode !== "play")
			this.flush();
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const bumped = this.power?.takeNote() ?? "";
		if (bumped)
			this.note = bumped;
		if (stroke)
			this.handleStroke(app, stroke);
		if (this.mode === "live" || this.mode === "play")
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
			this.stopPlay();
			this.stopRec();
			bootLauncher();
			return;
		}
		if (isHelp(stroke) && this.mode !== "help") {
			if (this.mode === "play")
				this.stopPlay();
			this.helpIndex = 0;
			this.mode = "help";
			this.showList(app, true);
			this.paint(app);
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke)) {
				this.mode = "live";
				this.showList(app, false);
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.helpIndex = Math.max(0, this.helpIndex + dir);
			this.paint(app);
			return;
		}
		if (this.adjustVolume(stroke.chars)) {
			this.paint(app);
			return;
		}
		if (this.mode === "play") {
			this.finishPlay(app);
			return;
		}
		if (this.mode === "list") {
			if (isBack(stroke)) {
				this.mode = "live";
				this.showList(app, false);
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0 && this.names.length)
				this.index = menuStep(this.index, this.names.length, dir);
			if (isConfirm(stroke))
				this.startPlay(app);
			if (stroke.chars.some(ch => ch === "d" || ch === "D"))
				this.removeClip(app);
			this.paint(app);
			return;
		}
		if (stroke.chars.some(ch => ch === ".")) {
			if (this.file)
				this.stopRec();
			this.mode = "list";
			this.refreshNames();
			this.showList(app, true);
			this.paint(app);
			return;
		}
		if (isConfirm(stroke)) {
			if (this.file)
				this.stopRec();
			else
				this.startRec();
			this.paint(app);
		}
	}

	/** Same -/= contract as piano / metro / clock. Live while playing. */
	adjustVolume(chars: string[]): boolean {
		const delta = volumeDelta(chars);
		if (delta === 0)
			return false;
		let v = this.volume + delta;
		if (v < VOL_MIN)
			v = VOL_MIN;
		if (v > VOL_MAX)
			v = VOL_MAX;
		this.volume = v;
		this.applyVolume();
		this.note = "音量 " + v;
		return true;
	}

	applyVolume() {
		const audio = this.audio;
		if (!audio)
			return;
		try {
			audio.enqueue(0, AudioOut.Volume, audioVolume(this.volume));
		}
		catch {
			/* */
		}
	}

	attachMic() {
		if (this.mic)
			return;
		this.mic = openMic(pcm => {
			if (!this.file || this.mode === "play")
				return;
			/* Copy out of the AudioIn recycle buffer before the next read. */
			const copy = new Int16Array(pcm.length);
			copy.set(pcm);
			this.pending.push(copy);
		});
	}

	startRec() {
		if (!this.mic)
			this.attachMic();
		if (!this.dir || !this.mic) {
			this.note = this.dir ? (micFault() || "无麦克风") : "无卡";
			return;
		}
		this.refreshNames();
		this.name = nextClip(this.names);
		try {
			this.file = openClip(this.dir, this.name, "w");
			this.file.write(wavHeader(0), 0);
			this.pcm = 0;
			this.note = this.name;
			this.power?.lamp("rec");
		}
		catch {
			this.file = null;
			this.note = "写失败";
		}
	}

	stopRec() {
		this.power?.lamp("off");
		this.flush();
		const file = this.file;
		this.file = null;
		if (!file)
			return;
		try {
			file.write(wavHeader(this.pcm), 0);
			file.close();
		}
		catch {
			this.note = "写失败";
		}
		const sec = Math.floor(this.pcm / 32000);
		this.note = sec > 0 ? ("已存 " + this.name + " " + sec + "s") : ("已存 " + this.name + " 空");
	}

	flush() {
		const file = this.file;
		/* Never write into the file opened for playback. */
		if (!file || this.mode === "play")
			return;
		while (this.pending.length) {
			const pcm = this.pending.shift();
			if (!pcm)
				break;
			try {
				const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
				file.write(bytes, 44 + this.pcm);
				this.pcm += bytes.byteLength;
			}
			catch {
				this.note = "写失败";
				this.file = null;
				this.power?.lamp("off");
				try { file.close(); } catch { /* */ }
				this.pending = [];
				return;
			}
		}
	}

	refreshNames() {
		this.names = this.dir ? clipNames(this.dir) : [];
		if (this.index >= this.names.length)
			this.index = 0;
	}

	removeClip(app: AppHost) {
		const name = this.names[this.index];
		if (!name || !this.dir)
			return;
		try {
			this.dir.delete(name);
		}
		catch {
			this.note = "删失败";
		}
		this.refreshNames();
		this.paint(app);
	}

	startPlay(app: AppHost) {
		const name = this.names[this.index];
		if (!name || !this.dir)
			return;
		this.stopRec();
		this.pending = [];
		try { this.mic?.close(); } catch { /* */ }
		this.mic = null;
		this.endingPlay = false;
		this.mode = "play";
		this.note = name;
		this.showList(app, false);
		this.paint(app);
		/*
			Mic and speaker share I2S1. Closing AudioIn posts a final machine
			message; wait a beat so the channel is gone, power the codec down,
			then open AudioOut (same order as M5: clocks, then speaker enable).
		*/
		Timer.set(() => this.beginPlay(app, name), 40);
	}

	beginPlay(app: AppHost, name: string) {
		if (this.mode !== "play" || this.note !== name || !this.dir)
			return;
		let file: File;
		try {
			file = openClip(this.dir, name, "r");
			this.playSize = file.status().size;
		}
		catch {
			this.note = "读失败";
			this.finishPlay(app);
			return;
		}
		if (this.playSize <= 44) {
			try { file.close(); } catch { /* */ }
			this.note = "空录音";
			this.finishPlay(app);
			return;
		}
		this.file = file;
		this.playAt = 44;
		this.playFree = [];
		this.playBusy = [];
		for (let i = 0; i < PLAY_BUFFERS; i++)
			this.playFree.push(new Uint8Array(new SharedArrayBuffer(CHUNK)));
		try {
			/* Drop ADC before I2S TX; keyboard shares this bus so retry. */
			releaseMic();
			if (!writeCodec(false)) {
				this.note = "无喇叭";
				this.finishPlay(app);
				return;
			}
			this.audio = new AudioOut({ sampleRate: 16000, bitsPerSample: 16, numChannels: 1, streams: 1 });
			this.audio.callback = () => this.onPlayCallback(app);
			this.audio.enqueue(0, AudioOut.Volume, audioVolume(this.volume));
			for (let i = 0; i < PLAY_BUFFERS; i++) {
				if (!this.feedPlay())
					break;
			}
			if (!this.playBusy.length) {
				this.note = "空录音";
				this.finishPlay(app);
				return;
			}
			this.audio.start();
			/* M5 enables the DAC after the I2S clocks are running. */
			writeCodec(false);
		}
		catch {
			this.note = "无法播放";
			this.finishPlay(app);
		}
		this.paint(app);
	}

	onPlayCallback(app: AppHost) {
		const done = this.playBusy.shift();
		if (done)
			this.playFree.push(done);
		if (this.mode !== "play" || this.endingPlay)
			return;
		if (!this.feedPlay()) {
			if (this.playBusy.length)
				return;
			Timer.set(() => this.finishPlay(app), 1);
		}
	}

	/** Enqueue one PCM slab. Returns false when the clip is done or failed. */
	feedPlay(): boolean {
		const file = this.file;
		const audio = this.audio;
		if (!file || !audio || this.mode !== "play" || this.endingPlay)
			return false;
		if (this.playAt >= this.playSize)
			return false;
		let n = this.playSize - this.playAt;
		if (n > CHUNK)
			n = CHUNK;
		n -= n & 1;
		if (n < 2)
			return false;
		const buf = this.playFree.pop();
		if (!buf)
			return true;
		try {
			const got = file.read(buf.subarray(0, n), this.playAt);
			const samples = got >> 1;
			if (samples <= 0) {
				this.playFree.push(buf);
				return false;
			}
			this.playAt += samples << 1;
			/* RawSamples needs a non-relocatable HostBuffer (SharedArrayBuffer). */
			audio.enqueue(0, AudioOut.RawSamples, buf.buffer as unknown as HostBuffer, 1, 0, samples);
			audio.enqueue(0, AudioOut.Callback, samples << 1);
			this.playBusy.push(buf);
			return true;
		}
		catch {
			this.playFree.push(buf);
			this.note = "读失败";
			return false;
		}
	}

	finishPlay(app: AppHost) {
		if (this.endingPlay)
			return;
		this.endingPlay = true;
		this.stopPlay();
		this.mode = "list";
		this.showList(app, true);
		this.paint(app);
		this.endingPlay = false;
	}

	stopPlay() {
		const audio = this.audio;
		this.audio = null;
		this.playBusy = [];
		this.playFree = [];
		if (audio) {
			try { audio.callback = () => {}; } catch { /* */ }
			try { audio.stop(); } catch { /* */ }
			try { audio.close(); } catch { /* */ }
		}
		try { this.file?.close(); } catch { /* */ }
		this.file = null;
		Timer.set(() => {
			if (!this.mic && this.mode !== "play")
				this.attachMic();
		}, 1);
	}

	showList(app: AppHost, on: boolean) {
		setVisibleProp(contentByName(app, "listPort"), on);
		setVisibleProp(contentByName(app, "meterPort"), !on);
	}

	paint(app: AppHost) {
		if (this.mode === "list" || this.mode === "help") {
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
				view.setList(port, `${helpTitle()} ${start + 1}/${n}`, lines, "");
				return;
			}
			this.refreshNames();
			if (!this.names.length) {
				const empty = this.dir ? "没有录音" : "无卡";
				const g = noteGlyph(empty);
				view.setList(port, "录音", [{ text: empty, selected: false }], "", g.kind || "rec", g.level);
				return;
			}
			const lines = this.names.map((name, i) => {
				const sec = this.dir ? clipSeconds(this.dir, name) : 0;
				return { text: sec > 0 ? (name + " " + sec + "s") : (name + " 空"), selected: i === this.index };
			});
			const title = (this.index + 1) + "/" + this.names.length;
			const g = titleGlyph(this.power);
			view.setList(port, title, lines, "", g.kind, g.level);
			return;
		}
		const port = contentByName(app, "meterPort");
		const view = asMeter(port);
		if (!view)
			return;
		const peak = this.mic ? this.mic.peak() : 0;
		const title = this.file && this.mode === "live" ? "录音中" : (this.mode === "play" ? "播放" : "录音");
		const sub = [this.note, this.file ? Math.floor(this.pcm / 32000) + "s" : ""].filter(part => part).join(" ");
		const fromNote = noteGlyph(this.note);
		const mark = fromNote.kind
			? fromNote.kind
			: (this.mode === "play" ? "play" : (this.file && this.mode === "live" ? "rec" : "rec"));
		view.setMeter(port, title, this.mode === "play" ? -1 : peak, sub, mark, fromNote.level);
	}
}
