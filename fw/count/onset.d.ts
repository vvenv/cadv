/**
	Restart the detector. thrDb: over the noise floor; riseDb: jump over the
	previous 8 ms; minDb: absolute dBFS (after the 1 kHz high-pass);
	releaseDb: fall under a hit's peak before the next; gapMs: minimum
	spacing; settleMs: start-up time spent only learning the floor.
*/
export function onsetReset(thrDb: number, riseDb: number, minDb: number, releaseDb: number, gapMs: number, settleMs: number): void;
/** Feed int16 mono PCM. Returns the hits found in it. */
export function onsetFeed(buffer: ArrayBufferLike, byteOffset: number, samples: number): number;
/** [loudest 4 ms frame since the last call, noise floor], high-passed dBFS. */
export function onsetLevel(): [number, number];
