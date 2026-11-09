/*
	SD launcher home: title strip + horizontal icon grid.
	Each firmware is a tile — icon above, short name below.
	Four columns, two rows; the window scrolls to keep the selection on screen.
*/

import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { drawGlyph, drawProgress, fillDisk } from "draw";
import { BG, FONT_UI, INK, ON, RED, type Glyph } from "ink";
import { ROW_LEAD, ROW_PITCH, rowOrigin, rowTextY } from "list";
import { themeGeneration } from "theme";
import { drawFwIcon } from "icons";

/** First index of the page that contains `selected`. */
function pageStart(selected: number, count: number, visible: number): number {
	if (count <= visible || visible <= 0)
		return 0;
	let sel = selected;
	if (sel < 0)
		sel = 0;
	if (sel >= count)
		sel = count - 1;
	return Math.floor(sel / visible) * visible;
}

export type HomeTile = {
	id: string;
	label: string;
	/** Mirror too big for the flash slot. */
	big?: boolean;
	/** Could not read this entry. */
	bad?: boolean;
};

const COLS = 4;
const ROWS = 2;
const VISIBLE = COLS * ROWS;
const PAD_X = 4;
const TITLE_MARK = 18;
const TITLE_MARK_GAP = 6;
const ICON = 28;
const NAME_MAX = 4;

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

export function asHome(target: unknown): HomeBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: HomeBehavior }).behavior;
	return b && typeof b.setHome === "function" ? b : null;
}

function drawText(port: PortContent, text: string, color: string, x: number, y: number, width: number) {
	if (width <= 0 || !text)
		return;
	port.drawString(text, style(), color, x, y, width);
}

function shortLabel(label: string): string {
	if (label.length <= NAME_MAX)
		return label;
	return label.slice(0, NAME_MAX);
}

function sameTiles(a: HomeTile[], b: HomeTile[]): boolean {
	if (a.length !== b.length)
		return false;
	for (let i = 0; i < a.length; i++) {
		if (
			a[i].id !== b[i].id
			|| a[i].label !== b[i].label
			|| !!a[i].big !== !!b[i].big
			|| !!a[i].bad !== !!b[i].bad
		)
			return false;
	}
	return true;
}

export class HomeBehavior extends Behavior {
	title = "";
	mark: Glyph = "";
	level = 0;
	index = 0;
	tiles: HomeTile[] = [];
	themeGen = -1;

	setHome(
		port: unknown,
		title: string,
		tiles: HomeTile[],
		index: number,
		mark: Glyph = "",
		level?: number,
	) {
		const nextLevel = level === undefined ? 0 : level;
		let nextIndex = index;
		if (nextIndex < 0)
			nextIndex = 0;
		if (tiles.length && nextIndex >= tiles.length)
			nextIndex = tiles.length - 1;
		const gen = themeGeneration();
		if (
			title === this.title
			&& mark === this.mark
			&& nextLevel === this.level
			&& nextIndex === this.index
			&& sameTiles(this.tiles, tiles)
			&& gen === this.themeGen
		)
			return;
		this.title = title;
		this.mark = mark;
		this.level = nextLevel;
		this.index = nextIndex;
		this.tiles = tiles;
		this.themeGen = gen;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		const faceStyle = style();
		const width = port.width;
		const height = port.height;
		port.fillColor(BG, 0, 0, width, height);

		const titleMark = this.mark ? (this.mark === "progress" ? 56 : TITLE_MARK) + TITLE_MARK_GAP : 0;
		const titleW = port.measureString(this.title, faceStyle).width;
		const titleBlock = titleW + titleMark;
		const titleX = Math.max(0, Math.floor((width - titleBlock) / 2));
		if (this.mark) {
			if (this.mark === "progress") {
				drawProgress(port, titleX, rowOrigin(0) + Math.floor(ROW_PITCH / 2) - 3, 48, 6, this.level);
			}
			else {
				drawGlyph(
					port,
					titleX + Math.floor(TITLE_MARK / 2),
					rowOrigin(0) + Math.floor(ROW_PITCH / 2),
					TITLE_MARK,
					this.mark,
					this.level,
				);
			}
		}
		drawText(port, this.title, ON, titleX + titleMark, rowTextY(0), Math.max(1, width - titleX - titleMark));

		const n = this.tiles.length;
		if (n <= 0)
			return;

		const paging = n > VISIBLE;
		const gridTop = rowOrigin(1);
		const gridH = Math.max(1, height - gridTop - (paging ? 10 : 2));
		const cellW = Math.floor((width - PAD_X * 2) / COLS);
		const cellH = Math.floor(gridH / ROWS);
		const start = pageStart(this.index, n, VISIBLE);
		const pageCount = n - start < VISIBLE ? n - start : VISIBLE;
		const pageCols = pageCount < COLS ? pageCount : COLS;
		const pageRows = pageCount <= COLS ? 1 : ROWS;
		const gridW = pageCols * cellW;
		const gridX = Math.max(PAD_X, Math.floor((width - gridW) / 2));
		const gridY = pageRows < ROWS
			? gridTop + Math.floor((gridH - pageRows * cellH) / 2)
			: gridTop;

		for (let i = 0; i < VISIBLE; i++) {
			const tile = this.tiles[start + i];
			if (!tile)
				continue;
			const col = i % COLS;
			const row = Math.floor(i / COLS);
			const x = gridX + col * cellW;
			const y = gridY + row * cellH;
			const selected = start + i === this.index;
			const ink = selected ? BG : INK;
			const accent = tile.bad ? RED : ON;

			if (selected)
				port.fillColor(ON, x + 1, y + 1, cellW - 2, cellH - 2);

			const iconCy = y + 4 + Math.floor(ICON / 2);
			const iconCx = x + Math.floor(cellW / 2);
			drawFwIcon(port, tile.id, iconCx, iconCy, ICON, selected ? BG : accent);

			if (tile.big) {
				const badge = "超";
				const bw = port.measureString(badge, faceStyle).width;
				drawText(port, badge, selected ? BG : RED, x + cellW - bw - 2, y - ROW_LEAD + 2, bw);
			}

			const name = shortLabel(tile.label);
			const nameW = port.measureString(name, faceStyle).width;
			const nameX = x + Math.max(0, Math.floor((cellW - nameW) / 2));
			const nameY = y + cellH - ROW_PITCH + 2;
			drawText(port, name, selected ? BG : ink, nameX, nameY - ROW_LEAD, Math.max(1, nameW + 2));
		}

		if (!paging)
			return;
		const pages = Math.ceil(n / VISIBLE);
		const page = Math.floor(start / VISIBLE);
		const pipGap = 6;
		const pip = 4;
		const span = pages * pip + (pages - 1) * pipGap;
		let px = Math.floor((width - span) / 2);
		const py = height - 5;
		for (let p = 0; p < pages; p++) {
			if (p === page)
				fillDisk(port, px + (pip >> 1), py, pip >> 1, ON);
			else
				port.fillColor(INK, px, py - 1, pip, 2);
			px += pip + pipGap;
		}
	}
}
