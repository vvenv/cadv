/*
	Turn a board snapshot into rows. No hardware here: the device module
	and the desktop stub both produce a BoardSnap.
	Native fields, tab-separated, match fw/info/board.c:
	chip rev cores mhz flash intTotal intFree intMin
	psramTotal psramFree wifi ble reset uptime tempDeci slot idf
*/

import { batteryLabel } from "battery";

export type BoardExtra = {
	batteryMv: number;
	keyboard: string;
	imu: string;
	codec: string;
};

export type BoardSnap = BoardExtra & {
	chip: string;
	revision: string;
	cores: number;
	mhz: number;
	flash: number;
	internal: number;
	internalFree: number;
	internalMin: number;
	psram: number;
	psramFree: number;
	wifi: string;
	ble: string;
	reset: number;
	uptime: number;
	/** Tenths of a degree C. -999 means no reading. */
	tempDeci: number;
	slot: string;
	idf: string;
};

export type InfoRow = { label: string; value: string };

const RESET = Object.freeze([
	"未知",
	"上电",
	"外部",
	"软件",
	"崩溃",
	"中断狗",
	"任务狗",
	"看门狗",
	"深睡",
	"欠压",
	"SDIO",
	"USB",
	"JTAG",
	"熔丝",
	"毛刺",
	"锁死",
]);

function num(text: string | undefined): number {
	if (text == null || text === "")
		return 0;
	const n = Number(text);
	if (n !== n)
		return 0;
	return n;
}

export function parseSnap(raw: string, extra: BoardExtra): BoardSnap {
	const p = raw.split("\t");
	const tempText = p[14];
	return {
		chip: p[0] || "?",
		revision: p[1] || "?",
		cores: num(p[2]),
		mhz: num(p[3]),
		flash: num(p[4]),
		internal: num(p[5]),
		internalFree: num(p[6]),
		internalMin: num(p[7]),
		psram: num(p[8]),
		psramFree: num(p[9]),
		wifi: p[10] || "",
		ble: p[11] || "",
		reset: num(p[12]),
		uptime: num(p[13]),
		tempDeci: tempText == null || tempText === "" ? -999 : num(tempText),
		slot: p[15] || "?",
		idf: p[16] || "?",
		batteryMv: extra.batteryMv,
		keyboard: extra.keyboard,
		imu: extra.imu,
		codec: extra.codec,
	};
}

/** Missing or nonsense. Zero is "无" — a size we could not read. */
export function sizeText(bytes: number): string {
	if (!(bytes > 0))
		return "无";
	return qtyText(bytes);
}

/** A measured count. Zero is a real reading, not a missing sensor. */
export function countText(bytes: number): string {
	if (!(bytes >= 0) || bytes !== bytes)
		return "无";
	return qtyText(bytes);
}

function qtyText(bytes: number): string {
	if (!(bytes > 0))
		return "0KB";
	if (bytes >= 1024 * 1024) {
		const tenths = Math.round(bytes / (1024 * 1024) * 10);
		return Math.floor(tenths / 10) + "." + (tenths % 10) + "MB";
	}
	return Math.round(bytes / 1024) + "KB";
}

export function pairText(free: number, total: number): string {
	if (!(total > 0))
		return "无";
	if (!(free >= 0) || free !== free)
		return "无";
	return countText(free) + "/" + countText(total);
}

export function clockText(cores: number, mhz: number): string {
	if (cores <= 0)
		return "无";
	return cores + "x" + mhz + "MHz";
}

export function uptimeText(sec: number): string {
	if (sec < 0 || sec !== sec)
		sec = 0;
	sec = Math.floor(sec);
	const s = sec % 60;
	const m = Math.floor(sec / 60) % 60;
	const h = Math.floor(sec / 3600);
	const pad = (n: number) => (n < 10 ? "0" + n : String(n));
	if (h >= 100) {
		const d = Math.floor(h / 24);
		return d + "d" + pad(h % 24) + ":" + pad(m);
	}
	return h + ":" + pad(m) + ":" + pad(s);
}

export function tempText(deci: number): string {
	if (deci < -400 || deci > 1500 || deci !== deci)
		return "无";
	const sign = deci < 0 ? "-" : "";
	const a = Math.abs(Math.trunc(deci));
	return sign + Math.floor(a / 10) + "." + (a % 10) + "℃";
}

export function resetText(code: number): string {
	if (code < 0 || code >= RESET.length || code !== Math.trunc(code))
		return "未知";
	return RESET[code];
}

function textOrNone(value: string): string {
	return value ? value : "无";
}

export function infoRows(snap: BoardSnap): InfoRow[] {
	return [
		{ label: "芯片", value: textOrNone(snap.chip) },
		{ label: "修订", value: textOrNone(snap.revision) },
		{ label: "主频", value: clockText(snap.cores, snap.mhz) },
		{ label: "闪存", value: sizeText(snap.flash) },
		{ label: "内存", value: pairText(snap.internalFree, snap.internal) },
		{ label: "PSRAM", value: pairText(snap.psramFree, snap.psram) },
		{ label: "最低", value: snap.internal > 0 ? countText(snap.internalMin) : "无" },
		{ label: "无线", value: textOrNone(snap.wifi) },
		{ label: "蓝牙", value: textOrNone(snap.ble) },
		{ label: "分区", value: textOrNone(snap.slot) },
		{ label: "启动", value: resetText(snap.reset) },
		{ label: "运行", value: uptimeText(snap.uptime) },
		{ label: "温度", value: tempText(snap.tempDeci) },
		{ label: "电池", value: batteryLabel(snap.batteryMv) },
		{ label: "键盘", value: textOrNone(snap.keyboard) },
		{ label: "姿态", value: textOrNone(snap.imu) },
		{ label: "声卡", value: textOrNone(snap.codec) },
		{ label: "IDF", value: textOrNone(snap.idf) },
	];
}
