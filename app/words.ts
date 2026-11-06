/*
	Fill-in-the-blank English words. The lists live in wordbank.ts,
	generated from ../alice/data.
*/

import { BANK_AT, BANK_NAME, LEX_GLOSS, LEX_WORD } from "wordbank";

export type WordEntry = { word: string; gloss: string };

export function bankCount(): number {
	return BANK_NAME.length;
}

export function clampBank(bank: number): number {
	const n = BANK_NAME.length;
	if (n <= 0)
		return 0;
	let b = bank | 0;
	if (b < 0)
		b = 0;
	if (b >= n)
		b = n - 1;
	return b;
}

export function bankName(bank: number): string {
	return BANK_NAME[clampBank(bank)] ?? "";
}

export function wordCount(bank: number): number {
	const list = BANK_AT[clampBank(bank)];
	return list ? list.length : 0;
}

export function wordAt(bank: number, index: number): WordEntry {
	const list = BANK_AT[clampBank(bank)];
	const n = list ? list.length : 0;
	if (n <= 0)
		return { word: "", gloss: "" };
	let i = index | 0;
	if (i < 0)
		i = 0;
	if (i >= n)
		i = i % n;
	const id = list[i] ?? 0;
	return { word: LEX_WORD[id] ?? "", gloss: LEX_GLOSS[id] ?? "" };
}

/** 易 / 中 / 难. Share of letters the player must type. */
export const WORD_LEVEL_NAME = ["易", "中", "难"];

export function clampWordLevel(level: number): number {
	let lv = level | 0;
	if (lv < 0)
		lv = 0;
	if (lv >= WORD_LEVEL_NAME.length)
		lv = WORD_LEVEL_NAME.length - 1;
	return lv;
}

/**
	Blanks to type. 易 ≈ 1/3, 中 ≈ 1/2, 难 = the whole word.
	For length ≥ 3 the three counts are strictly increasing, and 易/中 leave a letter showing.
*/
export function hideCount(length: number, level: number): number {
	if (length <= 0)
		return 0;
	const lv = clampWordLevel(level);
	if (lv >= 2)
		return length;
	const easyCap = length > 2 ? length - 2 : 1;
	let easy = Math.round(length / 3);
	if (easy < 1)
		easy = 1;
	if (easy > easyCap)
		easy = easyCap;
	if (lv === 0)
		return easy;
	let mid = Math.round(length / 2);
	if (mid < easy + 1)
		mid = easy + 1;
	if (mid > length - 1)
		mid = length - 1;
	return mid;
}

function nextRand(state: number): number {
	const x = state * 48271 % 2147483647;
	return x > 0 ? x : 1;
}

/** Sorted indexes to blank. Stable for the same word index and level. */
export function hiddenIndices(word: string, salt: number, level: number): number[] {
	const n = word.length;
	const lv = clampWordLevel(level);
	const hide = hideCount(n, lv);
	const pool: number[] = [];
	for (let i = 0; i < n; i++)
		pool.push(i);
	let state = (Math.abs(salt | 0) + lv * 97 + n * 17 + 1) % 2147483647;
	if (state <= 0)
		state = 1;
	for (let i = pool.length - 1; i > 0; i--) {
		state = nextRand(state);
		const j = state % (i + 1);
		const tmp = pool[i];
		pool[i] = pool[j];
		pool[j] = tmp;
	}
	const picked = pool.slice(0, hide);
	picked.sort((a, b) => a - b);
	return picked;
}

/** Known letters stay, blanks are `_` until typed. No gaps: 48px must fit 8 letters in 240px. */
export function renderPuzzle(word: string, hidden: number[], typed: string): string {
	const mark: boolean[] = [];
	for (let i = 0; i < word.length; i++)
		mark.push(false);
	for (const i of hidden) {
		if (i >= 0 && i < word.length)
			mark[i] = true;
	}
	let t = 0;
	let out = "";
	for (let i = 0; i < word.length; i++) {
		if (!mark[i])
			out += word.charAt(i);
		else if (t < typed.length)
			out += typed.charAt(t++);
		else
			out += "_";
	}
	return out;
}

export function puzzleCorrect(word: string, hidden: number[], typed: string): boolean {
	if (typed.length !== hidden.length)
		return false;
	for (let i = 0; i < hidden.length; i++) {
		if (typed.charAt(i) !== word.charAt(hidden[i]))
			return false;
	}
	return true;
}
