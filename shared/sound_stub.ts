/*
	Desktop stub: no speaker.
*/

/** No codec on the desktop; callers treat false as 「无喇叭」. */
export function writeCodec(_mic: boolean): boolean {
	return false;
}

export function releaseMic(): boolean {
	return false;
}

export class ClockSound {
	status = "AU n/a";
	get available(): boolean {
		return false;
	}
	close() {}
	setVolume(_level: number) {}
	enableMic() {}
	click() {}
	tick() {}
	hourlyChime() {}
	alarmChime() {}
	play(_tones: { hz: number; ms: number }[]) {}
}
