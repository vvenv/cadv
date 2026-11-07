const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Fundamental in Hz, or 0 when the buffer is quiet or unpitched. */
export function fundamental(pcm: Int16Array, rate: number): number {
	const n = pcm.length;
	if (n < 64)
		return 0;
	const min = Math.max(8, Math.floor(rate / 1000));
	const max = Math.min(n - 1, Math.floor(rate / 70));
	let best = 0;
	let lag = 0;
	for (let step = min; step <= max; step++) {
		let sum = 0;
		const end = n - step;
		for (let i = 0; i < end; i += 2)
			sum += pcm[i] * pcm[i + step];
		if (sum > best) {
			best = sum;
			lag = step;
		}
	}
	if (lag <= 1)
		return 0;
	let energy = 0;
	for (let i = 0; i < n; i += 4)
		energy += pcm[i] * pcm[i];
	if (best < energy * 0.2)
		return 0;
	const left = correlate(pcm, lag - 1);
	const right = correlate(pcm, lag + 1);
	const denom = left - 2 * best + right;
	let delta = denom === 0 ? 0 : 0.5 * (left - right) / denom;
	if (delta > 0.5)
		delta = 0.5;
	if (delta < -0.5)
		delta = -0.5;
	return rate / (lag + delta);
}

function correlate(pcm: Int16Array, step: number): number {
	let sum = 0;
	const end = pcm.length - step;
	for (let i = 0; i < end; i += 2)
		sum += pcm[i] * pcm[i + step];
	return sum;
}

export function noteName(freq: number): { name: string; cents: number } | null {
	if (!(freq > 20))
		return null;
	const midi = 69 + 12 * Math.log(freq / 440) / Math.LN2;
	const rounded = Math.round(midi);
	const cents = Math.round((midi - rounded) * 100);
	const name = NAMES[((rounded % 12) + 12) % 12] + String(Math.floor(rounded / 12) - 1);
	return { name, cents };
}
