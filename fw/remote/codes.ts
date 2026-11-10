/*
	TV codes and protocol encoders. Each encoder returns mark / space
	durations in µs (starting with a mark) and the carrier frequency.

	Codes are the widely published TV defaults for each brand. Older and
	newer sets of the same brand sometimes differ; add rows here as needed.
*/

export type Key = "power" | "volUp" | "volDown" | "mute" | "chUp" | "chDown" | "input"
	| "up" | "down" | "left" | "right" | "ok" | "back" | "home";

export const KEY_LABEL: Readonly<Record<Key, string>> = Object.freeze({
	power: "电源",
	volUp: "音量+",
	volDown: "音量-",
	mute: "静音",
	chUp: "频道+",
	chDown: "频道-",
	input: "信号源",
	up: "上",
	down: "下",
	left: "左",
	right: "右",
	ok: "确定",
	back: "返回",
	home: "主页",
});

export type Burst = { hz: number; durations: number[] };

type Protocol = "nec" | "samsung" | "sirc12" | "rc5";

export type Brand = {
	id: string;
	label: string;
	protocol: Protocol;
	address: number;
	keys: Partial<Record<Key, number>>;
};

export const BRANDS: readonly Brand[] = Object.freeze([
	{
		id: "samsung",
		label: "三星",
		protocol: "samsung",
		address: 0x07,
		keys: {
			power: 0x02, volUp: 0x07, volDown: 0x0B, mute: 0x0F, chUp: 0x12, chDown: 0x10, input: 0x01,
			up: 0x60, down: 0x61, left: 0x65, right: 0x62, ok: 0x68, back: 0x58, home: 0x79,
		},
	},
	{
		id: "lg",
		label: "LG",
		protocol: "nec",
		address: 0x04,
		keys: {
			power: 0x08, volUp: 0x02, volDown: 0x03, mute: 0x09, chUp: 0x00, chDown: 0x01, input: 0x0B,
			up: 0x40, down: 0x41, left: 0x07, right: 0x06, ok: 0x44, back: 0x28,
		},
	},
	{
		id: "sony",
		label: "索尼",
		protocol: "sirc12",
		address: 0x01,
		keys: {
			power: 21, volUp: 18, volDown: 19, mute: 20, chUp: 16, chDown: 17, input: 37,
			up: 116, down: 117, left: 52, right: 51, ok: 101,
		},
	},
	{
		id: "philips",
		label: "飞利浦",
		protocol: "rc5",
		address: 0x00,
		keys: {
			power: 12, volUp: 16, volDown: 17, mute: 13, chUp: 32, chDown: 33,
		},
	},
]);

/* NEC family: 560 µs units. */
const NEC_UNIT = 560;

function pushBitsLsb(out: number[], value: number, bits: number) {
	for (let i = 0; i < bits; i++) {
		out.push(NEC_UNIT);
		out.push((value >> i) & 1 ? NEC_UNIT * 3 : NEC_UNIT);
	}
}

/** NEC: 9 ms / 4.5 ms leader, address, ~address, command, ~command, stop bit. */
function nec(address: number, command: number): Burst {
	const d = [9000, 4500];
	pushBitsLsb(d, address & 0xff, 8);
	pushBitsLsb(d, ~address & 0xff, 8);
	pushBitsLsb(d, command & 0xff, 8);
	pushBitsLsb(d, ~command & 0xff, 8);
	d.push(NEC_UNIT);
	return { hz: 38000, durations: d };
}

/** Samsung32: 4.5 ms / 4.5 ms leader, address twice, command, ~command. */
function samsung(address: number, command: number): Burst {
	const d = [4500, 4500];
	pushBitsLsb(d, address & 0xff, 8);
	pushBitsLsb(d, address & 0xff, 8);
	pushBitsLsb(d, command & 0xff, 8);
	pushBitsLsb(d, ~command & 0xff, 8);
	d.push(NEC_UNIT);
	return { hz: 38000, durations: d };
}

/**
	Sony SIRC 12-bit at 40 kHz: 2.4 ms leader, 7 command bits then 5
	address bits, LSB first. Sent three times on a 45 ms frame period.
*/
function sirc12(address: number, command: number): Burst {
	const frame: number[] = [2400];
	let used = 2400;
	const bits = (command & 0x7f) | ((address & 0x1f) << 7);
	for (let i = 0; i < 12; i++) {
		frame.push(600);
		const mark = (bits >> i) & 1 ? 1200 : 600;
		frame.push(mark);
		used += 600 + mark;
	}
	const d: number[] = [];
	for (let r = 0; r < 3; r++) {
		for (const v of frame)
			d.push(v);
		if (r < 2)
			d.push(45000 - used);
	}
	return { hz: 40000, durations: d };
}

/**
	Philips RC5 at 36 kHz, 889 µs half bits, Manchester (1 = low→high).
	14 bits: two start bits, toggle, 5 address bits, 6 command bits, MSB first.
	The leading low half of the first start bit is idle and dropped.
*/
function rc5(address: number, command: number, toggle: boolean): Burst {
	const HALF = 889;
	const bits: number[] = [1, command & 0x40 ? 0 : 1, toggle ? 1 : 0];
	for (let i = 4; i >= 0; i--)
		bits.push((address >> i) & 1);
	for (let i = 5; i >= 0; i--)
		bits.push((command >> i) & 1);
	/* Half-bit levels, 1 = mark. */
	const halves: number[] = [];
	for (const b of bits) {
		halves.push(b ? 0 : 1);
		halves.push(b ? 1 : 0);
	}
	while (halves.length && halves[0] === 0)
		halves.shift();
	const d: number[] = [];
	let level = 1;
	let run = 0;
	for (const h of halves) {
		if (h === level)
			run += HALF;
		else {
			d.push(run);
			level = h;
			run = HALF;
		}
	}
	if (level === 1)
		d.push(run);
	return { hz: 36000, durations: d };
}

/** Burst for one key on a brand, or null if that brand has no such key. */
export function encode(brand: Brand, key: Key, toggle: boolean): Burst | null {
	const command = brand.keys[key];
	if (command === undefined)
		return null;
	if (brand.protocol === "nec")
		return nec(brand.address, command);
	if (brand.protocol === "samsung")
		return samsung(brand.address, command);
	if (brand.protocol === "sirc12")
		return sirc12(brand.address, command);
	return rc5(brand.address, command, toggle);
}
