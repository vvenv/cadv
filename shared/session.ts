/*
	Key filter shared by every firmware except the BLE keyboard,
	which must still send the key that wakes the panel.
*/

import type { KeyStroke } from "keyboard";
import type { Power } from "power";
import { batteryLow, batteryPercent } from "battery";
import { type GlyphSpec, noteGlyph } from "ink";

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

/**
	Title text without the old "低电" prefix — pair with powerGlyph() so the
	battery icon carries the warning.
*/
export function titleWithPower(_power: Power, title: string): string {
	return title;
}

/** Low-battery glyph for title bars. Empty when the cell is fine / absent. */
export function powerGlyph(power: Power): GlyphSpec {
	const mv = power.millivolts();
	if (!batteryLow(mv))
		return { kind: "" };
	const pct = batteryPercent(mv);
	return { kind: "batt", level: pct === null ? 12 : pct };
}

/** Prefer an explicit status glyph; otherwise show the low-battery mark. */
export function titleGlyph(power: Power | null | undefined, status: string | GlyphSpec = ""): GlyphSpec {
	if (typeof status === "string") {
		const fromNote = noteGlyph(status);
		if (fromNote.kind)
			return fromNote;
	}
	else if (status.kind) {
		return status;
	}
	if (power)
		return powerGlyph(power);
	return { kind: "" };
}
