/*
	Cardputer-Adv microSD over SPI2, separate from the LCD on SPI3.
	CS 12, MOSI 14, CLK 40, MISO 39. Mount point /sdcard, never formatted.

	loadCatalog() walks every directory and opens every file.
	openRead() / readAt() are the chunked reads a later firmware loader uses.
*/

import Modules from "modules";
import type { Directory, File } from "embedded:storage/files";

const MAX_ENTRIES = 400;
const MAX_DEPTH = 12;
const PROBE = 64;
const READ_CHUNK = 1024;

/** Interactive Enter reads at most this much. A loader can pass a larger cap. */
export const READ_MAX = 256 * 1024;

export type SdEntry = {
	path: string;
	directory: boolean;
	size: number;
	error: string;
};

export type SdCatalog = {
	root: Directory | null;
	error: string;
	entries: SdEntry[];
	truncated: boolean;
};

function errorText(e: unknown): string {
	if (typeof e === "string" && e)
		return e;
	if (e && typeof e === "object" && "message" in e) {
		const message = (e as { message?: unknown }).message;
		if (typeof message === "string" && message)
			return message;
	}
	return "读卡失败";
}

function byName(a: string, b: string): number {
	if (a < b)
		return -1;
	if (a > b)
		return 1;
	return 0;
}

function isLink(st: { isSymbolicLink?: () => boolean }): boolean {
	return typeof st.isSymbolicLink === "function" && st.isSymbolicLink();
}

/** Open a file for reading. Caller closes it. */
export function openRead(root: Directory, path: string): File {
	return root.openFile({ path, mode: "r" });
}

/** Read `length` bytes at `offset`. Short reads return a shorter buffer. */
export function readAt(root: Directory, path: string, offset: number, length: number): ArrayBuffer {
	if (length <= 0)
		return new ArrayBuffer(0);
	const file = openRead(root, path);
	try {
		return file.read(length, offset);
	}
	finally {
		file.close();
	}
}

/** Read from the start, up to `maxBytes`. `size` is the file length on the card. */
export function readFile(root: Directory, path: string, maxBytes: number): { size: number; read: number } {
	const file = openRead(root, path);
	try {
		const size = file.status().size;
		let budget = size;
		if (maxBytes >= 0 && budget > maxBytes)
			budget = maxBytes;
		let offset = 0;
		while (offset < budget) {
			let n = budget - offset;
			if (n > READ_CHUNK)
				n = READ_CHUNK;
			const got = file.read(n, offset).byteLength;
			if (got <= 0)
				break;
			offset += got;
		}
		return { size, read: offset };
	}
	finally {
		file.close();
	}
}

function probe(root: Directory, path: string): string {
	try {
		const got = readFile(root, path, PROBE);
		if (got.size > 0 && got.read <= 0)
			return "空读";
		return "";
	}
	catch (e) {
		return errorText(e);
	}
}

function walk(root: Directory, dir: Directory, prefix: string, out: SdEntry[], depth: number): boolean {
	if (depth > MAX_DEPTH)
		return false;
	const names: string[] = [];
	for (const name of dir.scan()) {
		if (name && name.indexOf("/") < 0 && name.indexOf("\\") < 0)
			names.push(name);
	}
	names.sort(byName);
	for (let i = 0; i < names.length; i++) {
		if (out.length >= MAX_ENTRIES)
			return false;
		const name = names[i];
		const path = prefix.length ? prefix + "/" + name : name;
		let st;
		try {
			st = dir.status(name);
		}
		catch (e) {
			out.push({ path, directory: false, size: 0, error: errorText(e) });
			continue;
		}
		if (st.isDirectory() && !isLink(st)) {
			out.push({ path, directory: true, size: 0, error: "" });
			const child = dir.openDirectory({ path: name });
			try {
				if (!walk(root, child, path, out, depth + 1))
					return false;
			}
			finally {
				child.close();
			}
			continue;
		}
		const size = typeof st.size === "number" ? st.size : 0;
		out.push({ path, directory: false, size, error: probe(root, path) });
	}
	return true;
}

export function loadCatalog(): SdCatalog {
	let root: Directory;
	try {
		root = Modules.importNow<Directory>("embedded:storage/files");
	}
	catch (e) {
		const error = errorText(e);
		trace(`sd mount: ${error}\n`);
		return { root: null, error, entries: [], truncated: false };
	}
	if (!root || typeof root.scan !== "function")
		return { root: null, error: "无文件接口", entries: [], truncated: false };

	const entries: SdEntry[] = [];
	let truncated = false;
	let error = "";
	try {
		truncated = !walk(root, root, "", entries, 0);
	}
	catch (e) {
		error = errorText(e);
		truncated = true;
	}
	let files = 0;
	let dirs = 0;
	for (let i = 0; i < entries.length; i++) {
		if (entries[i].directory)
			dirs++;
		else
			files++;
	}
	trace(`sd ${files} files, ${dirs} dirs${truncated ? ", truncated" : ""}${error ? ", " + error : ""}\n`);
	return { root, error, entries, truncated };
}
