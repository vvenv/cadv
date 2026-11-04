/*
	Minimal Moddable + TypeScript hello for ESP32-S3 / Cardputer-Adv exploration.

	This does NOT drive the Cardputer screen or keyboard yet — only `trace`
	output (xsbug / serial). Display + TCA8418 wiring would be a later target.
*/

import Timer from "timer";

debugger;

const device: string = "Cardputer-Adv (ESP32-S3)";
const message: string = `Hello from TypeScript on ${device}`;

trace(message + "\n");

let ticks: number = 0;
Timer.repeat(() => {
	ticks += 1;
	trace(`tick ${ticks}\n`);
}, 1000);
