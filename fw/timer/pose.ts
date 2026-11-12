/*
	Which way the board rests, from the BMI270 gravity vector (in g).
	"stand": on the long keyboard edge, screen upright facing you (|y| wins,
	the same axis the level app calls edgeY). "flat": lying on its back or
	face (|z| wins). Anything else, or a board in motion, is "other".

	A pose counts only after it has held for STABLE_MS, so picking the board
	up or knocking it does not start or pause anything. The first settled
	pose after opening is taken as the starting point and reported as no
	change: launching while it stands does not start the timer.
*/

export type Pose = "flat" | "stand" | "other";

/** Share of 1 g the dominant axis needs. 0.8 g ≈ within 37° of the axis. */
const POSE_G = 0.8;
/** How long a pose must hold before it counts. */
export const STABLE_MS = 600;
/** Low-pass weight per sample; samples arrive every 100 ms. */
const LOWPASS = 0.35;

export function classify(x: number, y: number, z: number): Pose {
	const ax = Math.abs(x);
	const ay = Math.abs(y);
	const az = Math.abs(z);
	if (az > POSE_G && az >= ax && az >= ay)
		return "flat";
	if (ay > POSE_G && ay >= ax && ay >= az)
		return "stand";
	return "other";
}

export class PoseTracker {
	x = 0;
	y = 0;
	z = 0;
	primed = false;
	/** Last pose that held for STABLE_MS; null before the first one. */
	settled: Pose | null = null;
	candidate: Pose = "other";
	since = 0;

	reset() {
		this.primed = false;
		this.settled = null;
		this.candidate = "other";
		this.since = 0;
	}

	/** Feed one sample. Returns the new pose when a settled pose changes, else null. */
	feed(x: number, y: number, z: number, now: number): Pose | null {
		if (!this.primed) {
			this.x = x;
			this.y = y;
			this.z = z;
			this.primed = true;
		}
		else {
			this.x += LOWPASS * (x - this.x);
			this.y += LOWPASS * (y - this.y);
			this.z += LOWPASS * (z - this.z);
		}
		const pose = classify(this.x, this.y, this.z);
		if (pose !== this.candidate) {
			this.candidate = pose;
			this.since = now;
			return null;
		}
		if (pose === "other" || pose === this.settled || now - this.since < STABLE_MS)
			return null;
		const first = this.settled === null;
		this.settled = pose;
		return first ? null : pose;
	}
}
