/*
	Desktop stand-in. No BMI270 — slowly sweeps pitch/roll so the bubble moves.
*/

export type AccelSample = {
	x: number;
	y: number;
	z: number;
	gx: number;
	gy: number;
	gz: number;
	steps: number;
};

export type ImuHandle = {
	sample(): AccelSample | null;
	close(): void;
	pedometer: boolean;
};

const DEG = Math.PI / 180;

export function imuError(): string {
	return "";
}

export function openImu(): ImuHandle | null {
	return {
		sample() {
			const t = Date.now() / 1000;
			const roll = Math.sin(t * 0.7) * 8 * DEG;
			const pitch = Math.cos(t * 0.45) * 6 * DEG;
			/* Gravity vector for a nearly-flat board with mild tilt. */
			const x = Math.sin(roll);
			const y = Math.sin(pitch);
			const z = Math.cos(roll) * Math.cos(pitch);
			const steps = Math.floor(t / 2);
			return { x, y, z, gx: Math.sin(t) * 4, gy: Math.cos(t * 0.8) * 3, gz: 0.4, steps };
		},
		close() { /* */ },
		pedometer: true,
	};
}
