/*
	Stamp-S3A onboard LED. Data is GPIO21, GRB, one pixel.
	Power is the backlight rail on GPIO38. This module never drives that pin.
	A backlight duty of 0 leaves the LED unpowered; lower steps chop the same rail.
*/

import NeoPixel from "neopixel";

const PIN = 21;

export class Lamp {
	#px: NeoPixel | undefined;
	#dead = false;
	#rgb = -1;

	constructor() {
		try {
			this.#px = new NeoPixel({ pin: PIN, length: 1, order: "GRB" });
		}
		catch {
			this.#dead = true;
			this.#px = undefined;
		}
	}

	show(r: number, g: number, b: number, force = false) {
		if (this.#dead || !this.#px)
			return;
		const rgb = ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
		if (!force && rgb === this.#rgb)
			return;
		this.#rgb = rgb;
		try {
			const px = this.#px;
			px.fill(px.makeRGB(r, g, b));
			px.update();
		}
		catch {
			this.#dead = true;
		}
	}
}
