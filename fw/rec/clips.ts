/*
	cadv/rec/*.wav on the card. The launcher ignores this subdirectory.
	Volume access lives in shared/cardfs.
*/

import type { Directory, File } from "embedded:storage/files";
import { openCardDir } from "cardfs";

const DIR = "rec";

export function openClips(): Directory | null {
	return openCardDir(["cadv", DIR], true);
}

export function clipNames(dir: Directory): string[] {
	const names: string[] = [];
	try {
		for (const name of dir.scan()) {
			if (name.endsWith(".wav") && name.indexOf("/") < 0)
				names.push(name);
		}
	}
	catch {
		return names;
	}
	names.sort();
	return names;
}

/** PCM seconds from a WAV on the card (16 kHz mono 16-bit). */
export function clipSeconds(dir: Directory, name: string): number {
	try {
		const size = dir.status(name).size;
		if (typeof size !== "number" || size <= 44)
			return 0;
		return Math.floor((size - 44) / 32000);
	}
	catch {
		return 0;
	}
}

export function nextClip(names: string[]): string {
	let n = 0;
	for (let i = 0; i < names.length; i++) {
		const v = parseInt(names[i], 10);
		if (v === v && v > n)
			n = v;
	}
	const id = n + 1;
	const text = id < 1000 ? String(1000 + id).slice(1) : String(id);
	return text + ".wav";
}

export function openClip(dir: Directory, name: string, mode: "r" | "w"): File {
	return dir.openFile({ path: name, mode });
}
