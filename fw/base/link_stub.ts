/*
	Desktop stand-in. The USB link only exists on the device.
*/

export interface LinkEvent {
	phase: "recv" | "done" | "err";
	name: string;
	got: number;
	total: number;
	message: string;
}

export function pollLink(): LinkEvent | null {
	return null;
}

export function setLinkBusy(_busy: boolean): void {
}
