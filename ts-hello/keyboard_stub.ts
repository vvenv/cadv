/*
	Desktop / non-Adv stub: no physical keyboard.
*/

export type KeyStroke = {
	chars: string[];
	enter: boolean;
	del: boolean;
	shift: boolean;
	esc: boolean;
};

export class CardputerKeyboard {
	get available(): boolean {
		return false;
	}
	close() {}
	poll(): KeyStroke | null {
		return null;
	}
}
