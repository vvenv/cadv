/*
	cadv/rec/*.wav on the card. The launcher ignores this subdirectory.
*/

import root, { type Directory, type File } from "embedded:storage/files";

const DIR = "rec";

export function openClips(): Directory | null {
	try {
		let home: Directory;
		try {
			const st = root.status("cadv");
			if (!st.isDirectory())
				return null;
			home = root.openDirectory({ path: "cadv" });
		}
		catch {
			root.createDirectory("cadv");
			home = root.openDirectory({ path: "cadv" });
		}
		try {
			home.status(DIR);
		}
		catch {
			home.createDirectory(DIR);
		}
		return home.openDirectory({ path: DIR });
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
