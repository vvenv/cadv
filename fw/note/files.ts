/*
	cadv/*.txt on the card. Volume access lives in shared/cardfs.
*/

import type { Directory, File } from "embedded:storage/files";
import { openCardDir } from "cardfs";

export type NoteFile = { name: string; size: number; text: boolean };

export function openHome(): Directory | null {
	return openCardDir(["cadv"], true);
}

export function listFiles(dir: Directory): NoteFile[] {
	const out: NoteFile[] = [];
	try {
		for (const name of dir.scan()) {
			if (name.indexOf("/") >= 0)
				continue;
			try {
				const st = dir.status(name);
				if (!st.isFile())
					continue;
				out.push({ name, size: st.size, text: name.endsWith(".txt") });
			}
			catch {
				/* skip */
			}
		}
	}
	catch {
		return out;
	}
	out.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	return out;
}

/** Largest .txt the editor opens. */
export const MAX_TEXT_BYTES = 4000;

/*
	Text for the editor, or null when it cannot round-trip: too large,
	unreadable, or bytes this decoder drops (4-byte UTF-8, stray bytes, NUL).
	Saving a null-read file would destroy it, so the caller must not edit it.
*/
export function readText(dir: Directory, name: string): string | null {
	let file: File | null = null;
	try {
		file = dir.openFile({ path: name, mode: "r" });
		const size = file.status().size;
		if (typeof size !== "number" || size > MAX_TEXT_BYTES)
			return null;
		if (size <= 0)
			return "";
		const buf = file.read(size, 0);
		if (!buf || buf.byteLength !== size)
			return null;
		const text = utf8(buf);
		return utf8Length(text) === size ? text : null;
	}
	catch {
		return null;
	}
	finally {
		try { file?.close(); } catch { /* */ }
	}
}

export function writeText(dir: Directory, name: string, text: string) {
	const file: File = dir.openFile({ path: name, mode: "w" });
	try {
		file.write(utf8Bytes(text), 0);
	}
	finally {
		file.close();
	}
}

export function nextName(files: NoteFile[]): string {
	let n = 0;
	for (let i = 0; i < files.length; i++) {
		const v = parseInt(files[i].name, 10);
		if (files[i].name.endsWith(".txt") && v === v && v > n)
			n = v;
	}
	const id = n + 1;
	const text = id < 1000 ? String(1000 + id).slice(1) : String(id);
	return text + ".txt";
}

function utf8(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let out = "";
	for (let i = 0; i < bytes.length; ) {
		const c = bytes[i];
		if (c === 0)
			break;
		if (c < 0x80) {
			out += String.fromCharCode(c);
			i++;
		}
		else if ((c & 0xe0) === 0xc0 && i + 1 < bytes.length) {
			out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
			i += 2;
		}
		else if ((c & 0xf0) === 0xe0 && i + 2 < bytes.length) {
			out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
			i += 3;
		}
		else
			i++;
	}
	return out;
}

function utf8Bytes(text: string): Uint8Array {
	const bytes: number[] = [];
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c < 0x80)
			bytes.push(c);
		else if (c < 0x800)
			bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
		else
			bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
	}
	return new Uint8Array(bytes);
}

export function utf8Length(text: string): number {
	return utf8Bytes(text).length;
}
