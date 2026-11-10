/*
	SD card helpers shared by the firmwares that keep files under cadv/.
	Import the volume inside each call: the image link runs modules on the
	host, where the file natives are stubs.
*/

import Modules from "modules";
import type { Directory, File } from "embedded:storage/files";

/** The card's root directory, or null when no card / no file natives. */
export function cardVolume(): Directory | null {
	try {
		return Modules.importNow<Directory>("embedded:storage/files");
	}
	catch {
		return null;
	}
}

export function closeQuiet(handle: Directory | File | null | undefined): void {
	if (!handle)
		return;
	try {
		handle.close();
	}
	catch {
		/* */
	}
}

/*
	Open parent/name, creating it when missing. Null when name is a file.
	Missing names do not throw from status(); mode is 0. May throw on I/O.
*/
export function ensureDir(parent: Directory, name: string): Directory | null {
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

/**
	Open a nested directory from the card root, e.g. ["cadv", "words"].
	`create` makes missing levels. Intermediate handles are closed; the caller
	closes the result. Null on any failure; never throws.
*/
export function openCardDir(path: readonly string[], create = false): Directory | null {
	const root = cardVolume();
	if (!root || !path.length)
		return null;
	let dir: Directory | null = null;
	try {
		for (let i = 0; i < path.length; i++) {
			const parent: Directory = dir ?? root;
			const next = create ? ensureDir(parent, path[i]) : parent.openDirectory({ path: path[i] });
			if (dir)
				closeQuiet(dir);
			dir = next;
			if (!dir)
				return null;
		}
		return dir;
	}
	catch {
		closeQuiet(dir);
		return null;
	}
}

export function u16(b: Uint8Array, at = 0): number {
	return b[at] | (b[at + 1] << 8);
}

export function u32(b: Uint8Array, at = 0): number {
	return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}

export type ByteSource = {
	readBytes(off: number, len: number): ArrayBuffer;
};

/*
	Random-access reads on a card file kept open across UI ticks. A pulled
	card must not throw into a Timer: the first failed or short read sets
	`failed`, and from then on every read returns zeros (empty strings and
	counts downstream). Owners check `failed` and drop or replace the pack.
*/
export class CardReader implements ByteSource {
	failed = false;
	#file: File | null;

	constructor(file: File) {
		this.#file = file;
	}

	readBytes(off: number, len: number): ArrayBuffer {
		const file = this.#file;
		if (!this.failed && file) {
			try {
				const got = file.read(len, off);
				if (got && got.byteLength === len)
					return got;
			}
			catch {
				/* */
			}
			this.failed = true;
		}
		return new ArrayBuffer(len);
	}

	close(): void {
		closeQuiet(this.#file);
		this.#file = null;
	}
}
