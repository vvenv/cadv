/*
	Lexicon: flash Resource by default; optional SD packs under cadv/words/*.bin.
	Headword, Chinese gloss, phonetic. The ESP32 XS heap is 4928 slots and
	77KB; materializing the lists as JS arrays aborts before the first frame,
	so the backlight stays off. Reads below copy only a few bytes. Generated
	by scripts/gen-wordbank.mjs. Do not edit the binary.
*/

import Modules from "modules";
import Preference from "preference";
import Resource from "Resource";
import type { Directory, File } from "embedded:storage/files";

const BANK_STRIDE = 12;
const LEX_STRIDE = 20;
const HEADER = 16;
const MAGIC = 0x314b4257;
const SD_HOME = "cadv";
const SD_WORDS = "words";
const PREF = "words";
const PREF_SOURCE = "wordSource";

/** Built-in flash pack (闽教版小学). */
export const SOURCE_FLASH = "flash";

export type WordSource = { id: string; label: string };

type Src = {
	readBytes(off: number, len: number): ArrayBuffer;
};

type BankFile = {
	src: Src;
	banks: number;
	lex: number;
	lexAt: number;
};

type OpenState = {
	id: string;
	bank: BankFile;
	file: File | null;
};

function u16(b: Uint8Array): number {
	return b[0] | (b[1] << 8);
}

function u32(b: Uint8Array): number {
	return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
}

function read(src: Src, off: number, len: number): Uint8Array {
	return new Uint8Array(src.readBytes(off, len));
}

function fromResource(res: InstanceType<typeof Resource>): Src {
	return {
		readBytes(off: number, len: number): ArrayBuffer {
			return res.slice(off, off + len);
		},
	};
}

function fromFile(file: File): Src {
	return {
		readBytes(off: number, len: number): ArrayBuffer {
			return file.read(len, off);
		},
	};
}

function parse(src: Src): BankFile | null {
	const head = read(src, 0, HEADER);
	if (u32(head) !== MAGIC)
		return null;
	return {
		src,
		banks: u16(head.subarray(4, 6)),
		lex: u16(head.subarray(6, 8)),
		lexAt: u32(head.subarray(8, 12)),
	};
}

function closeQuiet(dir: Directory | File | null): void {
	if (!dir)
		return;
	try {
		dir.close();
	}
	catch {
		/* */
	}
}

function labelFor(id: string): string {
	if (!id || id === SOURCE_FLASH)
		return "内置";
	if (id === "junior")
		return "初中";
	return id;
}

function readPrefSource(): string {
	try {
		const v = Preference.get(PREF, PREF_SOURCE);
		if (typeof v === "string" && v.length > 0)
			return v;
	}
	catch {
		/* */
	}
	return SOURCE_FLASH;
}

function writePrefSource(id: string): void {
	try {
		Preference.set(PREF, PREF_SOURCE, id);
	}
	catch {
		/* */
	}
}

function byName(a: string, b: string): number {
	if (a < b)
		return -1;
	if (a > b)
		return 1;
	return 0;
}

function openVolume(): Directory | null {
	try {
		return Modules.importNow<Directory>("embedded:storage/files");
	}
	catch {
		return null;
	}
}

function tryOpenFlash(): OpenState | null {
	try {
		const bank = parse(fromResource(new Resource("wordbank.bin")));
		if (!bank)
			return null;
		return { id: SOURCE_FLASH, bank, file: null };
	}
	catch {
		return null;
	}
}

function tryOpenSd(id: string): OpenState | null {
	if (!id || id === SOURCE_FLASH)
		return null;
	const volume = openVolume();
	if (!volume)
		return null;
	let home: Directory | null = null;
	let words: Directory | null = null;
	let file: File | null = null;
	try {
		home = volume.openDirectory({ path: SD_HOME });
		words = home.openDirectory({ path: SD_WORDS });
		file = words.openFile({ path: id + ".bin", mode: "r" });
		const bank = parse(fromFile(file));
		if (!bank) {
			closeQuiet(file);
			return null;
		}
		// Keep the file open for slice reads; directory fds are independent.
		const kept = file;
		file = null;
		return { id, bank, file: kept };
	}
	catch {
		closeQuiet(file);
		return null;
	}
	finally {
		closeQuiet(words);
		closeQuiet(home);
	}
}

function tryOpen(id: string): OpenState | null {
	if (!id || id === SOURCE_FLASH)
		return tryOpenFlash();
	return tryOpenSd(id);
}

/*
	xsl preloads this module and runs its top level. Native constructors are
	stubs there ("link: unavailable function"), and the resulting slots are
	what the device runs. Opening the resource at import time freezes an
	empty bank into the image, so the screen stays on 无词库. Open on first use;
	reopen the Preference wordSource then.
*/
let state: OpenState | null | undefined;

function adopt(next: OpenState | null): boolean {
	if (!next)
		return false;
	if (state && state.file)
		closeQuiet(state.file);
	state = next;
	return true;
}

function ensureOpen(): void {
	if (state !== undefined)
		return;
	state = null;
	const want = readPrefSource();
	if (adopt(tryOpen(want)))
		return;
	if (want !== SOURCE_FLASH && adopt(tryOpen(SOURCE_FLASH))) {
		writePrefSource(SOURCE_FLASH);
		return;
	}
}

function openBank(): BankFile | null {
	ensureOpen();
	return state ? state.bank : null;
}

export function wordSourceId(): string {
	ensureOpen();
	return state ? state.id : SOURCE_FLASH;
}

export function wordSourceLabel(id?: string): string {
	if (id !== undefined)
		return labelFor(id);
	return labelFor(wordSourceId());
}

/** 内置 first, then each cadv/words/*.bin (basename without .bin). */
export function listWordSources(): WordSource[] {
	const out: WordSource[] = [{ id: SOURCE_FLASH, label: labelFor(SOURCE_FLASH) }];
	const volume = openVolume();
	if (!volume)
		return out;
	let home: Directory | null = null;
	let words: Directory | null = null;
	try {
		home = volume.openDirectory({ path: SD_HOME });
		words = home.openDirectory({ path: SD_WORDS });
		if (!words || typeof words.scan !== "function")
			return out;
		const names: string[] = [];
		for (const name of words.scan()) {
			if (name.length > 4 && name.endsWith(".bin") && name.indexOf("/") < 0)
				names.push(name.slice(0, -4));
		}
		names.sort(byName);
		for (let i = 0; i < names.length; i++)
			out.push({ id: names[i], label: labelFor(names[i]) });
	}
	catch {
		/* */
	}
	finally {
		closeQuiet(words);
		closeQuiet(home);
	}
	return out;
}

/** Switch pack. Closes the previous SD File. Persists wordSource. */
export function selectWordSource(id: string): boolean {
	ensureOpen();
	const want = !id ? SOURCE_FLASH : id;
	if (state && state.id === want)
		return true;
	const next = tryOpen(want);
	if (!adopt(next))
		return false;
	writePrefSource(want);
	return true;
}

function text(off: number, len: number): string {
	const file = openBank();
	if (!file || len <= 0)
		return "";
	return String.fromArrayBuffer(file.src.readBytes(off, len));
}

export function storedBankCount(): number {
	const file = openBank();
	return file ? file.banks : 0;
}

export function storedBankName(bank: number): string {
	const file = openBank();
	if (!file || bank < 0 || bank >= file.banks)
		return "";
	const o = HEADER + bank * BANK_STRIDE;
	const rec = read(file.src, o, BANK_STRIDE);
	return text(u32(rec.subarray(8, 12)), u16(rec.subarray(6, 8)));
}

export function storedBankSize(bank: number): number {
	const file = openBank();
	if (!file || bank < 0 || bank >= file.banks)
		return 0;
	return u16(read(file.src, HEADER + bank * BANK_STRIDE + 4, 2));
}

export function storedLexId(bank: number, index: number): number {
	const file = openBank();
	if (!file || bank < 0 || bank >= file.banks)
		return 0;
	const o = HEADER + bank * BANK_STRIDE;
	const rec = read(file.src, o, 8);
	const n = u16(rec.subarray(4, 6));
	if (n <= 0)
		return 0;
	let i = index | 0;
	if (i < 0)
		i = 0;
	if (i >= n)
		i = i % n;
	return u16(read(file.src, u32(rec.subarray(0, 4)) + i * 2, 2));
}

function storedLexField(id: number, atOff: number, lenOff: number): string {
	const file = openBank();
	if (!file || id < 0 || id >= file.lex)
		return "";
	const rec = read(file.src, file.lexAt + id * LEX_STRIDE, LEX_STRIDE);
	return text(u32(rec.subarray(atOff, atOff + 4)), u16(rec.subarray(lenOff, lenOff + 2)));
}

export function storedLexWord(id: number): string {
	return storedLexField(id, 0, 4);
}

export function storedLexGloss(id: number): string {
	return storedLexField(id, 8, 6);
}

export function storedLexPhone(id: number): string {
	return storedLexField(id, 16, 12);
}
