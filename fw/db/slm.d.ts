/** Restart filters and time weighting. settle = windows to drop first. */
export function slmReset(aWeight: boolean, tau: number, window: number, settle: number): void;
/**
	Feed int16 mono PCM. Returns how many windows finished; when non-zero,
	out (3 float32) = [window mean square, time-weighted now, time-weighted max].
	Mean squares are relative to full scale = 1.
*/
export function slmFeed(buffer: ArrayBufferLike, byteOffset: number, samples: number, out: ArrayBufferLike): number;
