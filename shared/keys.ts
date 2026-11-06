/*
	One key contract for every firmware.

	Back: BS, Esc, ←. ← is the simulator left arrow, or Fn+H on the board.
	Confirm: Enter or Space.
	Move: ↑↓ (simulator, or Fn+K / Fn+J), also j/k and ,/.
	Help: ? or /. Volume: - and =.

	Wi-Fi fields keep Space as a character; Enter still confirms.
	In a field, BS deletes first. Esc and ← leave the page.
*/

import type { KeyStroke } from "keyboard";
import { menuDirFromChars } from "list";

/** BS, Esc, or ←. */
export function isBack(stroke: KeyStroke): boolean {
	return stroke.esc || stroke.del || stroke.left;
}

/** Esc or ←. Does not delete a character. */
export function isPageBack(stroke: KeyStroke): boolean {
	return stroke.esc || stroke.left;
}

/** Enter or Space. */
export function isConfirm(stroke: KeyStroke): boolean {
	if (stroke.enter)
		return true;
	for (let i = 0; i < stroke.chars.length; i++) {
		if (stroke.chars[i] === " ")
			return true;
	}
	return false;
}

export function isHelp(stroke: KeyStroke): boolean {
	for (let i = 0; i < stroke.chars.length; i++) {
		const ch = stroke.chars[i];
		if (ch === "?" || ch === "/")
			return true;
	}
	return false;
}

/** -1 up, +1 down, 0 neither. Arrow flags win over letters. */
export function navDir(stroke: KeyStroke): -1 | 0 | 1 {
	if (stroke.up)
		return -1;
	if (stroke.down)
		return 1;
	return menuDirFromChars(stroke.chars);
}

/** Last -/= in the chord wins. */
export function volumeDelta(chars: string[]): -1 | 0 | 1 {
	let d: -1 | 0 | 1 = 0;
	for (let i = 0; i < chars.length; i++) {
		const ch = chars[i];
		if (ch === "-" || ch === "_")
			d = -1;
		else if (ch === "=" || ch === "+")
			d = 1;
	}
	return d;
}
