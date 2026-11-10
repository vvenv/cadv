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

export type ThemeId =
	| "phosphor"
	| "amber"
	| "nixie"
	| "vfd"
	| "ocean"
	| "nord"
	| "dracula"
	| "solarized"
	| "vapor"
	| "gameboy"
	| "paper"
	| "porcelain"
	| "xuan"
	| "sakura";

/** label is shown in the Fn+T status flash; keep it 2-3 CJK chars. */
type ThemeDef = { id: ThemeId; label: string; palette: Palette };

/* Fn+T cycles in this order. Dark themes first, light ones after. */
const THEMES: ThemeDef[] = [
	{
		/* Green CRT phosphor (default). */
		id: "phosphor",
		label: "荧光绿",
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
		/* Amber monochrome terminal. */
		id: "amber",
		label: "琥珀",
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
		/* Neon-orange Nixie tube digits. */
		id: "nixie",
		label: "辉光管",
		palette: {
			BG: "black",
			INK: "#FFD2A8",
			ON: "#FF7A1A",
			RED: "#FF3B30",
			DIM: "#3A1A08",
			MID: "#B04A10",
			AMBER: "#FFC040",
			WELL: "#2A1206",
		},
	},
	{
		/* Cyan-green vacuum fluorescent display. */
		id: "vfd",
		label: "荧光管",
		palette: {
			BG: "#02080A",
			INK: "#CFFFF4",
			ON: "#2EFFD0",
			RED: "#FF4D6A",
			DIM: "#0A2E28",
			MID: "#17907A",
			AMBER: "#FFC14D",
			WELL: "#08221E",
		},
	},
	{
		/* Deep navy with cyan. */
		id: "ocean",
		label: "深海",
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
	{
		/* Nord: frosty arctic blue-grey. */
		id: "nord",
		label: "北境",
		palette: {
			BG: "#2E3440",
			INK: "#ECEFF4",
			ON: "#88C0D0",
			RED: "#BF616A",
			DIM: "#434C5E",
			MID: "#5E81AC",
			AMBER: "#EBCB8B",
			WELL: "#3B4252",
		},
	},
	{
		/* Dracula: dark violet, neon accents. */
		id: "dracula",
		label: "德古拉",
		palette: {
			BG: "#282A36",
			INK: "#F8F8F2",
			ON: "#50FA7B",
			RED: "#FF5555",
			DIM: "#3A3C4E",
			MID: "#BD93F9",
			AMBER: "#FFB86C",
			WELL: "#44475A",
		},
	},
	{
		/* Solarized dark. */
		id: "solarized",
		label: "日晒",
		palette: {
			BG: "#002B36",
			INK: "#EEE8D5",
			ON: "#2AA198",
			RED: "#DC322F",
			DIM: "#073642",
			MID: "#268BD2",
			AMBER: "#B58900",
			WELL: "#073642",
		},
	},
	{
		/* Vaporwave: purple dusk, cyan and pink. */
		id: "vapor",
		label: "蒸汽波",
		palette: {
			BG: "#1A0B2E",
			INK: "#FFD6F5",
			ON: "#01CDFE",
			RED: "#FF3864",
			DIM: "#2E1650",
			MID: "#B967FF",
			AMBER: "#FFFB96",
			WELL: "#26103F",
		},
	},
	{
		/* Four-shade green handheld LCD (red/amber added for status). */
		id: "gameboy",
		label: "掌机",
		palette: {
			BG: "#9BBC0F",
			INK: "#0F380F",
			ON: "#0F380F",
			RED: "#8A1C1C",
			DIM: "#8BAC0F",
			MID: "#306230",
			AMBER: "#5A3A00",
			WELL: "#8BAC0F",
		},
	},
	{
		/* Light grey-green paper. */
		id: "paper",
		label: "纸白",
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
		/* Blue-and-white porcelain. */
		id: "porcelain",
		label: "青花",
		palette: {
			BG: "#F3F5F7",
			INK: "#14213D",
			ON: "#1E4FA0",
			RED: "#C0392B",
			DIM: "#D9E1EA",
			MID: "#5A7FB8",
			AMBER: "#B8740A",
			WELL: "#E1E8F0",
		},
	},
	{
		/* Ink on xuan paper, cinnabar red. */
		id: "xuan",
		label: "水墨",
		palette: {
			BG: "#EFE6D2",
			INK: "#1A1A1A",
			ON: "#2A2A2A",
			RED: "#C23B22",
			DIM: "#DCD1B8",
			MID: "#6B6B6B",
			AMBER: "#9C6B1E",
			WELL: "#E3D8C0",
		},
	},
	{
		/* Cherry-blossom pink with leaf green. */
		id: "sakura",
		label: "樱花",
		palette: {
			BG: "#FFF0F3",
			INK: "#3A1F2B",
			ON: "#2F7D5B",
			RED: "#C62828",
			DIM: "#F5D5DE",
			MID: "#E68AA6",
			AMBER: "#C77700",
			WELL: "#F8E1E7",
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
