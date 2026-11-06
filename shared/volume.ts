export const VOL_MIN = 0;
export const VOL_MAX = 10;
export const VOL_DEFAULT = 6;

/** Map 0..10 UI steps → AudioOut volume 0..256. */
export function audioVolume(level: number): number {
	if (level <= 0)
		return 0;
	if (level >= VOL_MAX)
		return 256;
	return Math.floor((256 * level) / VOL_MAX);
}
