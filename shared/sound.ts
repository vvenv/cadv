/*
	Cardputer-Adv speaker: ES8311 (I2C 0x18) + I2S AudioOut Tone.
	Pins match M5Unified: BCK=41 WS=43 DOUT=42; codec on In_I2C SDA=8 SCL=9.
*/

import AudioOut from "pins/audioout";
import SMBus from "embedded:io/smbus";
import config from "mc/config";
import { audioVolume, VOL_DEFAULT } from "volume";

const SAMPLE_RATE = 16000;
const ES8311_ADDR = 0x18;
const REG_DAC_VOL = 0x32;

// M5Unified _speaker_enabled_cb_cardputer_adv bulk init
const ES8311_ON: number[][] = [
	[0x00, 0x80],
	[0x01, 0xb5],
	[0x02, 0x18],
	[0x0d, 0x01],
	[0x12, 0x00],
	[0x13, 0x10],
	[REG_DAC_VOL, 0xbf],
	[0x37, 0x08],
];

/*
	ADC path. 0x01 = 0xBA selects MCLK from BCLK; the speaker block above
	leaves 0xB5, and the ADC stays silent with that clock. ASDOUT is GPIO46.
*/
const ES8311_MIC: number[][] = [
	[0x01, 0xba],
	[0x09, 0x0c],
	[0x0e, 0x02],
	[0x14, 0x1a],
	[0x15, 0x00],
	[0x17, 0xbf],
	[0x1c, 0x6a],
];

/** Program the codec and release the bus. The chip keeps the setup. */
export function writeCodec(mic: boolean) {
	const pins = readI2cPins();
	if (!pins)
		return;
	let bus: SMBus | undefined;
	try {
		bus = new SMBus({
			hz: 400_000,
			address: ES8311_ADDR,
			data: pins.sda,
			clock: pins.scl,
		});
		for (const [reg, val] of ES8311_ON)
			bus.writeUint8(reg, val);
		if (mic) {
			for (const [reg, val] of ES8311_MIC)
				bus.writeUint8(reg, val);
		}
	}
	catch {
		/* no codec on the desktop, or the bus is busy */
	}
	try { bus?.close(); } catch { /* */ }
}

type Tone = { hz: number; ms: number };

function readI2cPins(): { sda: number; scl: number } | null {
	const root = config as Record<string, unknown>;
	const kb = root.keyboard;
	if (!kb || typeof kb !== "object")
		return null;
	const o = kb as Record<string, unknown>;
	if (typeof o.sda !== "number" || typeof o.scl !== "number")
		return null;
	return { sda: o.sda, scl: o.scl };
}

export class ClockSound {
	#audio: InstanceType<typeof AudioOut> | undefined;
	#codec: SMBus | undefined;
	#ready = false;
	#level = VOL_DEFAULT;
	status = "AU?";

	constructor() {
		try {
			this.#initCodec();
			this.#audio = new AudioOut({
				sampleRate: SAMPLE_RATE,
				bitsPerSample: 16,
				numChannels: 1,
				streams: 1,
			});
			this.setVolume(this.#level);
			this.#audio.start();
			this.#ready = true;
			this.status = "AU ok";
		}
		catch {
			this.status = "AU fail";
			this.close();
		}
	}

	get available(): boolean {
		return this.#ready;
	}

	close() {
		try { this.#audio?.stop(); } catch { /* */ }
		try { this.#audio?.close(); } catch { /* */ }
		try { this.#codec?.close(); } catch { /* */ }
		this.#audio = undefined;
		this.#codec = undefined;
		this.#ready = false;
	}

	/** UI level 0..10 → AudioOut + ES8311 DAC. */
	setVolume(level: number) {
		this.#level = level;
		if (!this.#audio)
			return;
		try {
			this.#audio.enqueue(0, AudioOut.Volume, audioVolume(level));
		}
		catch {
			/* */
		}
		// ES8311 DAC: 0xBF ≈ 0 dB; step down ~3 counts per UI level from max
		if (this.#codec) {
			const dac = level <= 0 ? 0x00 : Math.min(0xbf, 0x80 + level * 6);
			try {
				this.#codec.writeUint8(REG_DAC_VOL, dac);
			}
			catch {
				/* */
			}
		}
	}

	/** Short UI click. */
	click() {
		this.play([{ hz: 1200, ms: 40 }]);
	}

	/** Per-second tick (soft, short). */
	tick() {
		this.play([{ hz: 1800, ms: 18 }]);
	}

	/** Hourly chime (short ascending triad). */
	hourlyChime() {
		this.play([
			{ hz: 880, ms: 120 },
			{ hz: 1100, ms: 120 },
			{ hz: 1320, ms: 180 },
		]);
	}

	/** Alarm ring (longer repeating motif). */
	alarmChime() {
		this.play([
			{ hz: 880, ms: 160 },
			{ hz: 1175, ms: 160 },
			{ hz: 880, ms: 160 },
			{ hz: 1175, ms: 160 },
			{ hz: 1319, ms: 280 },
			{ hz: 988, ms: 220 },
		]);
	}

	/** Turn the ADC on without dropping the speaker path. */
	enableMic() {
		if (!this.#codec)
			return;
		for (const [reg, val] of ES8311_MIC) {
			try {
				this.#codec.writeUint8(reg, val);
			}
			catch {
				/* */
			}
		}
	}

	play(tones: Tone[]) {
		if (!this.#ready || !this.#audio)
			return;
		const audio = this.#audio;
		try {
			audio.enqueue(0, AudioOut.Flush);
			audio.enqueue(0, AudioOut.Volume, audioVolume(this.#level));
			for (const t of tones) {
				const samples = Math.max(1, Math.floor((SAMPLE_RATE * t.ms) / 1000));
				audio.enqueue(0, AudioOut.Tone, t.hz, samples);
			}
			audio.start();
		}
		catch {
			/* ignore underrun / closed */
		}
	}

	#initCodec() {
		const pins = readI2cPins();
		if (!pins)
			throw new Error("no i2c");
		const bus = this.#codec = new SMBus({
			hz: 400_000,
			address: ES8311_ADDR,
			data: pins.sda,
			clock: pins.scl,
		});
		for (const [reg, val] of ES8311_ON)
			bus.writeUint8(reg, val);
	}
}
