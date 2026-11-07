/*
	QR Code model 2, version 1, error correction L, byte mode.
	17 bytes maximum. Mask 0. Enough for a short line on the 135px panel.
*/

const ECC = 7;
const DATA = 19;
const SIZE = 21;

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function initField() {
	let x = 1;
	for (let i = 0; i < 255; i++) {
		EXP[i] = x;
		LOG[x] = i;
		x <<= 1;
		if (x & 0x100)
			x ^= 0x11d;
	}
	for (let i = 255; i < 512; i++)
		EXP[i] = EXP[i - 255];
})();

function mul(a: number, b: number): number {
	if (a === 0 || b === 0)
		return 0;
	return EXP[LOG[a] + LOG[b]];
}

function rs(data: Uint8Array): Uint8Array {
	const gen = new Uint8Array(ECC + 1);
	gen[0] = 1;
	for (let i = 0; i < ECC; i++) {
		for (let j = i; j >= 0; j--)
			gen[j + 1] ^= mul(gen[j], EXP[i]);
	}
	const ecc = new Uint8Array(ECC);
	for (let i = 0; i < data.length; i++) {
		const factor = data[i] ^ ecc[0];
		ecc.copyWithin(0, 1);
		ecc[ECC - 1] = 0;
		if (factor === 0)
			continue;
		for (let j = 0; j < ECC; j++)
			ecc[j] ^= mul(gen[j + 1], factor);
	}
	return ecc;
}

function bitsOf(text: string): number[] {
	const bytes: number[] = [];
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c < 0x80)
			bytes.push(c);
		else if (c < 0x800) {
			bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
		}
		else {
			bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
		}
	}
	if (bytes.length > 17)
		return [];
	const bits: number[] = [];
	push(bits, 0x4, 4);
	push(bits, bytes.length, 8);
	for (let i = 0; i < bytes.length; i++)
		push(bits, bytes[i], 8);
	const cap = DATA * 8;
	const term = Math.min(4, cap - bits.length);
	push(bits, 0, term);
	while (bits.length % 8 !== 0)
		bits.push(0);
	const pads = [0xec, 0x11];
	let p = 0;
	while (bits.length < cap) {
		push(bits, pads[p & 1], 8);
		p++;
	}
	return bits;
}

function push(bits: number[], value: number, n: number) {
	for (let i = n - 1; i >= 0; i--)
		bits.push((value >>> i) & 1);
}

function modules(): Uint8Array {
	const n = SIZE * SIZE;
	const fun = new Uint8Array(n);
	const grid = new Uint8Array(n);
	const set = (x: number, y: number, dark: number) => {
		if (x < 0 || y < 0 || x >= SIZE || y >= SIZE)
			return;
		const i = y * SIZE + x;
		fun[i] = 1;
		grid[i] = dark;
	};
	const finder = (x0: number, y0: number) => {
		for (let y = -1; y <= 7; y++) {
			for (let x = -1; x <= 7; x++) {
				const xx = x0 + x;
				const yy = y0 + y;
				const edge = x < 0 || y < 0 || x > 6 || y > 6;
				const ring = !edge && (x === 0 || y === 0 || x === 6 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
				set(xx, yy, edge ? 0 : ring ? 1 : 0);
			}
		}
	};
	for (let i = 0; i < SIZE; i++) {
		set(i, 6, i & 1 ? 0 : 1);
		set(6, i, i & 1 ? 0 : 1);
	}
	finder(0, 0);
	finder(SIZE - 7, 0);
	finder(0, SIZE - 7);
	set(8, SIZE - 8, 1);
	return grid;
}

/** Dark modules, row-major, or null when the text does not fit. */
export function qrBits(text: string): Uint8Array | null {
	const bits = bitsOf(text);
	if (!bits.length && text.length)
		return null;
	if (!text.length)
		return null;
	const data = new Uint8Array(DATA);
	for (let i = 0; i < DATA; i++) {
		let b = 0;
		for (let k = 0; k < 8; k++)
			b = (b << 1) | bits[i * 8 + k];
		data[i] = b;
	}
	const ecc = rs(data);
	const all: number[] = [];
	for (let i = 0; i < data.length; i++)
		push(all, data[i], 8);
	for (let i = 0; i < ecc.length; i++)
		push(all, ecc[i], 8);

	const grid = modules();
	const fun = functionMask();
	let i = 0;
	let upward = true;
	for (let col = SIZE - 1; col > 0; col -= 2) {
		if (col === 6)
			col = 5;
		for (let dy = 0; dy < SIZE; dy++) {
			const y = upward ? SIZE - 1 - dy : dy;
			for (let dx = 0; dx < 2; dx++) {
				const x = col - dx;
				if (fun[y * SIZE + x])
					continue;
				const bit = i < all.length ? all[i] : 0;
				i++;
				const mask = ((x + y) & 1) === 0;
				grid[y * SIZE + x] = bit ^ (mask ? 1 : 0);
			}
		}
		upward = !upward;
	}
	placeFormat(grid);
	return grid;
}

export const QR_SIZE = SIZE;

function functionMask(): Uint8Array {
	const mark = new Uint8Array(SIZE * SIZE);
	const stamp = (x: number, y: number) => {
		if (x >= 0 && y >= 0 && x < SIZE && y < SIZE)
			mark[y * SIZE + x] = 1;
	};
	for (let y = 0; y < 9; y++) {
		for (let x = 0; x < 9; x++)
			stamp(x, y);
	}
	for (let y = 0; y < 9; y++) {
		for (let x = SIZE - 8; x < SIZE; x++)
			stamp(x, y);
	}
	for (let y = SIZE - 8; y < SIZE; y++) {
		for (let x = 0; x < 9; x++)
			stamp(x, y);
	}
	for (let i = 0; i < SIZE; i++) {
		stamp(i, 6);
		stamp(6, i);
	}
	stamp(8, SIZE - 8);
	for (let i = 0; i < 9; i++) {
		stamp(8, i);
		stamp(i, 8);
	}
	for (let i = 0; i < 8; i++) {
		stamp(SIZE - 1 - i, 8);
		stamp(8, SIZE - 1 - i);
	}
	return mark;
}

function placeFormat(grid: Uint8Array) {
	/* ISO format bits for ECC L, mask 0: 0x77c4. Bit 0 is the LSB. */
	const format = 0x77c4;
	let voffset = 0;
	let hoffset = 0;
	for (let i = 0; i < 8; i++) {
		const vbit = (format >> i) & 1;
		const hbit = (format >> (14 - i)) & 1;
		if (i === 6) {
			voffset += 1;
			hoffset = 1;
		}
		grid[(i + voffset) * SIZE + 8] = vbit;
		grid[8 * SIZE + (i + hoffset)] = hbit;
		grid[8 * SIZE + (SIZE - 1 - i)] = vbit;
		grid[(SIZE - 1 - i) * SIZE + 8] = hbit;
	}
	grid[(SIZE - 8) * SIZE + 8] = 1;
}
