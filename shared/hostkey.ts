import type { KeyStroke } from "keyboard";

/** Desktop simulator keys. Hardware polling owns the keypad when it is up. */
export function hostStroke(key: string): KeyStroke | null {
	if (key === "\r" || key === "\n")
		return { chars: [], enter: true, del: false, shift: false, esc: false, up: false, down: false };
	if (key === "\u001b")
		return { chars: [], enter: false, del: false, shift: false, esc: true, up: false, down: false };
	if (key === "\u007f" || key === "\b")
		return { chars: [], enter: false, del: true, shift: false, esc: false, up: false, down: false };
	if (key === "\uf700")
		return { chars: [], enter: false, del: false, shift: false, esc: false, up: true, down: false };
	if (key === "\uf701")
		return { chars: [], enter: false, del: false, shift: false, esc: false, up: false, down: true };
	if (key.length === 1 && key >= " " && key <= "~")
		return { chars: [key], enter: false, del: false, shift: false, esc: false, up: false, down: false };
	return null;
}
