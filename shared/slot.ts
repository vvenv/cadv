/** The app slot (ota_1) is 3.9MB (0x3F0000) on the 8MB table. Larger images cannot be loaded. */
export const SLOT_LIMIT = 0x3F0000;

export function fitsSlot(size: number): boolean {
	return size > 0 && size <= SLOT_LIMIT;
}

/*
	True for an ESP app image whose header declares less than 8MB of flash.
	Byte 3's high nibble is the flash size (2 = 4MB, 3 = 8MB). Such an image
	was built for the old 4MB table: it would run from ota_1 above 4MB but
	could not reach otadata to confirm itself, so the bootloader would keep
	rolling it back. Anything that is not an app image returns false.
*/
export function builtForSmallFlash(head: ArrayBuffer): boolean {
	if (head.byteLength < 4)
		return false;
	const bytes = new Uint8Array(head);
	return bytes[0] === 0xE9 && (bytes[3] >> 4) < 3;
}
