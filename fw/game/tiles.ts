/*
	2048 on a 4 × 4 board. Values are stored as the tile number (0 = empty).
*/

export const SIZE = 4;

export class Tiles {
	cells: number[] = [];
	score = 0;
	won = false;
	/** Set once the player has seen the 2048 banner, so it shows only once. */
	keepGoing = false;
	over = false;
	/** Index of the tile that just appeared, for a highlight. */
	spawned = -1;
	/** Largest merge of the last move (for a sound pitch). */
	merged = 0;

	constructor() {
		for (let i = 0; i < SIZE * SIZE; i++)
			this.cells.push(0);
		this.spawn();
		this.spawn();
	}

	spawn() {
		const empty: number[] = [];
		for (let i = 0; i < this.cells.length; i++) {
			if (!this.cells[i])
				empty.push(i);
		}
		if (!empty.length)
			return;
		const at = empty[Math.floor(Math.random() * empty.length)];
		this.cells[at] = Math.random() < 0.9 ? 2 : 4;
		this.spawned = at;
	}

	/** dir: 0 up, 1 right, 2 down, 3 left. Returns true if anything moved. */
	move(dir: number): boolean {
		if (this.over)
			return false;
		let moved = false;
		this.merged = 0;
		for (let line = 0; line < SIZE; line++) {
			const idx: number[] = [];
			for (let k = 0; k < SIZE; k++) {
				/* k = 0 is the edge the tiles slide toward. */
				let r = 0;
				let c = 0;
				if (dir === 0) { r = k; c = line; }
				else if (dir === 2) { r = SIZE - 1 - k; c = line; }
				else if (dir === 3) { r = line; c = k; }
				else { r = line; c = SIZE - 1 - k; }
				idx.push(r * SIZE + c);
			}
			const vals: number[] = [];
			for (const i of idx) {
				if (this.cells[i])
					vals.push(this.cells[i]);
			}
			const out: number[] = [];
			for (let i = 0; i < vals.length; i++) {
				if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
					const v = vals[i] * 2;
					out.push(v);
					this.score += v;
					if (v > this.merged)
						this.merged = v;
					if (v >= 2048)
						this.won = true;
					i++;
				}
				else
					out.push(vals[i]);
			}
			while (out.length < SIZE)
				out.push(0);
			for (let k = 0; k < SIZE; k++) {
				if (this.cells[idx[k]] !== out[k]) {
					this.cells[idx[k]] = out[k];
					moved = true;
				}
			}
		}
		if (moved) {
			this.spawn();
			this.over = !this.canMove();
		}
		return moved;
	}

	canMove(): boolean {
		for (let r = 0; r < SIZE; r++) {
			for (let c = 0; c < SIZE; c++) {
				const v = this.cells[r * SIZE + c];
				if (!v)
					return true;
				if (c + 1 < SIZE && this.cells[r * SIZE + c + 1] === v)
					return true;
				if (r + 1 < SIZE && this.cells[(r + 1) * SIZE + c] === v)
					return true;
			}
		}
		return false;
	}
}
