/*
	cadv/rec/*.wav on the card. The launcher ignores this subdirectory.
	Import the volume inside the call. Its body uses device natives, and the
	image link runs this module on the host.
*/

import Modules from "modules";
import type { Directory, File } from "embedded:storage/files";

const DIR = "rec";

function volume(): Directory {
	return Modules.importNow<Directory>("embedded:storage/files");
}

/* Missing names do not throw from status(); mode is 0. Create them. */
function ensureDir(parent: Directory, name: string): Directory | null {
	let isDir = false;
	let isFile = false;
	try {
		const st = parent.status(name);
		isDir = st.isDirectory();
		isFile = st.isFile();
	}
	catch {
		isDir = false;
	}
	if (isFile)
		return null;
	if (!isDir)
		parent.createDirectory(name);
	return parent.openDirectory({ path: name });
}

export function openClips(): Directory | null {
	try {
		const root = volume();
		const home = ensureDir(root, "cadv");
		if (!home)
			return null;
		return ensureDir(home, DIR);
	}
	catch {
		return null;
	}
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
