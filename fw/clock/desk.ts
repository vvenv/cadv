/*
	Stopwatch, pomodoro, month grid, world clocks, city text,
	manual set, and quiet-hours edit. The clock behavior paints the result.
*/

import type { KeyStroke } from "keyboard";
import { isBack, isConfirm, isPageBack, navDir } from "keys";
import { beijingNowUtc, beijingParts, pad2, timeSynced } from "lunar";
import { monthRows, quietLabel, zoneLine, ZONES } from "when";

export type DeskName = "sw" | "pomo" | "cal" | "zone" | "city" | "manual" | "quiet";

export type DeskPaint =
	| { kind: "face"; title: string; bottom: string }
	| { kind: "list"; title: string; lines: { text: string; selected: boolean }[] }
	| { kind: "text"; title: string; line: string };

const POMO_WORK = 25 * 60;
const POMO_BREAK = 5 * 60;

function hms(total: number): string {
	let t = total | 0;
	if (t < 0)
		t = 0;
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = t % 60;
	return pad2(h) + ":" + pad2(m) + ":" + pad2(s);
}

function field(raw: string): string {
	if (!raw.length)
		return "__";
	if (raw.length === 1)
		return raw + "_";
	return raw.slice(0, 2);
}

export class Desk {
	name: DeskName = "sw";
	swRun = false;
	swAccum = 0;
	swStart = 0;
	laps: number[] = [];
	pomoRun = false;
	pomoWork = true;
	pomoLeft = POMO_WORK;
	pomoEnd = 0;
	pomoCount = 0;
	calYear = 2026;
	calMonth = 1;
	calRow = 0;
	cityText = "";
	manualStep = 0;
	manual = [0, 0, 0, 0, 0];
	manualRaw = "";
	quietStep = 0;
	quiet = [22, 0, 7, 0];
	quietRaw = "";

	enter(name: DeskName): string | null {
		this.name = name;
		if (name === "manual") {
			if (timeSynced())
				return "已对时";
			const p = beijingParts();
			this.manual = [p.y, p.m, p.d, p.hh, p.mm];
			this.manualStep = 3;
			this.manualRaw = "";
		}
		if (name === "quiet") {
			this.quietStep = 0;
			this.quietRaw = "";
		}
		if (name === "city")
			this.cityText = "";
		if (name === "cal") {
			const p = beijingParts();
			this.calYear = timeSynced() ? p.y : 2026;
			this.calMonth = timeSynced() ? p.m : 1;
			this.calRow = 0;
		}
		if (name === "sw") {
			/* keep the running watch */
		}
		if (name === "pomo" && !this.pomoRun && this.pomoLeft <= 0)
			this.pomoLeft = this.pomoWork ? POMO_WORK : POMO_BREAK;
		return null;
	}

	face(): string {
		if (this.name === "sw")
			return hms(this.swSeconds());
		if (this.name === "pomo")
			return hms(this.pomoSeconds());
		if (this.name === "manual")
			return this.manualFace();
		if (this.name === "quiet")
			return this.quietFace();
		return hms(0);
	}

	paint(): DeskPaint {
		if (this.name === "sw") {
			const lap = this.laps.length ? "计次 " + hms(this.laps[this.laps.length - 1]) : "Enter 开始";
			return { kind: "face", title: "秒表", bottom: lap };
		}
		if (this.name === "pomo") {
			const phase = this.pomoWork ? "工作" : "休息";
			return { kind: "face", title: "番茄 " + this.pomoCount + " " + phase, bottom: this.pomoRun ? "进行" : "Enter 开始" };
		}
		if (this.name === "manual") {
			const labels = ["年", "月", "日", "时", "分"];
			const p = this.manual;
			return {
				kind: "face",
				title: "校时 " + labels[this.manualStep],
				bottom: p[0] + "-" + pad2(p[1]) + "-" + pad2(p[2]),
			};
		}
		if (this.name === "quiet") {
			const which = this.quietStep < 2 ? "开始" : "结束";
			return { kind: "face", title: "勿扰 " + which, bottom: pad2(this.quiet[0]) + ":" + pad2(this.quiet[1]) + "-" + pad2(this.quiet[2]) + ":" + pad2(this.quiet[3]) };
		}
		if (this.name === "city")
			return { kind: "text", title: "城市", line: (this.cityText || "") + "_" };
		if (this.name === "zone") {
			const utc = beijingNowUtc();
			const lines = [];
			for (let i = 0; i < ZONES.length; i++)
				lines.push({ text: zoneLine(ZONES[i].name, ZONES[i].offsetMin, utc), selected: false });
			return { kind: "list", title: "世界时间", lines };
		}
		const rows = monthRows(this.calYear, this.calMonth);
		const lines = [];
		for (let i = 0; i < rows.length; i++)
			lines.push({ text: rows[i], selected: i === this.calRow });
		return { kind: "list", title: this.calYear + "-" + pad2(this.calMonth), lines };
	}

	/** Pomodoro phase ended. */
	tick(): boolean {
		if (this.name === "pomo" && this.pomoRun && Date.now() >= this.pomoEnd) {
			if (this.pomoWork)
				this.pomoCount++;
			this.pomoWork = !this.pomoWork;
			this.pomoLeft = this.pomoWork ? POMO_WORK : POMO_BREAK;
			this.pomoEnd = Date.now() + this.pomoLeft * 1000;
			return true;
		}
		return false;
	}

	/**
		back: leave the desk.
		beep: stay, redraw.
		search: city text is ready.
		manual / quiet: values are committed.
	*/
	onStroke(stroke: KeyStroke): "back" | "beep" | "search" | "manual" | "quiet" {
		if (this.name === "city")
			return this.onCity(stroke);
		if (this.name === "manual")
			return this.onDigits(stroke, true);
		if (this.name === "quiet")
			return this.onDigits(stroke, false);
		if (this.name === "cal")
			return this.onCal(stroke);
		if (this.name === "zone")
			return isBack(stroke) ? "back" : "beep";
		if (this.name === "sw")
			return this.onWatch(stroke);
		return this.onPomo(stroke);
	}

	manualParts(): { y: number; m: number; d: number; hh: number; mm: number } {
		return {
			y: this.manual[0],
			m: this.manual[1],
			d: this.manual[2],
			hh: this.manual[3],
			mm: this.manual[4],
		};
	}

	quietMinutes(): { start: number; end: number } {
		return {
			start: this.quiet[0] * 60 + this.quiet[1],
			end: this.quiet[2] * 60 + this.quiet[3],
		};
	}

	private swSeconds(): number {
		let ms = this.swAccum;
		if (this.swRun)
			ms += Date.now() - this.swStart;
		return Math.floor(ms / 1000);
	}

	private pomoSeconds(): number {
		if (!this.pomoRun)
			return this.pomoLeft;
		return Math.max(0, Math.ceil((this.pomoEnd - Date.now()) / 1000));
	}

	private onWatch(stroke: KeyStroke): "back" | "beep" {
		if (isBack(stroke))
			return "back";
		const chars = stroke.chars;
		if (isConfirm(stroke)) {
			if (this.swRun) {
				this.swAccum += Date.now() - this.swStart;
				this.swRun = false;
			}
			else {
				this.swStart = Date.now();
				this.swRun = true;
			}
			return "beep";
		}
		if (chars.some(ch => ch === "l" || ch === "L" || ch === ".")) {
			if (this.laps.length < 5)
				this.laps.push(this.swSeconds());
			return "beep";
		}
		if (chars.some(ch => ch === "r" || ch === "R") && !this.swRun) {
			this.swAccum = 0;
			this.laps = [];
			return "beep";
		}
		return "beep";
	}

	private onPomo(stroke: KeyStroke): "back" | "beep" {
		if (isBack(stroke)) {
			this.pomoRun = false;
			return "back";
		}
		if (isConfirm(stroke)) {
			if (this.pomoRun) {
				this.pomoLeft = this.pomoSeconds();
				this.pomoRun = false;
			}
			else {
				if (this.pomoLeft <= 0)
					this.pomoLeft = this.pomoWork ? POMO_WORK : POMO_BREAK;
				this.pomoEnd = Date.now() + this.pomoLeft * 1000;
				this.pomoRun = true;
			}
			return "beep";
		}
		if (stroke.chars.some(ch => ch === "r" || ch === "R") && !this.pomoRun) {
			this.pomoWork = true;
			this.pomoLeft = POMO_WORK;
			this.pomoCount = 0;
			return "beep";
		}
		return "beep";
	}

	private onCal(stroke: KeyStroke): "back" | "beep" {
		if (isBack(stroke))
			return "back";
		const dir = navDir(stroke);
		if (dir === 0)
			return "beep";
		let month = this.calMonth + dir;
		let year = this.calYear;
		if (month < 1) {
			month = 12;
			year--;
		}
		if (month > 12) {
			month = 1;
			year++;
		}
		if (year < 1900)
			year = 1900;
		if (year > 2100)
			year = 2100;
		this.calYear = year;
		this.calMonth = month;
		this.calRow = 0;
		return "beep";
	}

	private onCity(stroke: KeyStroke): "back" | "beep" | "search" {
		if (isPageBack(stroke))
			return "back";
		if (stroke.enter)
			return this.cityText.trim() ? "search" : "beep";
		if (stroke.del) {
			this.cityText = this.cityText.slice(0, -1);
			return "beep";
		}
		for (const ch of stroke.chars) {
			if (this.cityText.length < 24)
				this.cityText += ch;
		}
		return "beep";
	}

	private onDigits(stroke: KeyStroke, manual: boolean): "back" | "beep" | "manual" | "quiet" {
		if (isPageBack(stroke))
			return "back";
		const step = manual ? this.manualStep : this.quietStep;
		const width = manual && step === 0 ? 4 : 2;
		let raw = manual ? this.manualRaw : this.quietRaw;
		let typed = false;
		for (const ch of stroke.chars) {
			if (ch >= "0" && ch <= "9" && raw.length < width) {
				raw += ch;
				typed = true;
			}
		}
		if (stroke.del) {
			if (raw.length)
				raw = raw.slice(0, -1);
			else if (step > 0) {
				if (manual)
					this.manualStep = step - 1;
				else
					this.quietStep = step - 1;
				raw = "";
			}
			else
				return "back";
		}
		if (manual)
			this.manualRaw = raw;
		else
			this.quietRaw = raw;
		if ((typed && raw.length >= width) || isConfirm(stroke))
			return this.commitDigit(manual) ? (manual ? "manual" : "quiet") : "beep";
		return "beep";
	}

	private commitDigit(manual: boolean): boolean {
		const step = manual ? this.manualStep : this.quietStep;
		const raw = manual ? this.manualRaw : this.quietRaw;
		const limits = manual
			? [[1900, 2100], [1, 12], [1, 31], [0, 23], [0, 59]]
			: [[0, 23], [0, 59], [0, 23], [0, 59]];
		const bound = limits[step];
		let n = raw.length ? parseInt(raw, 10) : 0;
		if (n !== n || n < bound[0] || n > bound[1])
			return false;
		if (manual)
			this.manual[step] = n;
		else
			this.quiet[step] = n;
		const last = limits.length - 1;
		if (step >= last)
			return true;
		if (manual) {
			this.manualStep = step + 1;
			this.manualRaw = "";
		}
		else {
			this.quietStep = step + 1;
			this.quietRaw = "";
		}
		return false;
	}

	private manualFace(): string {
		const hh = this.manualStep === 3 ? field(this.manualRaw) : pad2(this.manual[3]);
		const mm = this.manualStep === 4 ? field(this.manualRaw) : (this.manualStep < 4 ? pad2(this.manual[4]) : pad2(this.manual[4]));
		if (this.manualStep < 3)
			return pad2(this.manual[3]) + ":" + pad2(this.manual[4]) + ":00";
		return hh + ":" + mm + ":00";
	}

	private quietFace(): string {
		if (this.quietStep < 2) {
			const hh = this.quietStep === 0 ? field(this.quietRaw) : pad2(this.quiet[0]);
			const mm = this.quietStep === 1 ? field(this.quietRaw) : "__";
			return hh + ":" + mm + ":00";
		}
		const hh = this.quietStep === 2 ? field(this.quietRaw) : pad2(this.quiet[2]);
		const mm = this.quietStep === 3 ? field(this.quietRaw) : "__";
		return hh + ":" + mm + ":00";
	}
}

export function quietText(start: number, end: number): string {
	return quietLabel(start, end);
}

/** 7-seg can only show one HH:MM:SS. Manual and quiet show the active pair. */
export function deskUsesFace(name: DeskName): boolean {
	return name === "sw" || name === "pomo" || name === "manual" || name === "quiet";
}
