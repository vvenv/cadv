/** The other flash slot is about 1.9MB. Larger images cannot be loaded. */
export const SLOT_LIMIT = 1900 * 1024;

export function fitsSlot(size: number): boolean {
	return size > 0 && size <= SLOT_LIMIT;
}
