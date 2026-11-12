/*
	ESP32 side of the firmware switch. The Mac build uses boot_stub.ts.
*/

import Timer from "timer";

/** Seconds an app must run before it counts as started (see boot.c). */
const CONFIRM_MS = 3000;

const installer = Object.freeze({
	begin(size) { return native("xs_ota_begin").call(this, size); },
	write(chunk) { return native("xs_ota_write").call(this, chunk); },
	finish() { return native("xs_ota_end").call(this); },
	abort() { return native("xs_ota_abort").call(this); },
}, true);

export function openInstaller() {
	return installer;
}

export function bootLauncher() {
	return native("xs_boot_launcher").call(this);
}

export function bootInstalled(tail, size) {
	return native("xs_boot_installed").call(this, tail, size);
}

export function confirmBoot(ms = CONFIRM_MS) {
	const done = () => native("xs_boot_confirm").call(this);
	if (ms > 0)
		Timer.set(done, ms);
	else
		done();
}

export function bootCrashed() {
	return native("xs_boot_crashed").call(this);
}
