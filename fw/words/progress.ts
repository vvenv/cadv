/*
	Completed quiz indexes for the open source+bank, on the card:
	cadv/words/progress/<source>-<bank>.don
	Bitset keeps the XS heap small (junior ≈ 201 bytes).
	Header: u32 magic, u16 count, u16 signature of the bank's headwords.
	A file whose count or signature differs is ignored (pack regenerated).
*/

import type { Directory, File } from "embedded:storage/files";
import { closeQuiet, openCardDir, u16, u32 } from "cardfs";

const SD_HOME = "cadv";
const SD_WORDS = "words";
const SD_PROGRESS = "progress";
const MAGIC = 0x4e4f4457; /* WDON */
const HEADER = 8;

type ProgressState = {
	source: string;
	bank: number;
	count: number;
	sig: number;
	bits: Uint8Array;
	dirty: boolean;
};

let state: ProgressState | null = null;

function openProgressDir(create: boolean): Directory | null {
	return openCardDir([SD_HOME, SD_WORDS, SD_PROGRESS], create);
}

function safeId(id: string): string {
	let out = "";
	for (let i = 0; i < id.length; i++) {
		const c = id.charAt(i);
		if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "-" || c === "_")
			out += c;
		else
			out += "_";
	}
	return out || "x";
}

function fileName(source: string, bank: number): string {
	return safeId(source) + "-" + (bank | 0) + ".don";
}

function bitBytes(count: number): number {
	return ((count | 0) + 7) >> 3;
}

function emptyBits(count: number): Uint8Array {
	return new Uint8Array(bitBytes(count));
}

function putU16(b: Uint8Array, at: number, v: number): void {
	b[at] = v & 0xff;
	b[at + 1] = (v >> 8) & 0xff;
}

function putU32(b: Uint8Array, at: number, v: number): void {
	b[at] = v & 0xff;
	b[at + 1] = (v >> 8) & 0xff;
	b[at + 2] = (v >> 16) & 0xff;
	b[at + 3] = (v >> 24) & 0xff;
}

function readFile(dir: Directory, name: string, count: number, sig: number): Uint8Array | null {
	let file: File | null = null;
	try {
		file = dir.openFile({ path: name, mode: "r" });
		const size = file.status().size;
		const need = HEADER + bitBytes(count);
		if (typeof size !== "number" || size < need)
			return null;
		const raw = new Uint8Array(file.read(need, 0));
		if (u32(raw, 0) !== MAGIC)
			return null;
		if (u16(raw, 4) !== (count | 0) || u16(raw, 6) !== (sig & 0xffff))
			return null;
		return raw.subarray(HEADER);
	}
	catch {
		return null;
	}
	finally {
		closeQuiet(file);
	}
}

function writeFile(dir: Directory, name: string, count: number, sig: number, bits: Uint8Array): boolean {
	let file: File | null = null;
	try {
		const body = new Uint8Array(HEADER + bits.length);
		putU32(body, 0, MAGIC);
		putU16(body, 4, count | 0);
		putU16(body, 6, sig & 0xffff);
		for (let i = 0; i < bits.length; i++)
			body[HEADER + i] = bits[i];
		file = dir.openFile({ path: name, mode: "w" });
		file.write(body, 0);
		return true;
	}
	catch {
		return false;
	}
	finally {
		closeQuiet(file);
	}
}

/**
	Load or reset the in-memory bitset for this pack. `signature` is only
	called when the pack changes, since it reads every headword.
	Same pack: keep memory (a failed write must not drop this session's marks).
*/
export function loadProgress(source: string, bank: number, count: number, signature: () => number): void {
	const src = source || "flash";
	const b = bank | 0;
	const n = count | 0;
	if (state && state.source === src && state.bank === b && state.count === n) {
		flushProgress();
		return;
	}
	if (state && state.dirty)
		flushProgress();
	if (n <= 0) {
		state = null;
		return;
	}
	const sig = signature() & 0xffff;
	const bits = emptyBits(n);
	const dir = openProgressDir(false);
	if (dir) {
		try {
			const got = readFile(dir, fileName(src, b), n, sig);
			if (got && got.length >= bits.length) {
				for (let i = 0; i < bits.length; i++)
					bits[i] = got[i];
			}
		}
		finally {
			closeQuiet(dir);
		}
	}
	state = { source: src, bank: b, count: n, sig, bits, dirty: false };
}

export function isDone(index: number): boolean {
	if (!state)
		return false;
	const i = index | 0;
	if (i < 0 || i >= state.count)
		return false;
	return (state.bits[i >> 3] & (1 << (i & 7))) !== 0;
}

export function setDone(index: number, done: boolean): void {
	if (!state)
		return;
	const i = index | 0;
	if (i < 0 || i >= state.count)
		return;
	const byte = i >> 3;
	const mask = 1 << (i & 7);
	const was = (state.bits[byte] & mask) !== 0;
	if (done === was)
		return;
	if (done)
		state.bits[byte] |= mask;
	else
		state.bits[byte] &= ~mask & 0xff;
	state.dirty = true;
}

export function flushProgress(): void {
	if (!state || !state.dirty)
		return;
	const dir = openProgressDir(true);
	if (!dir)
		return;
	try {
		if (writeFile(dir, fileName(state.source, state.bank), state.count, state.sig, state.bits))
			state.dirty = false;
	}
	finally {
		closeQuiet(dir);
	}
}

/** Keep quiz relative order; unfinished indexes come first. */
export function unfinishedFirst(order: number[]): number[] {
	if (!state || order.length <= 1)
		return order;
	const pending: number[] = [];
	const finished: number[] = [];
	for (let i = 0; i < order.length; i++) {
		const lex = order[i];
		if (isDone(lex))
			finished.push(lex);
		else
			pending.push(lex);
	}
	if (!pending.length || !finished.length)
		return order;
	for (let i = 0; i < finished.length; i++)
		pending.push(finished[i]);
	return pending;
}
