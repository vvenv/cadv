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

export function openMic(onPcm?: (pcm: Int16Array) => void): MicFeed | null {
	try {
		writeCodec(true);
		let lastPeak = 0;
		const input = new AudioIn({
			sampleRate: 16000,
			bitsPerSample: 16,
			channels: 1,
			onReadable(byteLength: number) {
				let buf: ArrayBuffer;
				try {
					buf = this.read(byteLength);
				}
				catch {
					return;
				}
				if (!buf || buf.byteLength < 2)
					return;
				const pcm = new Int16Array(buf);
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
			},
		});
		input.start();
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
	catch {
		return null;
	}
}
