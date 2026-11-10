/*
	Theme presets. Mutates ink palette slots and bumps themeGen so lazy
	Styles rebuild. One theme for the whole device: Preference ("ui", "theme"),
	so Fn+T in any app carries over to the launcher and every other app.
	Older builds saved per firmware under (fw, "theme"); that is still read
	as a fallback until the first Fn+T writes the shared key.
*/

import {} from "piu/MC";
import Preference from "preference";
import {
	BG,
	setPalette,
	type Palette,
} from "ink";

export type ThemeId = "phosphor" | "paper" | "amber" | "ocean";

type ThemeDef = { id: ThemeId; label: string; palette: Palette };

const THEMES: ThemeDef[] = [
	{
		id: "phosphor",
		label: "phosphor",
		palette: {
			BG: "black",
			INK: "white",
			ON: "#39FF14",
			RED: "#FF2A2A",
			DIM: "#143214",
			MID: "#208F18",
			AMBER: "#FFB000",
			WELL: "#0E2C10",
		},
	},
	{
		id: "paper",
		label: "paper",
		palette: {
			BG: "#E8ECE4",
			INK: "#1A1A1A",
			ON: "#1B6B2A",
			RED: "#C62828",
			DIM: "#C5D0C0",
			MID: "#3D8B4F",
			AMBER: "#B86E00",
			WELL: "#D0D8CC",
		},
	},
	{
		id: "amber",
		label: "amber",
		palette: {
			BG: "black",
			INK: "#FFCC66",
			ON: "#FFB000",
			RED: "#FF5533",
			DIM: "#3A2810",
			MID: "#A87820",
			AMBER: "#FF9900",
			WELL: "#2A1C08",
		},
	},
	{
		id: "ocean",
		label: "ocean",
		palette: {
			BG: "#021526",
			INK: "#E8F4FF",
			ON: "#3DDCFF",
			RED: "#FF4D6A",
			DIM: "#0A3048",
			MID: "#1A7A9A",
			AMBER: "#FFB000",
			WELL: "#0A2840",
		},
	},
];

let themeGen = 0;
let currentId: ThemeId = "phosphor";
let boundFw = "";

export function themeGeneration(): number {
	return themeGen;
}

export function currentTheme(): ThemeId {
	return currentId;
}

export function themeLabel(id: ThemeId = currentId): string {
	for (let i = 0; i < THEMES.length; i++) {
		if (THEMES[i].id === id)
			return THEMES[i].label;
	}
	return id;
}

function findTheme(id: string): ThemeDef {
	for (let i = 0; i < THEMES.length; i++) {
		if (THEMES[i].id === id)
			return THEMES[i];
	}
	return THEMES[0];
}

export function applyTheme(id: ThemeId): void {
	const def = findTheme(id);
	currentId = def.id;
	setPalette(def.palette);
	themeGen += 1;
}

const PREF = "ui";
const PREF_KEY = "theme";

function readId(domain: string): ThemeId | "" {
	try {
		const v = Preference.get(domain, PREF_KEY);
		if (typeof v === "string" && v) {
			const def = findTheme(v);
			if (def.id === v)
				return def.id;
		}
	}
	catch {
		/* */
	}
	return "";
}

function readSaved(fw: string): ThemeId {
	const shared = readId(PREF);
	if (shared)
		return shared;
	const legacy = fw ? readId(fw) : "";
	return legacy || "phosphor";
}

function saveTheme(id: ThemeId): void {
	try {
		Preference.set(PREF, PREF_KEY, id);
	}
	catch {
		/* */
	}
}

/** Load the device theme (legacy per-fw value as fallback) and remember fw. */
export function bindFwTheme(fw: string): ThemeId {
	boundFw = fw;
	const id = readSaved(fw);
	applyTheme(id);
	return id;
}

export function boundFirmware(): string {
	return boundFw;
}

/** Cycle to the next preset and save it for every firmware. */
export function cycleFwTheme(fw?: string): ThemeId {
	const name = fw || boundFw;
	const cur = readSaved(name);
	let idx = 0;
	for (let i = 0; i < THEMES.length; i++) {
		if (THEMES[i].id === cur) {
			idx = i;
			break;
		}
	}
	const next = THEMES[(idx + 1) % THEMES.length];
	saveTheme(next.id);
	applyTheme(next.id);
	syncAppSkin();
	return next.id;
}

/*
	Every main.ts builds the application Skin once from BG. Ports repaint
	with the new palette, but bare Labels sit on that Skin, so swap it too;
	otherwise Fn+T leaves the old background until a reboot.
*/
function syncAppSkin(): void {
	try {
		const app = (globalThis as { application?: { skin: unknown } }).application;
		if (app)
			app.skin = new Skin({ fill: BG });
	}
	catch {
		/* no application yet (link time) */
	}
}
