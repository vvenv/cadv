/*
	Per-firmware theme presets. Mutates ink palette slots and bumps themeGen
	so lazy Styles rebuild. Preference key is Preference.get(fw, "theme").
*/

import Preference from "preference";
import {
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

function readSaved(fw: string): ThemeId {
	if (!fw)
		return "phosphor";
	try {
		const v = Preference.get(fw, "theme");
		if (typeof v === "string" && v) {
			const def = findTheme(v);
			if (def.id === v)
				return def.id;
		}
	}
	catch {
		/* */
	}
	return "phosphor";
}

function saveTheme(fw: string, id: ThemeId): void {
	if (!fw)
		return;
	try {
		Preference.set(fw, "theme", id);
	}
	catch {
		/* */
	}
}

/** Load this firmware's saved theme and remember fw for Fn+T cycling. */
export function bindFwTheme(fw: string): ThemeId {
	boundFw = fw;
	const id = readSaved(fw);
	applyTheme(id);
	return id;
}

export function boundFirmware(): string {
	return boundFw;
}

/** Cycle to the next preset for the bound firmware (or `fw` if given). */
export function cycleFwTheme(fw?: string): ThemeId {
	const name = fw || boundFw;
	const cur = name ? readSaved(name) : currentId;
	let idx = 0;
	for (let i = 0; i < THEMES.length; i++) {
		if (THEMES[i].id === cur) {
			idx = i;
			break;
		}
	}
	const next = THEMES[(idx + 1) % THEMES.length];
	if (name)
		saveTheme(name, next.id);
	applyTheme(next.id);
	return next.id;
}
