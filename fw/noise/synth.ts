/*
	Background-sound synthesis into 16-bit PCM.
	Generated at half rate (each value written twice) to halve the JS work;
	all of these sounds are dark enough that 8 kHz content is plenty.
*/

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

const HALF_RATE = 8000;

export class Synth {
	sound: Sound = "white";
	#seed = 0x2545f491;
	/* Pink (Paul Kellet "economy" filter). */
	#b0 = 0;
	#b1 = 0;
	#b2 = 0;
	/* Brown. */
	#br = 0;
	/* Rain drops. */
	#drop = 0;
	#dropAmp = 0;
	#lastW = 0;
	/* Waves. */
	#t = 0;
	#period = 9;
	#phase = 0;

	constructor(sound: Sound) {
		this.sound = sound;
		this.#seed = (Date.now() | 1) >>> 0;
	}

	/** Uniform in [-1, 1). xorshift32. */
	#white(): number {
		let x = this.#seed;
		x ^= x << 13;
		x ^= x >>> 17;
		x ^= x << 5;
		this.#seed = x >>> 0;
		return (this.#seed / 2147483648) - 1;
	}

	#pink(w: number): number {
		this.#b0 = 0.99765 * this.#b0 + w * 0.0990460;
		this.#b1 = 0.96300 * this.#b1 + w * 0.2965164;
		this.#b2 = 0.57000 * this.#b2 + w * 1.0526913;
		return (this.#b0 + this.#b1 + this.#b2 + w * 0.1848) * 0.2;
	}

	#brown(w: number): number {
		this.#br = (this.#br + 0.02 * w) / 1.02;
		return this.#br * 3.2;
	}

	/** Next value in about [-1, 1]. */
	#next(): number {
		const w = this.#white();
		const s = this.sound;
		if (s === "pink")
			return this.#pink(w);
		if (s === "brown")
			return this.#brown(w);
		if (s === "rain") {
			/* Soft pink bed plus sparse, quickly decaying high-passed clicks. */
			const bed = this.#pink(w) * 0.55;
			if (this.#drop < 0.01 && this.#white() > 0.9965) {
				this.#drop = 1;
				this.#dropAmp = 0.25 + 0.5 * (this.#white() + 1) / 2;
			}
			const hp = w - this.#lastW;
			this.#lastW = w;
			const drop = this.#drop * this.#dropAmp * hp * 0.5;
			this.#drop *= 0.93;
			return bed + drop;
		}
		if (s === "waves") {
			/* Brown noise under a raised-cosine swell; each swell picks a new length. */
			this.#t += 1 / HALF_RATE;
			if (this.#t >= this.#period) {
				this.#t -= this.#period;
				this.#period = 7 + 4 * (this.#white() + 1) / 2;
			}
			this.#phase = this.#t / this.#period;
			const swell = 0.5 - 0.5 * Math.cos(2 * Math.PI * this.#phase);
			const env = 0.15 + 0.85 * swell * swell;
			const hiss = this.#pink(w) * 0.35 * swell;
			return this.#brown(w) * env + hiss;
		}
		return w * 0.6;
	}

	/** Fill `out` with samples, scaled by gain (0..1). */
	fill(out: Int16Array, gain: number) {
		const scale = 26000 * gain;
		for (let i = 0; i + 1 < out.length; i += 2) {
			let v = this.#next() * scale;
			if (v > 32767)
				v = 32767;
			else if (v < -32768)
				v = -32768;
			const n = v | 0;
			out[i] = n;
			out[i + 1] = n;
		}
	}
}
