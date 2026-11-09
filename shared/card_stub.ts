/*
	Desktop stand-in. A fixed volume so the free-space line is visible.
*/

export type CardSpace = { free: number; total: number };

export function cardSpace(): CardSpace | null {
	return { free: 12 * 1024 * 1024, total: 32 * 1024 * 1024 };
}
