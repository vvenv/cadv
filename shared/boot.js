/*
	ESP32 side of the firmware switch. The Mac build uses boot_stub.ts.
*/

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
