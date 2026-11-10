/*
	Game board. Snake: score strip plus a framed grid. 2048: 4 × 4 tiles
	on the left, score and best on the right. Blocks: the well in the
	middle, score on the left, next piece on the right. A banner (pause /
	game over) sits on a band across the middle.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { AMBER, BG, DIM, FONT_UI, INK, MID, ON, RED, WELL } from "ink";
import { rowTextY } from "list";
import { COLS, ROWS } from "snake";
import { SIZE } from "tiles";
import { COLS as WELL_COLS, ROWS as WELL_ROWS } from "blocks";
import { themeGeneration } from "theme";

export type SnakeState = { body: number[]; food: number; score: number; best: number; banner: string };
export type TilesState = { cells: number[]; spawned: number; score: number; best: number; banner: string };
export type BlocksState = {
	well: number[];
	piece: [number, number][];
	ghost: [number, number][];
	kind: number;
	next: { size: number; cells: [number, number][] };
	nextKind: number;
	score: number;
	lines: number;
	level: number;
	best: number;
	banner: string;
};

const BLOCK = 7;

const CELL = 8;
const FIELD_X = 4;
const FIELD_Y = 26;

const TILE_W = 40;
const TILE_H = 30;
const TILE_GAP = 3;

let face: /* Style */ object | undefined;
let faceGen = -1;
function style(): /* Style */ any {
	const gen = themeGeneration();
	if (!face || faceGen !== gen) {
		face = new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "top" });
		faceGen = gen;
	}
	return face;
}

export function asGame(target: unknown): GameBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: GameBehavior }).behavior;
	return b && typeof b.setSnake === "function" ? b : null;
}

function invalidate(port: unknown) {
	if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
		port.invalidate();
}

/** Piece colours from the theme palette (kind 0..6). Repeats are fine: shapes differ. */
function blockColor(kind: number): string {
	const k = kind % 5;
	if (k === 0)
		return ON;
	if (k === 1)
		return AMBER;
	if (k === 2)
		return RED;
	if (k === 3)
		return INK;
	return MID;
}

/** Text and fill colours per tile value; the palette follows the theme. */
function tileColors(v: number): { fill: string; text: string } {
	if (v >= 512)
		return { fill: ON, text: BG };
	if (v >= 128)
		return { fill: WELL, text: RED };
	if (v >= 32)
		return { fill: WELL, text: AMBER };
	if (v >= 8)
		return { fill: WELL, text: ON };
	return { fill: WELL, text: INK };
}

export class GameBehavior extends Behavior {
	kind: "snake" | "tiles" | "blocks" = "snake";
	snake: SnakeState = { body: [], food: -1, score: 0, best: 0, banner: "" };
	tiles: TilesState = { cells: [], spawned: -1, score: 0, best: 0, banner: "" };
	blocks: BlocksState = {
		well: [], piece: [], ghost: [], kind: 0, next: { size: 0, cells: [] }, nextKind: 0,
		score: 0, lines: 0, level: 1, best: 0, banner: "",
	};

	setBlocks(port: unknown, b: BlocksState) {
		this.kind = "blocks";
		this.blocks = b;
		invalidate(port);
	}

	setSnake(port: unknown, s: SnakeState) {
		this.kind = "snake";
		this.snake = s;
		invalidate(port);
	}

	setTiles(port: unknown, t: TilesState) {
		this.kind = "tiles";
		this.tiles = t;
		invalidate(port);
	}

	onDraw(port: PortContent) {
		port.fillColor(BG, 0, 0, port.width, port.height);
		if (this.kind === "snake")
			this.drawSnake(port);
		else if (this.kind === "blocks")
			this.drawBlocks(port);
		else
			this.drawTiles(port);
	}

	banner(port: PortContent, text: string, cy: number) {
		if (!text)
			return;
		const st = style();
		const m = port.measureString(text, st);
		const w = m.width + 24;
		const x = Math.floor((port.width - w) / 2);
		port.fillColor(ON, x, cy - 13, w, 26);
		port.drawString(text, st, BG, x + 12, cy - 13 - 3, m.width + 2);
	}

	drawSnake(port: PortContent) {
		const s = this.snake;
		const st = style();
		const width = port.width;
		port.drawString("分 " + s.score, st, ON, 6, rowTextY(0), 100);
		const best = "最高 " + s.best;
		const bw = port.measureString(best, st).width;
		port.drawString(best, st, MID, width - 6 - bw, rowTextY(0), bw + 2);

		const fw = COLS * CELL;
		const fh = ROWS * CELL;
		port.fillColor(DIM, FIELD_X - 2, FIELD_Y - 2, fw + 4, 2);
		port.fillColor(DIM, FIELD_X - 2, FIELD_Y + fh, fw + 4, 2);
		port.fillColor(DIM, FIELD_X - 2, FIELD_Y, 2, fh);
		port.fillColor(DIM, FIELD_X + fw, FIELD_Y, 2, fh);

		if (s.food >= 0) {
			const fx = FIELD_X + (s.food % COLS) * CELL;
			const fy = FIELD_Y + Math.floor(s.food / COLS) * CELL;
			port.fillColor(RED, fx + 1, fy + 1, CELL - 2, CELL - 2);
		}
		for (let i = s.body.length - 1; i >= 0; i--) {
			const c = s.body[i];
			const x = FIELD_X + (c % COLS) * CELL;
			const y = FIELD_Y + Math.floor(c / COLS) * CELL;
			port.fillColor(i === 0 ? INK : ON, x, y, CELL - 1, CELL - 1);
		}
		this.banner(port, s.banner, FIELD_Y + (fh >> 1));
	}

	drawBlocks(port: PortContent) {
		const b = this.blocks;
		const st = style();
		const ww = WELL_COLS * BLOCK;
		const wh = WELL_ROWS * BLOCK;
		const x0 = Math.floor((port.width - ww) / 2);
		const y0 = Math.floor((port.height - wh) / 2);
		port.fillColor(DIM, x0 - 2, y0 - 2, 2, wh + 4);
		port.fillColor(DIM, x0 + ww, y0 - 2, 2, wh + 4);
		port.fillColor(DIM, x0 - 2, y0 + wh, ww + 4, 2);
		const cell = (cx: number, cy: number, color: string) => {
			if (cy < 0)
				return;
			port.fillColor(color, x0 + cx * BLOCK, y0 + cy * BLOCK, BLOCK - 1, BLOCK - 1);
		};
		for (let i = 0; i < b.well.length; i++) {
			const v = b.well[i];
			if (v)
				cell(i % WELL_COLS, Math.floor(i / WELL_COLS), blockColor(v - 1));
		}
		for (const [cx, cy] of b.ghost) {
			if (cy < 0)
				continue;
			const x = x0 + cx * BLOCK;
			const y = y0 + cy * BLOCK;
			port.fillColor(WELL, x, y, BLOCK - 1, BLOCK - 1);
		}
		const color = blockColor(b.kind);
		for (const [cx, cy] of b.piece)
			cell(cx, cy, color);

		/* Left column: score, lines, level, best. */
		const lw = x0 - 8;
		const put = (text: string, c: string, x: number, w: number, row: number) => {
			const tw = port.measureString(text, st).width;
			port.drawString(text, st, c, x + Math.max(0, Math.floor((w - tw) / 2)), 2 + row * 22 - 4, w);
		};
		put("分", MID, 2, lw, 0);
		put(String(b.score), ON, 2, lw, 1);
		put("行 " + b.lines, INK, 2, lw, 2);
		put("级 " + b.level, INK, 2, lw, 3);
		put("最高", MID, 2, lw, 4);
		put(String(b.best), INK, 2, lw, 5);

		/* Right column: next piece. */
		const rx = x0 + ww + 6;
		const rw = port.width - rx - 2;
		put("下一个", MID, rx, rw, 0);
		const n = b.next;
		const box = 4 * BLOCK;
		const bx = rx + Math.floor((rw - n.size * BLOCK) / 2);
		const by = 30 + Math.floor((box - n.size * BLOCK) / 2);
		const nc = blockColor(b.nextKind);
		for (const [cx, cy] of n.cells)
			port.fillColor(nc, bx + cx * BLOCK, by + cy * BLOCK, BLOCK - 1, BLOCK - 1);

		this.banner(port, b.banner, Math.floor(port.height / 2));
	}

	drawTiles(port: PortContent) {
		const t = this.tiles;
		const st = style();
		const gridW = SIZE * TILE_W + (SIZE - 1) * TILE_GAP;
		const gridH = SIZE * TILE_H + (SIZE - 1) * TILE_GAP;
		const x0 = 4;
		const y0 = Math.floor((port.height - gridH) / 2);
		for (let r = 0; r < SIZE; r++) {
			for (let c = 0; c < SIZE; c++) {
				const i = r * SIZE + c;
				const v = t.cells[i] ?? 0;
				const x = x0 + c * (TILE_W + TILE_GAP);
				const y = y0 + r * (TILE_H + TILE_GAP);
				if (!v) {
					port.fillColor(WELL, x, y, TILE_W, TILE_H);
					continue;
				}
				const col = tileColors(v);
				port.fillColor(i === t.spawned ? ON : MID, x, y, TILE_W, TILE_H);
				port.fillColor(col.fill, x + 1, y + 1, TILE_W - 2, TILE_H - 2);
				const label = String(v);
				const lw = port.measureString(label, st).width;
				port.drawString(label, st, col.text, x + Math.floor((TILE_W - lw) / 2), y + 1, TILE_W - 2);
			}
		}
		/* Right column: score and best. */
		const rx = x0 + gridW + 6;
		const rw = port.width - rx - 4;
		const put = (text: string, color: string, row: number) => {
			const w = port.measureString(text, st).width;
			port.drawString(text, st, color, rx + Math.max(0, Math.floor((rw - w) / 2)), y0 + row * 30 - 4, rw);
		};
		put("分", MID, 0);
		put(String(t.score), ON, 1);
		put("最高", MID, 2);
		put(String(t.best), INK, 3);
		this.banner(port, t.banner, Math.floor(port.height / 2));
	}
}
