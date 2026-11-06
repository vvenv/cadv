/*
	Lexicon: prefer SD card cadv/words/wordbank.bin, else flash Resource.
	Headword, Chinese gloss, phonetic. The ESP32 XS heap is 4928 slots and
	77KB; materializing the lists as JS arrays aborts before the first frame,
	so the backlight stays off. Reads below copy only a few bytes. Generated
	by scripts/gen-wordbank.mjs. Do not edit the binary.
*/

import Modules from "modules";
import Resource from "Resource";
import type { Directory, File } from "embedded:storage/files";

const BANK_STRIDE = 12;
const LEX_STRIDE = 20;
const HEADER = 16;
const MAGIC = 0x314b4257;
const SD_HOME = "cadv";
const SD_WORDS = "words";
const SD_BANK = "wordbank.bin";

type Src = {
	readBytes(off: number, len: number): ArrayBuffer;
};

type BankFile = {
	src: Src;
	banks: number;
	lex: number;
	lexAt: number;
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

function loadSd(): BankFile | null {
	let volume: Directory;
	try {
		volume = Modules.importNow<Directory>("embedded:storage/files");
	}
	catch {
		return null;
	}
	let home: Directory | null = null;
	let words: Directory | null = null;
	let file: File | null = null;
	try {
		home = volume.openDirectory({ path: SD_HOME });
		words = home.openDirectory({ path: SD_WORDS });
		file = words.openFile({ path: SD_BANK, mode: "r" });
		const bank = parse(fromFile(file));
		if (!bank) {
			closeQuiet(file);
			file = null;
			return null;
		}
		// Keep the file open for the process; directory fds are independent.
		file = null;
		return bank;
	}
	catch {
		closeQuiet(file);
		file = null;
		return null;
	}
	finally {
		closeQuiet(words);
		closeQuiet(home);
	}
}

function loadFlash(): BankFile | null {
	try {
		return parse(fromResource(new Resource("wordbank.bin")));
	}
	catch {
		return null;
	}
}

function load(): BankFile | null {
	return loadSd() || loadFlash();
}

/*
	xsl preloads this module and runs its top level. Native constructors are
	stubs there ("link: unavailable function"), and the resulting slots are
	what the device runs. Opening the resource at import time freezes an
	empty bank into the image, so the screen stays on 无词库. Open on first use.
*/
let loaded: BankFile | null | undefined;

function openBank(): BankFile | null {
	if (loaded === undefined)
		loaded = load();
	return loaded;
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
