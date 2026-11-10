/*
	Desktop stand-in. Brightness is remembered in the process.
	The cell sits at 3.90V, so the low-battery banner stays off.
*/

import { batteryLow, batteryShort } from "battery";

export type IdleKind = "dim" | "blank";
export type LampMark = "off" | "rec" | "scan" | "flash";

const IDLE_MS = 30_000;
const FAKE_MV = 3900;

export class Power {
	kind: IdleKind;
	#level = 3;
	#activeAt = 0;
	#idle = false;
	#note = "";

	constructor(kind: IdleKind) {
		this.kind = kind;
		this.#activeAt = Date.now();
	}

	tick() {
		if (this.#idle)
			return;
		if (Date.now() - this.#activeAt < IDLE_MS)
			return;
		this.#idle = true;
	}

	activity(): boolean {
		this.#activeAt = Date.now();
		if (!this.#idle)
			return false;
		this.#idle = false;
		return true;
	}

	bump(dir: -1 | 1): string {
		let n = this.#level + dir;
		if (n < 0)
			n = 0;
		if (n > 3)
			n = 3;
		this.#level = n;
		this.#note = "亮度 " + (n + 1);
		return this.#note;
	}

	tell(note: string): string {
		this.#note = note;
		return this.#note;
	}

	takeNote(): string {
		const note = this.#note;
		this.#note = "";
		return note;
	}

	banner(): string {
		return batteryLow(FAKE_MV) ? "低电" : "";
	}

	short(): string {
		return batteryShort(FAKE_MV);
	}

	step(): number {
		return this.#level + 1;
	}

	millivolts(): number {
		return FAKE_MV;
	}

	lamp(_mark: LampMark) {
	}
}
