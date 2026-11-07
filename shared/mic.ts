/*
	ES8311 ADC into I2S. Close this before opening the speaker:
	both sides use I2S1.
*/

import AudioIn from "embedded:io/audio/in";
import { writeCodec } from "sound";

export type MicFeed = {
	peak(): number;
	close(): void;
};

let fault = "";

export function micFault(): string {
	return fault;
}

function faultText(e: unknown): string {
	if (e && typeof e === "object" && "message" in e) {
		const message = (e as { message?: unknown }).message;
		if (typeof message === "string" && message)
			return message;
	}
	return "无麦克风";
}

export function openMic(onPcm?: (pcm: Int16Array) => void): MicFeed | null {
	try {
		writeCodec(true);
		let lastPeak = 0;
		const input = new AudioIn({
			sampleRate: 16000,
			bitsPerSample: 16,
			channels: 1,
			onReadable(byteLength: number) {
				try {
					let n = byteLength;
					if (n > 1024)
						n = 1024;
					n -= n & 1;
					if (n < 2)
						return;
					const buf = this.read(n);
					if (!buf || buf.byteLength < 2)
						return;
					const pcm = new Int16Array(buf, 0, buf.byteLength >> 1);
					let peak = 0;
					for (let i = 0; i < pcm.length; i++) {
						const a = pcm[i] < 0 ? -pcm[i] : pcm[i];
						if (a > peak)
							peak = a;
					}
					lastPeak = Math.round(peak * 100 / 32767);
					if (lastPeak > 100)
						lastPeak = 100;
					if (onPcm)
						onPcm(pcm);
				}
				catch {
					/* a short read must not tear down the input */
				}
			},
		});
		input.start();
		fault = "";
		return {
			peak() {
				return lastPeak;
			},
			close() {
				try { input.stop(); } catch { /* */ }
				try { input.close(); } catch { /* */ }
			},
		};
	}
	catch (e) {
		fault = faultText(e);
		trace("mic: " + fault + "\n");
		return null;
	}
}
