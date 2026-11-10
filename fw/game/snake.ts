/*
	Snake on a COLS × ROWS grid. Walls kill. Turns are queued (two deep) so
	quick taps between ticks are not lost, and a turn straight back is ignored.
*/

export const COLS = 29;
export const ROWS = 13;

export type Dir = 0 | 1 | 2 | 3;
/** Up, right, down, left. */
const DX = Object.freeze([0, 1, 0, -1]);
const DY = Object.freeze([-1, 0, 1, 0]);

const START_MS = 170;
const MIN_MS = 70;
const SPEEDUP_MS = 4;

export class Snake {
	/** Cells as y * COLS + x, head first. */
	body: number[] = [];
	dir: Dir = 1;
	queue: Dir[] = [];
	food = -1;
	score = 0;
	over = false;
	/** True for one tick after eating (for a sound). */
	ate = false;

	constructor() {
		const y = ROWS >> 1;
		for (let x = 6; x >= 3; x--)
			this.body.push(y * COLS + x);
		this.placeFood();
	}

	get stepMs(): number {
		return Math.max(MIN_MS, START_MS - this.score * SPEEDUP_MS);
	}

	turn(d: Dir) {
		const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
		if (d === last || (d + 2) % 4 === last || this.queue.length >= 2)
			return;
		this.queue.push(d);
	}

	step() {
		if (this.over)
			return;
		this.ate = false;
		const next = this.queue.shift();
		if (next !== undefined)
			this.dir = next;
		const head = this.body[0];
		const x = head % COLS + DX[this.dir];
		const y = Math.floor(head / COLS) + DY[this.dir];
		if (x < 0 || y < 0 || x >= COLS || y >= ROWS) {
			this.over = true;
			return;
		}
		const cell = y * COLS + x;
		const eating = cell === this.food;
		/* The tail moves away this tick unless we grow, so it is not a collision. */
		const checkLen = eating ? this.body.length : this.body.length - 1;
		for (let i = 0; i < checkLen; i++) {
			if (this.body[i] === cell) {
				this.over = true;
				return;
			}
		}
		this.body.unshift(cell);
		if (eating) {
			this.score++;
			this.ate = true;
			this.placeFood();
		}
		else
			this.body.pop();
	}

	placeFood() {
		const total = COLS * ROWS;
		if (this.body.length >= total) {
			this.food = -1;
			this.over = true;
			return;
		}
		const taken = new Uint8Array(total);
		for (const c of this.body)
			taken[c] = 1;
		let k = Math.floor(Math.random() * (total - this.body.length));
		for (let c = 0; c < total; c++) {
			if (taken[c])
				continue;
			if (k-- === 0) {
				this.food = c;
				return;
			}
		}
	}
}
