/*
	Phosphor colors and face names shared by every firmware.

	Status glyphs: prefer drawGlyph over bare Chinese / English status words.
	OK → green check, BAD → red cross; battery / brightness / volume / link / media
	use the matching Glyph.
*/

export const BG = "black";
export const INK = "white";
export const ON = "#39FF14";
/** Fail / reject. Pair with drawCross. */
export const RED = "#FF2A2A";
/** Unlit 7-segment ghosts. Too dark for text. */
export const DIM = "#143214";
/** Vial rings and ticks. Visible, quieter than ON. */
export const MID = "#208F18";
/** Off-pitch, hot meter, tilted bubble. */
export const AMBER = "#FFB000";
/** Vial liquid and unpressed key faces. */
export const WELL = "#0E2C10";

export const FONT_UI = "bold 20px UI";
export const FONT_WORD = "bold 48px Word";

/**
	Shared status glyph. `level` meaning depends on kind:
	batt/progress 0..100 (batt drawn as 4 bars); bright 1..4; vol 0..10 (0 = mute look).
*/
export type Glyph =
	| ""
	| "ok"
	| "bad"
	| "batt"
	| "bright"
	| "vol"
	| "mute"
	| "wifi"
	| "bt"
	| "play"
	| "pause"
	| "rec"
	| "on"
	| "off"
	| "shuffle"
	| "phone"
	| "miss"
	| "sd"
	| "usb"
	| "retry"
	| "caps"
	| "progress";

export type GlyphSpec = { kind: Glyph; level?: number };

/**
	Map a short status note to a glyph. Progress / neutral notes may still
	carry a level (brightness, volume, load percent).
*/
export function noteGlyph(note: string): GlyphSpec {
	if (!note)
		return { kind: "" };
	if (note.indexOf("亮度 ") === 0) {
		const n = parseInt(note.slice(3), 10);
		return { kind: "bright", level: n === n && n > 0 ? n : 1 };
	}
	if (note.indexOf("音量 ") === 0) {
		const n = parseInt(note.slice(3), 10);
		return { kind: n === 0 ? "mute" : "vol", level: n === n ? n : 0 };
	}
	if (note.indexOf("Vol ") === 0) {
		const n = parseInt(note.slice(4), 10);
		return { kind: n === 0 ? "mute" : "vol", level: n === n ? n : 0 };
	}
	if (note.indexOf("载入 ") === 0 && note.charAt(note.length - 1) === "%") {
		const n = parseInt(note.slice(3), 10);
		return { kind: "progress", level: n === n ? n : 0 };
	}
	if (note.indexOf("USB ") === 0 && note.charAt(note.length - 1) === "%") {
		const n = parseInt(note.slice(4), 10);
		return { kind: "usb", level: n === n ? n : 0 };
	}
	if (note === "低电")
		return { kind: "batt", level: 12 };
	if (note === "Sound")
		return { kind: "on" };
	if (note === "Hourly")
		return { kind: "on" };
	if (note === "闹钟关")
		return { kind: "off" };
	if (note === "录音中" || note === "录音")
		return { kind: "rec" };
	if (note === "播放")
		return { kind: "play" };
	if (note === "进行")
		return { kind: "play" };
	if (note === "重启")
		return { kind: "retry" };
	if (note === "无卡")
		return { kind: "sd" };
	if (note === "已挂载")
		return { kind: "ok" };
	if (note === "挂载中")
		return { kind: "usb" };
	if (note === "先弹出" || note.indexOf("先弹出") >= 0)
		return { kind: "sd" };
	if (note === "配对已清除" || note === "已连接" || note.indexOf("已连接") === 0)
		return { kind: "bt" };
	if (note === "正在配对" || note === "连接中")
		return { kind: "bt" };
	if (note === "Caps" || note.indexOf("Caps") >= 0)
		return { kind: "caps" };
	if (
		note === "已设"
		|| note === "已刷新"
		|| note === "saved"
		|| note === "Weather"
		|| note.indexOf("已存") === 0
		|| note.indexOf("成功") >= 0
	)
		return { kind: "ok" };
	if (
		note.indexOf("失败") >= 0
		|| note === "读断了"
		|| note === "Wx fail"
		|| note === "无法播放"
		|| note === "键盘失败"
		|| note === "蓝牙失败"
		|| note === "蓝牙没起来"
		|| note === "无麦克风"
		|| note.indexOf("不对") >= 0
		|| note.indexOf("错误") >= 0
	)
		return { kind: "bad" };
	if (note === "Wi-Fi" || note === "无线" || note.indexOf("WiFi") === 0 || note === "正在连接" || note === "正在对时")
		return { kind: "wifi" };
	if (note === "蓝牙" || note === "无蓝牙" || note === "无无线")
		return { kind: note.indexOf("无") === 0 ? "bad" : "bt" };
	return { kind: "" };
}
