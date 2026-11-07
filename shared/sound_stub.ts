/*
	Desktop stub: no speaker.
*/

export function writeCodec(_mic: boolean) {}

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
