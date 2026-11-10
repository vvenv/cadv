/*
	Native noise synth (pcm.c). One synth at a time.
*/

export function pcmReset(kind, seed) {
	native("xs_noise_reset").call(this, kind, seed);
}

export function pcmFill(buffer, gain) {
	native("xs_noise_fill").call(this, buffer, gain);
}
