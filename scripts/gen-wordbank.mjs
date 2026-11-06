#!/usr/bin/env node
/**
 * Build word packs from ../alice/data.
 * The device XS heap cannot hold the lexicon as live string arrays.
 *
 * Pack A — 闽教版小学 (merged) → fw/words/wordbank.bin (flash Resource).
 * Pack B — 初中2182 (one bank per .txt) → fw/words/junior.bin and
 *          fw/words/sample/cadv/words/junior.bin (manual SD load).
 *
 * Chinese gloss: a `word | pos | meaning` line in
 * ../alice/assets/data/library.json when one exists, otherwise the first
 * sense of ../alice/assets/data/ecdict-meta.json. Capped at 8 characters.
 *
 * Phonetic: ECDICT `phonetic` column (cadv/.cache/ecdict.csv, else alice's
 * cache; downloaded only when neither exists). Characters Arial Bold cannot
 * draw are dropped. Han/IPA glyph sets are the union of both packs.
 *
 * Line format matches alice scripts/generate-library.ts:
 * `word` or `word | pos | meaning` (the list meaning is not the gloss).
 *
 * Only single [a-z] headwords of length 2..16 are kept (the keypad quiz
 * cannot type spaces, apostrophes, or digits).
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ALICE = path.resolve(ROOT, "../alice");
const DATA = path.join(ALICE, "data");
const META_JSON = path.join(ALICE, "assets/data/ecdict-meta.json");
const LIBRARY_JSON = path.join(ALICE, "assets/data/library.json");
const OUT_BIN = path.join(ROOT, "fw/words/wordbank.bin");
const OUT_JUNIOR = path.join(ROOT, "fw/words/junior.bin");
const OUT_CHARS = path.join(ROOT, "fw/words/wordbank-chars.txt");
const OUT_PHONE = path.join(ROOT, "fw/words/phone-chars.txt");
/** Desktop sim host copy: cadv/words/junior.bin (manual SD source). */
const OUT_SD_JUNIOR = path.join(ROOT, "fw/words/sample/cadv/words/junior.bin");
/** Legacy auto-override path; removed so flash stays the default. */
const LEGACY_SD_BIN = path.join(ROOT, "fw/words/sample/cadv/words/wordbank.bin");
const ECDICT_URL = "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv";

const GLOSS_CAP = 8;
const PHONE_CAP = 24;

const PRIMARY_DIR = "闽教版小学";
const PRIMARY_LABEL = "闽教小";
const JUNIOR_DIR = "初中2182";

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
	const word = parts[0].replace(/[=\uff1d].*$/, "").trim().toLowerCase();
	if (!/^[a-z]{2,16}$/.test(word))
		return null;
	return word;
}

/** Short on-screen bank name: 第一册 常见 → 一常. */
function juniorBankLabel(base) {
	const m = base.match(/^第([一二三四五六七八九十]+)册\s*(常见|生僻)$/);
	if (m)
		return m[1] + m[2].charAt(0);
	return base.slice(0, 4);
}

function collectPrimary() {
	const dir = path.join(DATA, PRIMARY_DIR);
	if (!fs.existsSync(dir))
		return [];
	const files = fs.readdirSync(dir)
		.filter((f) => f.endsWith(".txt"))
		.sort(compareLabels);
	const lines = [];
	for (const file of files) {
		const text = fs.readFileSync(path.join(dir, file), "utf8");
		for (const line of text.split(/\r?\n/))
			lines.push(line);
	}
	if (lines.length === 0)
		return [];
	return [{ label: PRIMARY_LABEL, lines }];
}

function collectJunior() {
	const dir = path.join(DATA, JUNIOR_DIR);
	if (!fs.existsSync(dir))
		return [];
	const files = fs.readdirSync(dir)
		.filter((f) => f.endsWith(".txt"))
		.sort(compareLabels);
	const banks = [];
	for (const file of files) {
		const text = fs.readFileSync(path.join(dir, file), "utf8");
		const lines = text.split(/\r?\n/);
		const label = juniorBankLabel(file.replace(/\.txt$/i, ""));
		banks.push({ label, lines });
	}
	return banks;
}

function firstClause(text) {
	let s = String(text || "").trim();
	s = s.replace(/^[a-z]+\.\s+/i, "");
	s = s.replace(/\([^)]*\)/g, "").replace(/（[^）]*）/g, "");
	s = s.replace(/\[[^\]]*\]/g, "").replace(/［[^］]*］/g, "");
	s = s.replace(/\s+/g, "");
	s = (s.split(/[，,\uff1b;]/)[0] || "").trim();
	return s;
}

function glossOf(lib, metaRaw) {
	let s = lib ? firstClause(lib) : "";
	if (!/[\u4e00-\u9fff]/.test(s) && metaRaw) {
		const bar = metaRaw.indexOf("|");
		const body = bar >= 0 ? metaRaw.slice(bar + 1) : metaRaw;
		s = firstClause((body.split("；")[0] || ""));
		if (/[A-Za-z]/.test(s) && /be的|的现在|的过去|人称/.test(s))
			s = "是";
		else if (/[A-Za-z]/.test(s))
			s = [...s].filter((ch) => ch.codePointAt(0) > 127).join("");
	}
	if (!/[\u4e00-\u9fff]/.test(s))
		return "";
	return [...s].slice(0, GLOSS_CAP).join("");
}

function loadLibraryGloss() {
	const out = new Map();
	if (!fs.existsSync(LIBRARY_JSON))
		return out;
	const lib = JSON.parse(fs.readFileSync(LIBRARY_JSON, "utf8"));
	if (!Array.isArray(lib))
		return out;
	for (const item of lib) {
		const text = item && item.entry && item.entry.text ? item.entry.text : "";
		for (const line of String(text).split(/\n/)) {
			const parts = line.split(/[|｜]/).map((p) => p.trim());
			if (parts.length < 3)
				continue;
			const word = parts[0].replace(/[=\uff1d].*$/, "").trim().toLowerCase();
			if (!/^[a-z]{2,16}$/.test(word) || out.has(word))
				continue;
			const meaning = parts.slice(2).join("|").trim();
			if (meaning)
				out.set(word, meaning);
		}
	}
	return out;
}

function loadMeta() {
	if (!fs.existsSync(META_JSON)) {
		console.log(`no ${path.relative(ROOT, META_JSON)}; meta glosses empty`);
		return {};
	}
	return JSON.parse(fs.readFileSync(META_JSON, "utf8"));
}

function csvPath() {
	const cands = [
		path.join(ROOT, ".cache/ecdict.csv"),
		path.join(ALICE, ".cache/ecdict.csv"),
	];
	for (const p of cands) {
		if (fs.existsSync(p) && fs.statSync(p).size > 1_000_000)
			return p;
	}
	const dest = cands[0];
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	console.log(`downloading ECDICT → ${dest}`);
	execFileSync("curl", ["-fL", "--retry", "2", "-o", dest, ECDICT_URL], { stdio: "inherit" });
	return dest;
}

function* csvRows(text) {
	let row = [];
	let cur = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === "\"") {
				if (text[i + 1] === "\"") {
					cur += "\"";
					i++;
				}
				else
					quoted = false;
			}
			else
				cur += c;
			continue;
		}
		if (c === "\"")
			quoted = true;
		else if (c === ",") {
			row.push(cur);
			cur = "";
		}
		else if (c === "\n") {
			row.push(cur);
			yield row;
			row = [];
			cur = "";
		}
		else if (c !== "\r")
			cur += c;
	}
	if (cur.length > 0 || row.length > 0) {
		row.push(cur);
		yield row;
	}
}

function cleanPhone(raw) {
	let s = String(raw || "").trim();
	if (!s)
		return "";
	s = s.split(/[;\uff1b]/)[0].trim();
	s = s.replace(/^[\/\[]+/, "").replace(/[\/\]]+$/, "");
	s = s.replace(/\s+/g, "");
	s = s.replace(/[\u4e00-\u9fff]/g, "");
	if ([...s].length > PHONE_CAP)
		s = [...s].slice(0, PHONE_CAP).join("");
	return s;
}

function loadPhones(need) {
	const file = csvPath();
	const text = fs.readFileSync(file, "utf8");
	const phones = new Map();
	let header = true;
	for (const row of csvRows(text)) {
		if (header) {
			header = false;
			continue;
		}
		const word = (row[0] || "").trim().toLowerCase();
		if (!need.has(word) || phones.has(word))
			continue;
		const phone = cleanPhone(row[1] || "");
		if (phone)
			phones.set(word, phone);
		if (phones.size === need.size)
			break;
	}
	return phones;
}

function ipaOk(chars) {
	const font = process.env.IPA_FONT || "/System/Library/Fonts/Supplemental/Arial Bold.ttf";
	const ok = new Set();
	let hb = true;
	try {
		execFileSync("hb-shape", ["--version"], { stdio: "ignore" });
	}
	catch {
		hb = false;
	}
	if (!hb || !fs.existsSync(font)) {
		console.log("hb-shape or IPA font missing; keeping phonetic chars unchecked");
		for (const ch of chars)
			ok.add(ch);
		return ok;
	}
	for (const ch of chars) {
		const cp = ch.codePointAt(0).toString(16);
		const out = execFileSync("hb-shape", ["--font-file", font, "-u", cp], { encoding: "utf8" });
		if (!out.includes(".notdef"))
			ok.add(ch);
	}
	return ok;
}

function filterPhones(phones) {
	const extra = new Set();
	for (const phone of phones.values()) {
		for (const ch of phone) {
			if (ch.codePointAt(0) > 126)
				extra.add(ch);
		}
	}
	const ok = ipaOk(extra);
	const dropped = [...extra].filter((ch) => !ok.has(ch));
	if (dropped.length > 0)
		console.log(`dropped ipa ${dropped.join("")}`);
	for (const [word, phone] of phones) {
		const s = [...phone].filter((ch) => ch.codePointAt(0) <= 126 || ok.has(ch)).join("");
		if (s)
			phones.set(word, s);
		else
			phones.delete(word);
	}
	return [...ok].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join("");
}

function gatherNeed(bankGroups) {
	const need = new Set();
	for (const banks of bankGroups) {
		for (const bank of banks) {
			for (const line of bank.lines) {
				const word = headword(line);
				if (word)
					need.add(word);
			}
		}
	}
	return need;
}

function materialize(banks, library, meta, phones) {
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
		return null;
	if (lexWord.length > 65535)
		throw new Error(`lexicon ${lexWord.length} does not fit in u16 ids`);

	const lexGloss = [];
	let fromLib = 0;
	let fromMeta = 0;
	for (const word of lexWord) {
		const lib = library.get(word) || "";
		const gloss = glossOf(lib, meta[word] || "");
		if (gloss && lib && /[\u4e00-\u9fff]/.test(firstClause(lib)))
			fromLib++;
		else if (gloss)
			fromMeta++;
		lexGloss.push(gloss);
	}

	const lexPhone = lexWord.map((word) => phones.get(word) || "");

	const han = new Set();
	for (const name of bankName) {
		for (const ch of name)
			han.add(ch);
	}
	for (const gloss of lexGloss) {
		for (const ch of gloss) {
			if (ch.codePointAt(0) > 126)
				han.add(ch);
		}
	}

	const bin = packBank(bankName, lexWord, lexGloss, lexPhone, bankAt);
	verifyBank(bin, bankName, lexWord, lexGloss, lexPhone, bankAt);
	return {
		bin,
		bankName,
		lexWord,
		lexGloss,
		lexPhone,
		bankAt,
		indexOf,
		han,
		dropped,
		fromLib,
		fromMeta,
	};
}

function reportPack(tag, outPath, pack) {
	const counts = pack.bankName.map((name, i) => `${name} ${pack.bankAt[i].length}`).join(", ");
	const withPhone = pack.lexPhone.filter(Boolean).length;
	console.log(`wrote ${path.relative(ROOT, outPath)} (${pack.bin.length} bytes)`);
	console.log(`${tag} lexicon ${pack.lexWord.length}, dropped ${pack.dropped}`);
	console.log(`${tag} gloss library ${pack.fromLib}, meta ${pack.fromMeta}, empty ${pack.lexWord.length - pack.fromLib - pack.fromMeta}`);
	console.log(`${tag} phones ${withPhone}`);
	console.log(`${tag} banks: ${counts}`);
}

function build() {
	if (!fs.existsSync(DATA))
		throw new Error(`missing ${DATA}`);

	const primary = collectPrimary();
	const junior = collectJunior();
	if (primary.length === 0)
		throw new Error("no 闽教版小学 word lists under ../alice/data");
	if (junior.length === 0)
		throw new Error("no 初中2182 word lists under ../alice/data");

	const library = loadLibraryGloss();
	const meta = loadMeta();
	const phones = loadPhones(gatherNeed([primary, junior]));
	const phoneChars = filterPhones(phones);

	const packA = materialize(primary, library, meta, phones);
	const packB = materialize(junior, library, meta, phones);
	if (!packA)
		throw new Error("闽教版小学 produced no banks");
	if (!packB)
		throw new Error("初中2182 produced no banks");

	fs.writeFileSync(OUT_BIN, packA.bin);
	fs.writeFileSync(OUT_JUNIOR, packB.bin);
	fs.mkdirSync(path.dirname(OUT_SD_JUNIOR), { recursive: true });
	fs.writeFileSync(OUT_SD_JUNIOR, packB.bin);
	if (fs.existsSync(LEGACY_SD_BIN))
		fs.unlinkSync(LEGACY_SD_BIN);

	const han = new Set([...packA.han, ...packB.han]);
	const chars = [...han].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join("");
	fs.writeFileSync(OUT_CHARS, chars + "\n");
	fs.writeFileSync(OUT_PHONE, phoneChars + "\n");

	reportPack("flash", OUT_BIN, packA);
	reportPack("junior", OUT_JUNIOR, packB);
	console.log(`wrote ${path.relative(ROOT, OUT_SD_JUNIOR)}`);
	console.log(`wrote ${path.relative(ROOT, OUT_CHARS)} (${han.size} chars)`);
	console.log(`wrote ${path.relative(ROOT, OUT_PHONE)} (${[...phoneChars].length} chars)`);
	for (const sample of ["ruler", "book", "are", "can", "pen", "what", "name"]) {
		const id = packA.indexOf.get(sample) ?? packB.indexOf.get(sample);
		const pack = packA.indexOf.has(sample) ? packA : packB.indexOf.has(sample) ? packB : null;
		if (!pack || id === undefined)
			continue;
		console.log(`sample ${sample} ${pack.lexGloss[id]} ${pack.lexPhone[id]}`);
	}
}

const MAGIC = 0x314b4257;
const BANK_STRIDE = 12;
const LEX_STRIDE = 20;

function packBank(bankName, lexWord, lexGloss, lexPhone, bankAt) {
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
		if (!s)
			return { at: 0, len: 0 };
		const bytes = Buffer.from(s, "utf8");
		if (bytes.length > 65535)
			throw new Error(`string longer than u16: ${s.slice(0, 24)}`);
		const at = cursor + blobBytesLen;
		blob.push(bytes);
		blobBytesLen += bytes.length;
		return { at, len: bytes.length };
	}
	const names = bankName.map(pushStr);
	const words = lexWord.map(pushStr);
	const glosses = lexGloss.map(pushStr);
	const phones = lexPhone.map(pushStr);
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
		out.writeUInt16LE(glosses[i].len, o + 6);
		out.writeUInt32LE(glosses[i].at, o + 8);
		out.writeUInt16LE(phones[i].len, o + 12);
		out.writeUInt16LE(0, o + 14);
		out.writeUInt32LE(phones[i].at, o + 16);
	}
	blobBytes.copy(out, blobOff);
	return out;
}

function readStr(bin, at, len) {
	if (len <= 0)
		return "";
	return bin.toString("utf8", at, at + len);
}

function verifyBank(bin, bankName, lexWord, lexGloss, lexPhone, bankAt) {
	if (bin.readUInt32LE(0) !== MAGIC)
		throw new Error("wordbank magic");
	const lexOff = bin.readUInt32LE(8);
	for (let i = 0; i < bankName.length; i++) {
		const o = 16 + i * BANK_STRIDE;
		const name = readStr(bin, bin.readUInt32LE(o + 8), bin.readUInt16LE(o + 6));
		if (name !== bankName[i])
			throw new Error(`bank name ${i}: ${name}`);
		if (bin.readUInt16LE(o + 4) !== bankAt[i].length)
			throw new Error(`bank size ${i}`);
		const id = bin.readUInt16LE(bin.readUInt32LE(o) + Math.min(bankAt[i].length - 1, 3) * 2);
		const lo = lexOff + id * LEX_STRIDE;
		const word = readStr(bin, bin.readUInt32LE(lo), bin.readUInt16LE(lo + 4));
		const gloss = readStr(bin, bin.readUInt32LE(lo + 8), bin.readUInt16LE(lo + 6));
		const phone = readStr(bin, bin.readUInt32LE(lo + 16), bin.readUInt16LE(lo + 12));
		if (word !== lexWord[id])
			throw new Error(`lex ${id}: ${word}`);
		if (gloss !== lexGloss[id])
			throw new Error(`gloss ${id}: ${gloss}`);
		if (phone !== lexPhone[id])
			throw new Error(`phone ${id}: ${phone}`);
	}
}

build();
