/*
	Falling-block puzzle on a COLS × ROWS well. Seven four-cell pieces drawn
	from a shuffled bag, simple wall kicks, a ghost showing where the piece
	lands, and a short lock delay so a piece can still slide at the bottom.
*/

export const COLS = 10;
export const ROWS = 18;

type Cells = readonly (readonly [number, number])[];
type Piece = { size: number; cells: Cells };

/* Spawn orientation inside a size × size box. */
const PIECES: readonly Piece[] = Object.freeze([
	{ size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
	{ size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
	{ size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
	{ size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
	{ size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
	{ size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
	{ size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
]);

const KICKS: readonly (readonly [number, number])[] = Object.freeze([
	[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1],
]);

const LINE_SCORE = Object.freeze([0, 100, 300, 500, 800]);
const LOCK_MS = 450;

function rotate(cells: Cells, size: number, turns: number): [number, number][] {
	let out = cells.map(([x, y]) => [x, y] as [number, number]);
	for (let t = 0; t < ((turns % 4) + 4) % 4; t++)
		out = out.map(([x, y]) => [size - 1 - y, x] as [number, number]);
	return out;
}

export class Blocks {
	/** 0 = empty, 1..7 = piece kind + 1. Row-major, row 0 at the top. */
	well: Uint8Array = new Uint8Array(COLS * ROWS);
	kind = 0;
	turn = 0;
	px = 0;
	py = 0;
	next = 0;
	bag: number[] = [];
	score = 0;
	lines = 0;
	over = false;
	/** Rows cleared by the last lock (for a sound). */
	cleared = 0;
	/** Time the piece first touched down, or 0 while it can still fall. */
	groundedAt = 0;

	constructor() {
		this.next = this.draw();
		this.spawn();
	}

	get level(): number {
		return Math.floor(this.lines / 10);
	}

	/** Gravity step in ms. */
	get fallMs(): number {
		return Math.max(80, 700 - this.level * 60);
	}

	draw(): number {
		if (!this.bag.length) {
			this.bag = [0, 1, 2, 3, 4, 5, 6];
			for (let i = this.bag.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				const t = this.bag[i];
				this.bag[i] = this.bag[j];
				this.bag[j] = t;
			}
		}
		return this.bag.pop() as number;
	}

	spawn() {
		this.kind = this.next;
		this.next = this.draw();
		this.turn = 0;
		const size = PIECES[this.kind].size;
		this.px = Math.floor((COLS - size) / 2);
		this.py = 0;
		this.groundedAt = 0;
		if (!this.fits(this.px, this.py, this.turn))
			this.over = true;
	}

	/** Absolute cells of the current piece at a trial position. */
	cellsAt(x: number, y: number, turn: number, kind = this.kind): [number, number][] {
		const p = PIECES[kind];
		return rotate(p.cells, p.size, turn).map(([cx, cy]) => [cx + x, cy + y] as [number, number]);
	}

	/** Cells of the next piece in its own box, for the preview. */
	nextCells(): { size: number; cells: [number, number][] } {
		const p = PIECES[this.next];
		return { size: p.size, cells: rotate(p.cells, p.size, 0) };
	}

	fits(x: number, y: number, turn: number): boolean {
		for (const [cx, cy] of this.cellsAt(x, y, turn)) {
			if (cx < 0 || cx >= COLS || cy >= ROWS)
				return false;
			if (cy >= 0 && this.well[cy * COLS + cx])
				return false;
		}
		return true;
	}

	shift(dx: number): boolean {
		if (this.over || !this.fits(this.px + dx, this.py, this.turn))
			return false;
		this.px += dx;
		this.refreshGround();
		return true;
	}

	rotate(dir: 1 | -1): boolean {
		if (this.over)
			return false;
		const turn = this.turn + dir;
		for (const [kx, ky] of KICKS) {
			if (this.fits(this.px + kx, this.py + ky, turn)) {
				this.px += kx;
				this.py += ky;
				this.turn = ((turn % 4) + 4) % 4;
				this.refreshGround();
				return true;
			}
		}
		return false;
	}

	/** After a slide or turn: restart the lock clock only if it still rests on something. */
	refreshGround() {
		this.groundedAt = this.fits(this.px, this.py + 1, this.turn) ? 0 : Date.now();
	}

	/**
		One gravity step. Returns true when the piece locked.
		`soft` adds a point per row, like holding the drop key.
	*/
	fall(soft = false): boolean {
		if (this.over)
			return false;
		this.cleared = 0;
		if (this.fits(this.px, this.py + 1, this.turn)) {
			this.py++;
			if (soft)
				this.score++;
			this.groundedAt = this.fits(this.px, this.py + 1, this.turn) ? 0 : Date.now();
			return false;
		}
		if (!this.groundedAt)
			this.groundedAt = Date.now();
		if (Date.now() - this.groundedAt < LOCK_MS && !soft)
			return false;
		this.lock();
		return true;
	}

	hardDrop() {
		if (this.over)
			return;
		let rows = 0;
		while (this.fits(this.px, this.py + 1, this.turn)) {
			this.py++;
			rows++;
		}
		this.score += rows * 2;
		this.lock();
	}

	ghostY(): number {
		let y = this.py;
		while (this.fits(this.px, y + 1, this.turn))
			y++;
		return y;
	}

	lock() {
		for (const [cx, cy] of this.cellsAt(this.px, this.py, this.turn)) {
			if (cy < 0) {
				this.over = true;
				continue;
			}
			this.well[cy * COLS + cx] = this.kind + 1;
		}
		let cleared = 0;
		for (let y = ROWS - 1; y >= 0; y--) {
			let full = true;
			for (let x = 0; x < COLS; x++) {
				if (!this.well[y * COLS + x]) {
					full = false;
					break;
				}
			}
			if (!full)
				continue;
			this.well.copyWithin(COLS, 0, y * COLS);
			this.well.fill(0, 0, COLS);
			cleared++;
			y++;
		}
		this.cleared = cleared;
		if (cleared) {
			this.score += LINE_SCORE[cleared] * (this.level + 1);
			this.lines += cleared;
		}
		if (!this.over)
			this.spawn();
	}
}
