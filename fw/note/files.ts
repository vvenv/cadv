/*
	Notes live in cadv/note/*.txt. cadv/ itself holds firmware images and
	their one-line <id>.txt labels, so the editor must never list or touch it.
	Numbered notes left in cadv/ by older builds are moved in on open.
	Volume access lives in shared/cardfs.
*/

import type { Directory, File } from "embedded:storage/files";
import { closeQuiet, openCardDir } from "cardfs";

export type NoteFile = { name: string; size: number; preview: string };

/** Largest .txt the editor opens. */
export const MAX_TEXT_BYTES = 4000;

const PREVIEW_BYTES = 96;

export function openHome(): Directory | null {
	const dir = openCardDir(["cadv", "note"], true);
	if (dir)
		migrateOld(dir);
	return dir;
}

/** Move cadv/NNN.txt (older builds kept notes beside the firmware) into cadv/note/. */
function migrateOld(home: Directory) {
	const parent = openCardDir(["cadv"]);
	if (!parent)
		return;
	try {
		const names: string[] = [];
		for (const name of parent.scan()) {
			if (/^\d+\.txt$/.test(name))
				names.push(name);
		}
		for (const name of names) {
			try {
				let exists = false;
				try {
					exists = home.status(name).isFile();
				}
				catch {
					exists = false;
				}
				parent.move(name, exists ? "old-" + name : name, home);
			}
			catch {
				/* leave it */
			}
		}
	}
	catch {
		/* */
	}
	finally {
		closeQuiet(parent);
	}
}

export function listFiles(dir: Directory): NoteFile[] {
	const out: NoteFile[] = [];
	try {
		for (const name of dir.scan()) {
			if (name.indexOf("/") >= 0 || !name.endsWith(".txt") || name.charAt(0) === ".")
				continue;
			try {
				const st = dir.status(name);
				if (!st.isFile())
					continue;
				out.push({ name, size: st.size, preview: "" });
			}
			catch {
				/* skip */
			}
		}
	}
	catch {
		/* keep what we have */
	}
	out.sort((a, b) => a.name < b.name ? 1 : a.name > b.name ? -1 : 0);
	for (const f of out)
		f.preview = readPreview(dir, f.name, f.size);
	return out;
}

/** First non-blank line from the head of the file. */
function readPreview(dir: Directory, name: string, size: number): string {
	if (size <= 0)
		return "";
	let file: File | null = null;
	try {
		file = dir.openFile({ path: name, mode: "r" });
		const buf = file.read(Math.min(size, PREVIEW_BYTES), 0);
		const lines = utf8(buf).split("\n");
		for (const line of lines) {
			const t = line.replace(/\r/g, "").trim();
			if (t)
				return t;
		}
		return "";
	}
	catch {
		return "";
	}
	finally {
		closeQuiet(file);
	}
}

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
		closeQuiet(file);
	}
}

/*
	Write to a scratch file, then move it over the note, so a pulled card or
	a dead battery mid-write leaves the old note intact. Throws on failure.
*/
export function writeText(dir: Directory, name: string, text: string) {
	const tmp = ".save.tmp";
	const file: File = dir.openFile({ path: tmp, mode: "w" });
	try {
		file.write(utf8Bytes(text), 0);
		file.flush();
	}
	finally {
		file.close();
	}
	dir.move(tmp, name);
}

export function nextName(files: NoteFile[]): string {
	let n = 0;
	for (let i = 0; i < files.length; i++) {
		const v = parseInt(files[i].name, 10);
		if (v === v && v > n)
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
	const bytes = new Uint8Array(utf8Length(text));
	let o = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c < 0x80)
			bytes[o++] = c;
		else if (c < 0x800) {
			bytes[o++] = 0xc0 | (c >> 6);
			bytes[o++] = 0x80 | (c & 0x3f);
		}
		else {
			bytes[o++] = 0xe0 | (c >> 12);
			bytes[o++] = 0x80 | ((c >> 6) & 0x3f);
			bytes[o++] = 0x80 | (c & 0x3f);
		}
	}
	return bytes;
}

export function utf8Length(text: string): number {
	let n = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
	}
	return n;
}
