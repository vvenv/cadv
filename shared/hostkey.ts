import type { KeyStroke } from "keyboard";

function stroke(
	chars: string[],
	enter: boolean,
	del: boolean,
	esc: boolean,
	up: boolean,
	down: boolean,
	left: boolean,
	right: boolean,
): KeyStroke {
	return { chars, enter, del, shift: false, esc, up, down, left, right, fn: false };
}

/** Desktop simulator keys. Hardware polling owns the keypad when it is up. */
export function hostStroke(key: string): KeyStroke | null {
	if (key === "\r" || key === "\n")
		return stroke([], true, false, false, false, false, false, false);
	if (key === "\u001b")
		return stroke([], false, false, true, false, false, false, false);
	if (key === "\u007f" || key === "\b")
		return stroke([], false, true, false, false, false, false, false);
	if (key === "\uf700")
		return stroke([], false, false, false, true, false, false, false);
	if (key === "\uf701")
		return stroke([], false, false, false, false, true, false, false);
	if (key === "\uf702")
		return stroke([], false, false, false, false, false, true, false);
	if (key === "\uf703")
		return stroke([], false, false, false, false, false, false, true);
	if (key.length === 1 && key >= " " && key <= "~")
		return stroke([key], false, false, false, false, false, false, false);
	return null;
}
