/*
	Desktop stand-in. No BMI270 — slowly sweeps pitch/roll so the bubble moves.
*/

export type AccelSample = { x: number; y: number; z: number };

export type ImuHandle = {
	sample(): AccelSample | null;
	close(): void;
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
			return { x, y, z };
		},
		close() { /* */ },
	};
}
