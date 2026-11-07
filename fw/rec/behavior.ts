/*
	Record 16 kHz mono WAV into cadv/rec, then play it back.
	The mic and the speaker share I2S1, so playback closes the mic first.
*/

import {} from "piu/MC";
import Timer from "timer";
import AudioOut from "pins/audioout";
import { bootLauncher } from "boot";
import { clipNames, nextClip, openClip, openClips } from "clips";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir } from "keys";
import { MENU_VISIBLE, menuStep } from "list";
import { asMenu } from "menu-view";
import { micFault, openMic, type MicFeed } from "mic";
import { Power } from "power";
import { acceptStroke, titleWithPower } from "session";
import { writeCodec } from "sound";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asMeter } from "view";
import { wavHeader } from "wav";
import type { Directory, File } from "embedded:storage/files";

type Mode = "live" | "list" | "play" | "help";

const CHUNK = 2048;

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
	playPcm: Uint8Array | null = null;
	audio: InstanceType<typeof AudioOut> | null = null;
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
		if (this.mode === "play") {
			if (isBack(stroke) || isConfirm(stroke))
				this.stopPlay();
			this.mode = "list";
			this.paint(app);
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

	attachMic() {
		if (this.mic)
			return;
		this.mic = openMic(pcm => {
			if (this.file)
				this.pending.push(pcm.slice());
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
		this.note = "已存 " + this.name;
	}

	flush() {
		const file = this.file;
		if (!file)
			return;
		while (this.pending.length) {
			const pcm = this.pending.shift();
			if (!pcm)
				break;
			try {
				file.write(pcm.buffer, 44 + this.pcm);
				this.pcm += pcm.byteLength;
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
		try { this.mic?.close(); } catch { /* */ }
		this.mic = null;
		let file: File;
		try {
			file = openClip(this.dir, name, "r");
			this.playSize = file.status().size;
		}
		catch {
			this.note = "读失败";
			this.attachMic();
			return;
		}
		this.file = file;
		this.playAt = 44;
		this.mode = "play";
		this.note = name;
		try {
			writeCodec(false);
			this.audio = new AudioOut({ sampleRate: 16000, bitsPerSample: 16, numChannels: 1, streams: 1 });
			this.audio.callback = () => this.feedPlay(app);
			this.audio.start();
			this.feedPlay(app);
		}
		catch {
			this.note = "无法播放";
			this.stopPlay();
		}
		this.showList(app, false);
		this.paint(app);
	}

	feedPlay(app: AppHost) {
		const file = this.file;
		const audio = this.audio;
		if (!file || !audio || this.mode !== "play")
			return;
		if (this.playAt >= this.playSize) {
			this.stopPlay();
			this.mode = "list";
			this.showList(app, true);
			this.paint(app);
			return;
		}
		let n = this.playSize - this.playAt;
		if (n > CHUNK)
			n = CHUNK;
		try {
			if (!this.playPcm)
				this.playPcm = new Uint8Array(new SharedArrayBuffer(CHUNK));
			const got = file.read(this.playPcm.subarray(0, n), this.playAt);
			const samples = got >> 1;
			if (samples <= 0) {
				this.stopPlay();
				this.mode = "list";
				this.showList(app, true);
				this.paint(app);
				return;
			}
			this.playAt += samples << 1;
			audio.enqueue(0, AudioOut.Volume, 256);
			audio.enqueue(0, AudioOut.RawSamples, this.playPcm as unknown as HostBuffer, 1, 0, samples);
			audio.enqueue(0, AudioOut.Callback, 0);
		}
		catch {
			this.note = "读失败";
			this.stopPlay();
		}
	}

	stopPlay() {
		try { this.audio?.stop(); } catch { /* */ }
		try { this.audio?.close(); } catch { /* */ }
		this.audio = null;
		try { this.file?.close(); } catch { /* */ }
		this.file = null;
		if (!this.mic)
			this.attachMic();
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
				const title = this.power ? titleWithPower(this.power, helpTitle()) : helpTitle();
				view.setList(port, `${title} ${start + 1}/${n}`, lines, "");
				return;
			}
			this.refreshNames();
			if (!this.names.length) {
				view.setList(port, "录音", [{ text: this.dir ? "没有录音" : "无卡", selected: false }], "");
				return;
			}
			const lines = this.names.map((name, i) => ({ text: name, selected: i === this.index }));
			const title = (this.index + 1) + "/" + this.names.length;
			view.setList(port, this.power ? titleWithPower(this.power, title) : title, lines, "");
			return;
		}
		const port = contentByName(app, "meterPort");
		const view = asMeter(port);
		if (!view)
			return;
		const peak = this.mic ? this.mic.peak() : 0;
		const title = this.file && this.mode === "live" ? "录音中" : (this.mode === "play" ? "播放" : "录音");
		const banner = this.power?.banner() ?? "";
		const sub = [banner, this.note, this.file ? Math.floor(this.pcm / 32000) + "s" : ""].filter(part => part).join(" ");
		view.setMeter(port, title, this.mode === "play" ? -1 : peak, sub);
	}
}
