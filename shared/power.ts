/*
	Backlight on GPIO38 (active high, LEDC 0..1023) and the cell on GPIO10.
	Four brightness steps persist in Preference. Idle dims or blanks.
	The ST7789 driver only has a static GPIO backlight (on after the first
	frame, no brightness setter). shared/manifest.json therefore does not
	set ili9341 backlight_pin, so this PWM is the only owner of GPIO38.
	That pin is also the Stamp-S3A LED rail. The pixel is driven from lamp.ts.
*/

import Analog from "embedded:io/analog";
import PWM from "pins/pwm";
import Preference from "preference";
import Timer from "timer";
import { batteryLow, batteryShort } from "battery";
import { Lamp } from "lamp";

/** App status. "off" falls back to amber when the cell is low and the rail is on. */
export type LampMark = "off" | "rec" | "scan";

const PREF = "power";
const LEVELS = [180, 420, 720, 1023];
const IDLE_MS = 30_000;
const DIM_DUTY = 70;
const PIN_ADC = 10;
const PIN_BL = 38;
const ADC_FULL_MV = 2450;
const BATT_MS = 2000;

export type IdleKind = "dim" | "blank";

function readLevel(): number {
	try {
		const v = Preference.get(PREF, "level");
		let n = 3;
		if (typeof v === "number")
			n = v;
		else if (typeof v === "string")
			n = parseInt(v, 10);
		if (n !== n || n < 0)
			n = 3;
		if (n > 3)
			n = 3;
		return n | 0;
	}
	catch {
		return 3;
	}
}

export class Power {
	kind: IdleKind;
	#level = 3;
	#pwm: InstanceType<typeof PWM> | undefined;
	#adc: InstanceType<typeof Analog> | undefined;
	#adcDead = false;
	#mv = -1;
	#mvAt = 0;
	#activeAt = 0;
	#idle = false;
	#note = "";
	#lamp: Lamp | undefined;
	#mark: LampMark = "off";
	#lit = -1;
	#railOn = false;
	#again: Timer | undefined;

	constructor(kind: IdleKind) {
		this.kind = kind;
		this.#level = readLevel();
		this.#activeAt = Date.now();
		try {
			this.#pwm = new PWM({ pin: PIN_BL });
		}
		catch {
			this.#pwm = undefined;
		}
		this.#lamp = new Lamp();
		this.#apply();
		this.#readBatt();
		this.#paintLamp();
	}

	tick() {
		this.#readBatt();
		if (!this.#idle && Date.now() - this.#activeAt >= IDLE_MS) {
			this.#idle = true;
			this.#apply();
			return;
		}
		this.#paintLamp();
	}

	/** Recording is red, a running scan is blue. "off" returns to the low-battery amber. */
	lamp(mark: LampMark) {
		if (mark === this.#mark)
			return;
		this.#mark = mark;
		this.#paintLamp();
	}

	/** True only on the transition out of idle. */
	activity(): boolean {
		this.#activeAt = Date.now();
		if (!this.#idle)
			return false;
		this.#idle = false;
		this.#apply();
		return true;
	}

	bump(dir: -1 | 1): string {
		let n = this.#level + dir;
		if (n < 0)
			n = 0;
		if (n > 3)
			n = 3;
		if (n !== this.#level) {
			this.#level = n;
			try {
				Preference.set(PREF, "level", n);
			}
			catch {
				/* */
			}
			this.#apply();
		}
		this.#note = "亮度 " + (n + 1);
		return this.#note;
	}

	takeNote(): string {
		const note = this.#note;
		this.#note = "";
		return note;
	}

	banner(): string {
		this.#readBatt();
		return batteryLow(this.#mv) ? "低电" : "";
	}

	short(): string {
		this.#readBatt();
		return batteryShort(this.#mv);
	}

	/** 1..4, matching the saved step. */
	step(): number {
		return this.#level + 1;
	}

	millivolts(): number {
		this.#readBatt();
		return this.#mv;
	}

	#duty(): number {
		if (this.#idle)
			return this.kind === "blank" ? 0 : DIM_DUTY;
		return LEVELS[this.#level];
	}

	#apply() {
		const duty = this.#duty();
		const on = !this.#pwm || duty > 0;
		if (this.#pwm) {
			try {
				this.#pwm.write(duty);
			}
			catch {
				/* */
			}
		}
		const rose = on && !this.#railOn;
		this.#railOn = on;
		this.#paintLamp(rose || !on);
		if (!on) {
			Timer.clear(this.#again);
			this.#again = undefined;
			return;
		}
		if (!rose)
			return;
		Timer.clear(this.#again);
		this.#again = Timer.set(() => {
			this.#again = undefined;
			this.#paintLamp(true);
		}, 30);
	}

	#paintLamp(force = false) {
		const lamp = this.#lamp;
		if (!lamp)
			return;
		let key = 0;
		if (this.#railOn) {
			if (this.#mark === "rec")
				key = 1;
			else if (this.#mark === "scan")
				key = 2;
			else if (batteryLow(this.#mv))
				key = 3;
		}
		if (!force && key === this.#lit)
			return;
		this.#lit = key;
		if (key === 1)
			lamp.show(255, 0, 0, force);
		else if (key === 2)
			lamp.show(0, 40, 255, force);
		else if (key === 3)
			lamp.show(255, 80, 0, force);
		else
			lamp.show(0, 0, 0, force);
	}

	#readBatt() {
		const now = Date.now();
		if (this.#mvAt && now - this.#mvAt < BATT_MS)
			return;
		this.#mvAt = now;
		if (this.#adcDead)
			return;
		try {
			if (!this.#adc) {
				const Ctor = Analog as unknown as new (options: object) => InstanceType<typeof Analog>;
				this.#adc = new Ctor({ pin: PIN_ADC, esp32: { attenuation: 12 } });
			}
			let sum = 0;
			let n = 0;
			for (let i = 0; i < 8; i++) {
				const raw = this.#adc.read();
				if (typeof raw === "number" && raw >= 0) {
					sum += raw;
					n++;
				}
			}
			if (!n)
				return;
			const pinMv = Math.round((sum / n) * ADC_FULL_MV / 4095);
			this.#mv = pinMv * 2;
		}
		catch {
			this.#adcDead = true;
			this.#adc = undefined;
			this.#mv = -1;
		}
	}
}
