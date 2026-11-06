/*
	Only the cadv/ directory on the card. The rest of a large card is never scanned.
	*.bin there are firmware images. A sibling <id>.txt is the one-line label.
	Known labels so the UI font includes them: 时间天气 单词拼写
*/

import Modules from "modules";
import type { Directory, File } from "embedded:storage/files";

export const CARD_DIR = "cadv";

export type SdEntry = {
	path: string;
	label: string;
	size: number;
	error: string;
};

export type SdCatalog = {
	root: Directory | null;
	error: string;
	entries: SdEntry[];
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

function utf8ToString(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let out = "";
	for (let i = 0; i < bytes.length; ) {
		const c = bytes[i];
		if (c === 0 || c === 10 || c === 13)
			break;
		if (c < 0x80) {
			out += String.fromCharCode(c);
			i += 1;
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
			i += 1;
	}
	return out;
}

function readLabel(dir: Directory, id: string): string {
	const path = id + ".txt";
	try {
		const st = dir.status(path);
		if (!st.isFile() || st.size <= 0 || st.size > 80)
			return id;
		const file = dir.openFile({ path, mode: "r" });
		try {
			const text = utf8ToString(file.read(st.size, 0)).trim();
			return text.length ? text : id;
		}
		finally {
			file.close();
		}
	}
	catch {
		return id;
	}
}

function ensureHome(volume: Directory): Directory {
	let isDir = false;
	let isFile = false;
	try {
		const st = volume.status(CARD_DIR);
		isDir = st.isDirectory();
		isFile = st.isFile();
	}
	catch {
		isDir = false;
	}
	if (isFile)
		throw new Error("cadv 不是目录");
	if (!isDir)
		volume.createDirectory(CARD_DIR);
	return volume.openDirectory({ path: CARD_DIR });
}

/** Open a file inside cadv/. Caller closes it. */
export function openRead(dir: Directory, path: string): File {
	return dir.openFile({ path, mode: "r" });
}

export function loadCatalog(): SdCatalog {
	let volume: Directory;
	try {
		volume = Modules.importNow<Directory>("embedded:storage/files");
	}
	catch (e) {
		const error = errorText(e);
		trace(`sd mount: ${error}\n`);
		return { root: null, error, entries: [] };
	}
	if (!volume || typeof volume.scan !== "function")
		return { root: null, error: "无文件接口", entries: [] };

	let home: Directory;
	try {
		home = ensureHome(volume);
	}
	catch (e) {
		const error = errorText(e);
		trace(`sd ${CARD_DIR}: ${error}\n`);
		return { root: null, error, entries: [] };
	}

	const names: string[] = [];
	try {
		for (const name of home.scan()) {
			if (name.length > 4 && name.endsWith(".bin") && name.indexOf("/") < 0)
				names.push(name);
		}
	}
	catch (e) {
		const error = errorText(e);
		trace(`sd scan: ${error}\n`);
		return { root: home, error, entries: [] };
	}
	names.sort(byName);

	const entries: SdEntry[] = [];
	for (let i = 0; i < names.length; i++) {
		const path = names[i];
		const id = path.slice(0, -4);
		try {
			const st = home.status(path);
			if (!st.isFile())
				continue;
			entries.push({
				path,
				label: readLabel(home, id),
				size: typeof st.size === "number" ? st.size : 0,
				error: "",
			});
		}
		catch (e) {
			entries.push({ path, label: id, size: 0, error: errorText(e) });
		}
	}
	trace(`sd ${CARD_DIR} ${entries.length} images\n`);
	return { root: home, error: "", entries };
}
