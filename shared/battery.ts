/*
	GPIO10 is half the cell (100k/100k). Callers pass millivolts of the cell.
*/

/** Below this, the divider is sitting on ground: no cell. */
export const BATTERY_ABSENT_MV = 2800;
/** Linear estimate. A resting 1S cell, not a fuel gauge. */
export const BATTERY_EMPTY_MV = 3300;
export const BATTERY_FULL_MV = 4200;
/** Banner threshold. About 11% on the same line. */
export const BATTERY_LOW_MV = 3400;

export function batteryPresent(mv: number): boolean {
	return mv >= BATTERY_ABSENT_MV && mv === mv;
}

/** 0..100, or null when no cell. */
export function batteryPercent(mv: number): number | null {
	if (!batteryPresent(mv))
		return null;
	let pct = Math.round((mv - BATTERY_EMPTY_MV) * 100 / (BATTERY_FULL_MV - BATTERY_EMPTY_MV));
	if (pct < 0)
		pct = 0;
	if (pct > 100)
		pct = 100;
	return pct;
}

export function batteryLabel(mv: number): string {
	const pct = batteryPercent(mv);
	if (pct === null)
		return "无";
	const v = (Math.round(mv / 10) / 100).toFixed(2) + "V";
	return v + " " + pct + "%";
}

/** Short top-bar form. Empty when there is no cell. */
export function batteryShort(mv: number): string {
	const pct = batteryPercent(mv);
	if (pct === null)
		return "";
	return pct + "%";
}

export function batteryLow(mv: number): boolean {
	return batteryPresent(mv) && mv <= BATTERY_LOW_MV;
}
