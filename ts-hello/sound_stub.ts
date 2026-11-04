/*
	Desktop stub: no speaker.
*/

export class ClockSound {
	status = "AU n/a";
	get available(): boolean {
		return false;
	}
	close() {}
	setVolume(_level: number) {}
	click() {}
	tick() {}
	hourlyChime() {}
	play(_tones: { hz: number; ms: number }[]) {}
}
