#!/usr/bin/env node
/**
 * Build fw/words/wordbank.bin from elementary lists in ../alice/data.
 * The device XS heap cannot hold the lexicon as live string arrays.
 *
 * Only directories whose names contain 小学 are included (人教版小学,
 * 闽教版小学). Chinese glosses are not stored.
 *
 * Line format matches alice scripts/generate-library.ts:
 * `word` or `word | pos | meaning` (the meaning is ignored).
 *
 * Only single [a-z] headwords of length 2..16 are kept (the keypad quiz
 * cannot type spaces, apostrophes, or digits).
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ALICE = path.resolve(ROOT, "../alice");
const DATA = path.join(ALICE, "data");
const OUT_BIN = path.join(ROOT, "fw/words/wordbank.bin");
const OUT_CHARS = path.join(ROOT, "fw/words/wordbank-chars.txt");

/** Short on-screen names. Unknown elementary folders keep the directory name. */
const BANK_LABEL = {
	"人教版小学": "人教小",
	"闽教版小学": "闽教小",
};

const BANK_ORDER = Object.keys(BANK_LABEL);

const GRADE_RANK = { 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const TERM_RANK = { 上: 0, 下: 1, 全: 2 };
const CE_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const VOL_RE = /^第([一二三四五六七八九十]+)册/;

function ceNum(ce) {
	if (CE_NUM[ce] !== undefined)
		return CE_NUM[ce];
	const m = ce.match(/^([一二三四五六七八九]?)十([一二三四五六七八九]?)$/);
	if (!m)
		return 99;
	return (m[1] ? CE_NUM[m[1]] : 1) * 10 + (m[2] ? CE_NUM[m[2]] : 0);
}

function compareLabels(a, b) {
	const va = a.match(VOL_RE);
	const vb = b.match(VOL_RE);
	if (va && vb) {
		const d = ceNum(va[1]) - ceNum(vb[1]);
		if (d !== 0)
			return d;
		return a.slice(va[0].length).localeCompare(b.slice(vb[0].length), "zh-Hans", { numeric: true, sensitivity: "base" });
	}
	const gradeRe = /^([三四五六七八九])([上下全])/;
	const ma = a.match(gradeRe);
	const mb = b.match(gradeRe);
	if (ma && mb) {
		const d = (GRADE_RANK[ma[1]] ?? 99) - (GRADE_RANK[mb[1]] ?? 99);
		if (d !== 0)
			return d;
		const t = (TERM_RANK[ma[2]] ?? 9) - (TERM_RANK[mb[2]] ?? 9);
		if (t !== 0)
			return t;
	}
	return a.localeCompare(b, "zh-Hans", { numeric: true, sensitivity: "base" });
}

function headword(line) {
	const text = line.trim();
	if (!text)
		return null;
	const parts = text.split(/[|｜]/).map((p) => p.trim());
	if (parts.length !== 1 && parts.length !== 3)
		return null;
	const word = parts[0].replace(/[=＝].*$/, "").trim().toLowerCase();
	if (!/^[a-z]{2,16}$/.test(word))
		return null;
	return word;
}

function collectFiles() {
	if (!fs.existsSync(DATA))
		throw new Error(`missing ${DATA}`);
	const dirs = fs.readdirSync(DATA, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name.includes("小学"))
		.map((d) => d.name);
	dirs.sort((a, b) => {
		const ia = BANK_ORDER.indexOf(a);
		const ib = BANK_ORDER.indexOf(b);
		if (ia !== -1 || ib !== -1)
			return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
		return compareLabels(a, b);
	});
	const banks = [];
	for (const dir of dirs) {
		const files = fs.readdirSync(path.join(DATA, dir))
			.filter((f) => f.endsWith(".txt"))
			.sort(compareLabels);
		const lines = [];
		for (const file of files) {
			const text = fs.readFileSync(path.join(DATA, dir, file), "utf8");
			for (const line of text.split(/\r?\n/))
				lines.push(line);
		}
		if (lines.length === 0)
			continue;
		const label = BANK_LABEL[dir] ?? [...dir].slice(0, 4).join("");
		banks.push({ dir, label, lines });
	}
	return banks;
}

function build() {
	const banks = collectFiles();
	const lexWord = [];
	const indexOf = new Map();
	const bankAt = [];
	const bankName = [];
	let dropped = 0;

	for (const bank of banks) {
		const ids = [];
		const seen = new Set();
		for (const line of bank.lines) {
			const word = headword(line);
			if (!word) {
				if (line.trim())
					dropped++;
				continue;
			}
			let id = indexOf.get(word);
			if (id === undefined) {
				id = lexWord.length;
				indexOf.set(word, id);
				lexWord.push(word);
			}
			if (seen.has(id))
				continue;
			seen.add(id);
			ids.push(id);
		}
		if (ids.length === 0)
			continue;
		bankName.push(bank.label);
		bankAt.push(ids);
	}

	if (bankName.length === 0)
		throw new Error("no elementary word lists under ../alice/data");
	if (lexWord.length > 65535)
		throw new Error(`lexicon ${lexWord.length} does not fit in u16 ids`);

	const han = new Set();
	for (const name of bankName)
		for (const ch of name)
			han.add(ch);

	const bin = packBank(bankName, lexWord, bankAt);
	fs.writeFileSync(OUT_BIN, bin);
	const chars = [...han].sort().join("");
	fs.writeFileSync(OUT_CHARS, chars + "\n");
	verifyBank(bin, bankName, lexWord, bankAt);
	const counts = bankName.map((name, i) => `${name} ${bankAt[i].length}`).join(", ");
	console.log(`wrote ${path.relative(ROOT, OUT_BIN)} (${bin.length} bytes)`);
	console.log(`wrote ${path.relative(ROOT, OUT_CHARS)} (${han.size} chars)`);
	console.log(`lexicon ${lexWord.length}, dropped ${dropped}`);
	console.log(`banks: ${counts}`);
}

const MAGIC = 0x314b4257;
const BANK_STRIDE = 12;
const LEX_STRIDE = 8;

function packBank(bankName, lexWord, bankAt) {
	const header = 16;
	let cursor = header + bankName.length * BANK_STRIDE;
	const idsOff = bankAt.map((ids) => {
		const at = cursor;
		cursor += ids.length * 2;
		return at;
	});
	const lexOff = cursor;
	cursor += lexWord.length * LEX_STRIDE;
	const blob = [];
	let blobBytesLen = 0;
	function pushStr(s) {
		const bytes = Buffer.from(s, "utf8");
		const at = cursor + blobBytesLen;
		blob.push(bytes);
		blobBytesLen += bytes.length;
		return { at, len: bytes.length };
	}
	const names = bankName.map(pushStr);
	const words = lexWord.map(pushStr);
	const blobOff = cursor;
	const blobBytes = Buffer.concat(blob);
	const out = Buffer.alloc(blobOff + blobBytes.length);
	out.writeUInt32LE(MAGIC, 0);
	out.writeUInt16LE(bankName.length, 4);
	out.writeUInt16LE(lexWord.length, 6);
	out.writeUInt32LE(lexOff, 8);
	out.writeUInt32LE(blobOff, 12);
	bankName.forEach((_, i) => {
		const o = header + i * BANK_STRIDE;
		out.writeUInt32LE(idsOff[i], o);
		out.writeUInt16LE(bankAt[i].length, o + 4);
		out.writeUInt16LE(names[i].len, o + 6);
		out.writeUInt32LE(names[i].at, o + 8);
		let p = idsOff[i];
		for (const id of bankAt[i]) {
			out.writeUInt16LE(id, p);
			p += 2;
		}
	});
	for (let i = 0; i < lexWord.length; i++) {
		const o = lexOff + i * LEX_STRIDE;
		out.writeUInt32LE(words[i].at, o);
		out.writeUInt16LE(words[i].len, o + 4);
	}
	blobBytes.copy(out, blobOff);
	return out;
}

function verifyBank(bin, bankName, lexWord, bankAt) {
	if (bin.readUInt32LE(0) !== MAGIC)
		throw new Error("wordbank magic");
	const lexOff = bin.readUInt32LE(8);
	for (let i = 0; i < bankName.length; i++) {
		const o = 16 + i * BANK_STRIDE;
		const name = bin.toString("utf8", bin.readUInt32LE(o + 8), bin.readUInt32LE(o + 8) + bin.readUInt16LE(o + 6));
		if (name !== bankName[i])
			throw new Error(`bank name ${i}: ${name}`);
		if (bin.readUInt16LE(o + 4) !== bankAt[i].length)
			throw new Error(`bank size ${i}`);
		const id = bin.readUInt16LE(bin.readUInt32LE(o) + Math.min(bankAt[i].length - 1, 3) * 2);
		const lo = lexOff + id * LEX_STRIDE;
		const word = bin.toString("utf8", bin.readUInt32LE(lo), bin.readUInt32LE(lo) + bin.readUInt16LE(lo + 4));
		if (word !== lexWord[id])
			throw new Error(`lex ${id}: ${word}`);
	}
}

build();
