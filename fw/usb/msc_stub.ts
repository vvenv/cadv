/*
	Desktop stub. No TinyUSB or SDSPI on the host simulator.
*/

export type MscStatus = {
	ready: boolean;
	sectors: number;
	sectorSize: number;
};

export function start(): string {
	return "模拟无 USB 盘";
}

export function stop(): void {
}

export function status(): MscStatus {
	return { ready: false, sectors: 0, sectorSize: 0 };
}
