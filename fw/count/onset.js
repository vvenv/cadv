/*
	Native hit detector (onset.c). One detector at a time.
*/

export function onsetReset(thrDb, riseDb, minDb, releaseDb, gapMs, settleMs) {
	native("xs_onset_reset").call(this, thrDb, riseDb, minDb, releaseDb, gapMs, settleMs);
}

export function onsetFeed(buffer, byteOffset, samples) {
	return native("xs_onset_feed").call(this, buffer, byteOffset, samples);
}

export function onsetLevel() {
	return native("xs_onset_level").call(this);
}
