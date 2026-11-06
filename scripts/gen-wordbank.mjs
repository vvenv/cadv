#!/usr/bin/env node
/**
 * Build app/wordbank.ts from ../alice/data.
 *
 * Line format matches alice scripts/generate-library.ts:
 * `word` or `word | pos | meaning`.
 * Words without a Chinese gloss in the file get the first ECDICT sense
 * from ../alice/assets/data/ecdict-meta.json when that file exists.
 *
 * Only single [a-z] headwords of length 2..16 are kept (the keypad quiz
 * cannot type spaces, apostrophes, or digits).
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ALICE = path.resolve(ROOT, "../alice");
const DATA = path.join(ALICE, "data");
const META = path.join(ALICE, "assets/data/ecdict-meta.json");
const OUT = path.join(ROOT, "app/wordbank.ts");

/** Short on-screen names. Unknown folders keep the directory name. */
const BANK_LABEL = {
	"中考1600": "中考",
	"高考3500": "高考",
	"初中2182": "初中",
	"人教版小学": "人教小",
	"人教版初中": "人教初",
	"外研版初中": "外研",
	"仁爱版初中": "仁爱",
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
	let text = line.trim();
	if (!text)
		return null;
	const parts = text.split(/[|｜]/).map((p) => p.trim());
	if (parts.length !== 1 && parts.length !== 3)
		return null;
	let word = parts[0].replace(/[=＝].*$/, "").trim().toLowerCase();
	if (!/^[a-z]{2,16}$/.test(word))
		return null;
	const meaning = parts.length === 3 ? parts[2] : "";
	return { word, meaning };
}

/** First short Chinese sense, at most 4 characters. */
function shorten(meaning) {
	if (!meaning)
		return "";
	let s = meaning.split(/[；;]/)[0] ?? "";
	s = s.replace(/\([^)]*\)/g, "").replace(/（[^）]*）/g, "");
	s = s.replace(/^[a-z]+\.\s*/i, "");
	s = s.split(/[，,、]/)[0] ?? "";
	const han = s.match(/[\u4e00-\u9fff]/g);
	if (!han)
		return "";
	return han.slice(0, 4).join("");
}

function ecdictGloss(meta, word) {
	const raw = meta[word];
	if (typeof raw !== "string")
		return "";
	const bar = raw.indexOf("|");
	const meaning = bar >= 0 ? raw.slice(bar + 1) : raw;
	return shorten(meaning);
}

function collectFiles() {
	if (!fs.existsSync(DATA))
		throw new Error(`missing ${DATA}`);
	const dirs = fs.readdirSync(DATA, { withFileTypes: true })
		.filter((d) => d.isDirectory())
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
	let meta = {};
	if (fs.existsSync(META))
		meta = JSON.parse(fs.readFileSync(META, "utf8"));

	const lexWord = [];
	const lexGloss = [];
	const indexOf = new Map();
	const bankAt = [];
	const bankName = [];
	let fromFile = 0;
	let fromDict = 0;
	let dropped = 0;

	for (const bank of banks) {
		const ids = [];
		const seen = new Set();
		for (const line of bank.lines) {
			const row = headword(line);
			if (!row) {
				if (line.trim())
					dropped++;
				continue;
			}
			let gloss = shorten(row.meaning);
			if (!gloss)
				gloss = ecdictGloss(meta, row.word);
			if (!gloss) {
				dropped++;
				continue;
			}
			let id = indexOf.get(row.word);
			if (id === undefined) {
				id = lexWord.length;
				indexOf.set(row.word, id);
				lexWord.push(row.word);
				lexGloss.push(gloss);
				if (row.meaning)
					fromFile++;
				else
					fromDict++;
			}
			else if (row.meaning) {
				const inline = shorten(row.meaning);
				if (inline)
					lexGloss[id] = inline;
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

	const han = new Set();
	for (const g of lexGloss)
		for (const ch of g)
			han.add(ch);
	for (const name of bankName)
		for (const ch of name)
			han.add(ch);

	const body = `/* Generated by scripts/gen-wordbank.mjs from ../alice/data. Do not edit. */
export const BANK_NAME: string[] = ${JSON.stringify(bankName)};
export const LEX_WORD: string[] = ${JSON.stringify(lexWord)};
export const LEX_GLOSS: string[] = ${JSON.stringify(lexGloss)};
export const BANK_AT: number[][] = ${JSON.stringify(bankAt)};
`;
	fs.writeFileSync(OUT, body);
	const counts = bankName.map((name, i) => `${name} ${bankAt[i].length}`).join(", ");
	console.log(`wrote ${path.relative(ROOT, OUT)}`);
	console.log(`lexicon ${lexWord.length} (file gloss ${fromFile}, ecdict ${fromDict}), dropped ${dropped}`);
	console.log(`banks: ${counts}`);
	console.log(`gloss hanzi ${han.size}`);
}

build();
