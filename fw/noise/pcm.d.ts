/** Restart the synth: kind is an index into SOUNDS. */
export function pcmReset(kind: number, seed: number): void;
/** Fill the whole buffer with int16 PCM, scaled by gain (0..1). */
export function pcmFill(buffer: ArrayBufferLike, gain: number): void;
