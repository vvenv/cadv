/*
	Desktop stand-in. The simulator has no Cardputer radio.
*/

export type LinkState = "wait" | "link" | "ready" | "sim" | "down";

export type RadioListener = {
	onStatus(state: LinkState): void;
	onCaps(on: boolean): void;
};

export class KeyboardRadio {
	get ready(): boolean {
		return false;
	}
	send(_report: Uint8Array) {
	}
	close() {
	}
}

export function openRadio(listener: RadioListener): KeyboardRadio {
	listener.onStatus("sim");
	return new KeyboardRadio();
}
