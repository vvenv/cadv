/*
	Desktop stand-in for pins/audioout (the ESP32 I2S mixer). The simulator
	has no speaker: sound_stub's writeCodec() already reports 「无喇叭」
	before playback gets here, and opening one throws into the same path.
*/

export default class AudioOut {
	static Flush = 2;
	static Callback = 3;
	static Volume = 4;
	static RawSamples = 5;
	static Tone = 6;

	callback: () => void = () => {};

	constructor(_options: object) {
		throw new Error("no audio out");
	}

	enqueue(..._args: unknown[]): void {}
	start(): void {}
	stop(): void {}
	close(): void {}
}
