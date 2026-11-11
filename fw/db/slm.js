/*
	Native level meter core (slm.c). One meter at a time.
*/

export function slmReset(aWeight, tau, window, settle) {
	native("xs_slm_reset").call(this, aWeight, tau, window, settle);
}

export function slmFeed(buffer, byteOffset, samples, out) {
	return native("xs_slm_feed").call(this, buffer, byteOffset, samples, out);
}
