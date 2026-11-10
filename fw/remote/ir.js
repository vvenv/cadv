/*
	ESP32 side of the IR sender. The desktop build uses ir_stub.ts.
*/

export function irSend(pin, carrierHz, durations) {
	return native("xs_ir_send").call(this, pin, carrierHz, durations);
}

export function irClose() {
	return native("xs_ir_close").call(this);
}

export const irAvailable = true;
