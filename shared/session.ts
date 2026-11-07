/*
	Key filter shared by every firmware except the BLE keyboard,
	which must still send the key that wakes the panel.
*/

import type { KeyStroke } from "keyboard";
import type { Power } from "power";

/**
	Idle check plus brightness. Returns the stroke the app should handle.
	A key that only wakes a blank or dimmed panel is consumed.
*/
export function acceptStroke(power: Power, stroke: KeyStroke | null, swallowWake = true): KeyStroke | null {
	power.tick();
	if (!stroke)
		return null;
	if (stroke.bright) {
		power.bump(stroke.bright);
		power.activity();
		return null;
	}
	const woke = power.activity();
	if (woke && swallowWake)
		return null;
	return stroke;
}

export function titleWithPower(power: Power, title: string): string {
	const banner = power.banner();
	if (!banner)
		return title;
	if (!title)
		return banner;
	return banner + " " + title;
}
