/*
	Background sounds. The samples are generated in C (pcm.c); this module
	keeps the names and a small handle for the behavior.
*/

import { pcmFill, pcmReset } from "pcm";

export type Sound = "white" | "pink" | "brown" | "rain" | "waves";

export const SOUNDS: readonly Sound[] = Object.freeze(["white", "pink", "brown", "rain", "waves"]);

export function soundLabel(s: Sound): string {
	if (s === "pink")
		return "粉红噪音";
	if (s === "brown")
		return "褐噪音";
	if (s === "rain")
		return "雨声";
	if (s === "waves")
		return "海浪";
	return "白噪音";
}

export class Synth {
	sound: Sound;

	constructor(sound: Sound) {
		this.sound = sound;
		pcmReset(Math.max(0, SOUNDS.indexOf(sound)), (Date.now() | 1) >>> 0);
	}

	/** Fill `out` with samples, scaled by gain (0..1). */
	fill(out: Int16Array, gain: number) {
		pcmFill(out.buffer, gain);
	}
}
