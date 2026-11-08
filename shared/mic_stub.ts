/*
	Desktop stand-in. A 440 Hz tone so the tuner can show A, and a mid peak.
*/

import Timer from "timer";

export type MicFeed = {
	peak(): number;
	close(): void;
};

const RATE = 16000;
const CHUNK = 512;

export function micFault(): string {
	return "";
}

export function openMic(onPcm?: (pcm: Int16Array) => void): MicFeed | null {
	let phase = 0;
	let timer: Timer | undefined;
	const step = 2 * Math.PI * 440 / RATE;
	if (onPcm) {
		timer = Timer.repeat(() => {
			const pcm = new Int16Array(CHUNK);
			for (let i = 0; i < CHUNK; i++) {
				pcm[i] = Math.round(Math.sin(phase) * 12000);
				phase += step;
				if (phase > Math.PI * 2)
					phase -= Math.PI * 2;
			}
			onPcm(pcm);
		}, Math.round(1000 * CHUNK / RATE));
	}
	return {
		peak() {
			return 36;
		},
		close() {
			Timer.clear(timer);
		},
	};
}
