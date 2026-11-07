/*
	Desktop stand-in. Chip reads "模拟". Addresses are locally administered
	and not a board. Uptime, temperature, and the cell move so the one-second
	refresh is visible.
*/

import type { BoardSnap } from "format";

const BOOT = Date.now();

export function readBoard(): BoardSnap {
	const uptime = Math.floor((Date.now() - BOOT) / 1000);
	return {
		chip: "模拟",
		revision: "0.0",
		cores: 2,
		mhz: 240,
		flash: 8 * 1024 * 1024,
		internal: 342 * 1024,
		internalFree: 240 * 1024 - (uptime % 30) * 1024,
		internalMin: 180 * 1024,
		psram: 8 * 1024 * 1024,
		psramFree: 7 * 1024 * 1024,
		wifi: "02:00:00:00:00:01",
		ble: "02:00:00:00:00:03",
		reset: 1,
		uptime,
		tempDeci: 360 + (uptime % 10),
		slot: "ota_1",
		idf: "v6.1.0",
		batteryMv: 3800 + (uptime % 20) * 10,
		keyboard: "无",
		imu: "无",
		codec: "无",
	};
}
