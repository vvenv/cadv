export type MscStatus = {
	ready: boolean;
	sectors: number;
	sectorSize: number;
};

/** Start SDSPI + TinyUSB MSC. Empty string on success, short error otherwise. */
export function start(): string;
export function stop(): void;
export function status(): MscStatus;
