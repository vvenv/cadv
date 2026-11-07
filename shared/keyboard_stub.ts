/*
	Desktop / non-Adv stub: no physical keyboard.
*/

export type KeyStroke = {
	chars: string[];
	enter: boolean;
	del: boolean;
	shift: boolean;
	esc: boolean;
	up: boolean;
	down: boolean;
	left: boolean;
	right: boolean;
	fn: boolean;
	/** Fn+[ dims, Fn+] brightens. Desktop keys never set this. */
	bright: -1 | 0 | 1;
};

export type HeldState = {
	keys: { code: string | number }[];
	fn: boolean;
	shift: boolean;
	ctrl: boolean;
	alt: boolean;
	opt: boolean;
};

const HELD_EMPTY: HeldState = {
	keys: [],
	fn: false,
	shift: false,
	ctrl: false,
	alt: false,
	opt: false,
};

export class CardputerKeyboard {
	status = "KB n/a";
	get available(): boolean {
		return false;
	}
	close() {}
	poll(): KeyStroke | null {
		return null;
	}
	pollHeld(): HeldState | null {
		return null;
	}
	get held(): HeldState {
		return HELD_EMPTY;
	}
}
