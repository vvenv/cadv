/*
	Open-Meteo current + 2-day daily forecast (HTTP, no API key).
	Default: 福清 lat/lon; override via mc/config weatherLat/weatherLon/weatherHost.
*/

import { Request } from "http";
import Timer from "timer";
import config from "mc/config";
import { loadSettings } from "settings";

export type DayForecast = {
	/** YYYY-MM-DD in Asia/Shanghai. */
	date: string;
	code: number;
	tMin: number;
	tMax: number;
	/** 0..100, or -1 when missing. */
	pop: number;
};

export type WeatherSnapshot = {
	tempC: number;
	humidity: number;
	code: number;
	/** km/h; -1 when missing. */
	windKmh: number;
	today: DayForecast | null;
	tomorrow: DayForecast | null;
	atMs: number;
};

const DEFAULT_LAT = 25.7212;
const DEFAULT_LON = 119.3841;
const DEFAULT_HOST = "api.open-meteo.com";
const DEFAULT_NAME = "福清";
/** Min gap between attempts (success or fail). */
export const WEATHER_RETRY_MS = 60_000;
/** Normal refresh after a good reading. */
export const WEATHER_REFRESH_MS = 20 * 60_000;
const FETCH_TIMEOUT_MS = 12_000;

const state: {
	cached: WeatherSnapshot | null;
	inflight: boolean;
	lastAttemptMs: number;
} = {
	cached: null,
	inflight: false,
	lastAttemptMs: 0,
};

function cfgNumber(obj: Record<string, unknown>, key: string, fallback: number): number {
	const v = obj[key];
	if (typeof v === "number" && v === v)
		return v;
	if (typeof v === "string") {
		const n = parseFloat(v);
		if (n === n)
			return n;
	}
	return fallback;
}

function cfgString(obj: Record<string, unknown>, key: string, fallback: string): string {
	const v = obj[key];
	return typeof v === "string" && v.length > 0 ? v : fallback;
}

function endpoint(): { host: string; port?: number; lat: number; lon: number } {
	const root = config as Record<string, unknown>;
	const host = cfgString(root, "weatherHost", DEFAULT_HOST);
	const port = cfgNumber(root, "weatherPort", 0);
	const saved = loadSettings();
	const named = saved.cityName.length > 0;
	return {
		host,
		port: port > 0 ? port : undefined,
		lat: named ? saved.cityLat : cfgNumber(root, "weatherLat", DEFAULT_LAT),
		lon: named ? saved.cityLon : cfgNumber(root, "weatherLon", DEFAULT_LON),
	};
}

/** City shown on the weather detail title. */
export function weatherCityName(): string {
	const saved = loadSettings();
	if (saved.cityName.length > 0)
		return saved.cityName;
	return cfgString(config as Record<string, unknown>, "weatherName", DEFAULT_NAME);
}

export function getWeather(): WeatherSnapshot | null {
	return state.cached;
}

/** WMO weather interpretation → short Chinese for the 240px panel. */
export function weatherCodeLabel(code: number): string {
	const n = code | 0;
	if (n === 0)
		return "晴";
	if (n === 1)
		return "少云";
	if (n === 2)
		return "多云";
	if (n === 3)
		return "阴";
	if (n === 45 || n === 48)
		return "雾";
	if (n >= 51 && n <= 57)
		return "毛毛雨";
	if (n >= 61 && n <= 67)
		return "雨";
	if (n >= 71 && n <= 77)
		return "雪";
	if (n >= 80 && n <= 82)
		return "阵雨";
	if (n === 85 || n === 86)
		return "阵雪";
	if (n === 95)
		return "雷雨";
	if (n === 96 || n === 99)
		return "雷雹";
	return "—";
}

function roundTemp(n: number): number {
	return Math.round(n);
}

/** Weather fragment `XX℃ YY%`; long lines marquee on the bottom port. */
export function weatherLabel(): string {
	if (!state.cached)
		return "";
	const t = roundTemp(state.cached.tempC);
	const h = Math.round(state.cached.humidity);
	return `${t}℃ ${h}%`;
}

/** Bottom line: `农历…` or `农历… XX℃ YY%`. */
export function formatLunarWithWeather(lunar: string): string {
	const w = weatherLabel();
	return w ? `${lunar} ${w}` : lunar;
}

function dayLine(day: DayForecast | null, fallback: string): string {
	if (!day)
		return fallback;
	const lo = roundTemp(day.tMin);
	const hi = roundTemp(day.tMax);
	const sky = weatherCodeLabel(day.code);
	if (day.pop >= 0)
		return `${lo}~${hi}℃ ${sky} ${day.pop}%`;
	return `${lo}~${hi}℃ ${sky}`;
}

/**
	Detail rows for the weather list (`text` left, `right` flush-right).
	Empty cache → a single “暂无” row.
*/
export function weatherDetailLines(): { text: string; right: string }[] {
	const snap = state.cached;
	if (!snap)
		return [{ text: "暂无", right: "按 T 刷新" }];
	const now = `${roundTemp(snap.tempC)}℃ ${weatherCodeLabel(snap.code)}`;
	const hum = `${Math.round(snap.humidity)}%`;
	const lines = [
		{ text: "现在", right: now },
		{ text: "湿度", right: hum },
	];
	if (snap.windKmh >= 0)
		lines.push({ text: "风速", right: `${Math.round(snap.windKmh)}km/h` });
	lines.push({ text: "今天", right: dayLine(snap.today, "—") });
	lines.push({ text: "明天", right: dayLine(snap.tomorrow, "—") });
	return lines;
}

function asNum(v: unknown): number | null {
	return typeof v === "number" && v === v ? v : null;
}

function readDay(
	times: unknown,
	codes: unknown,
	mins: unknown,
	maxs: unknown,
	pops: unknown,
	index: number,
): DayForecast | null {
	if (!Array.isArray(times) || index >= times.length)
		return null;
	const date = times[index];
	if (typeof date !== "string" || !date.length)
		return null;
	const code = Array.isArray(codes) ? asNum(codes[index]) : null;
	const tMin = Array.isArray(mins) ? asNum(mins[index]) : null;
	const tMax = Array.isArray(maxs) ? asNum(maxs[index]) : null;
	if (code === null || tMin === null || tMax === null)
		return null;
	const popRaw = Array.isArray(pops) ? asNum(pops[index]) : null;
	return {
		date,
		code,
		tMin,
		tMax,
		pop: popRaw === null ? -1 : Math.max(0, Math.min(100, Math.round(popRaw))),
	};
}

function parseWeatherBody(body: string): WeatherSnapshot | null {
	try {
		const data = JSON.parse(body) as {
			current?: {
				temperature_2m?: number;
				relative_humidity_2m?: number;
				weather_code?: number;
				wind_speed_10m?: number;
			};
			daily?: {
				time?: string[];
				weather_code?: number[];
				temperature_2m_min?: number[];
				temperature_2m_max?: number[];
				precipitation_probability_max?: number[];
			};
		};
		const temp = asNum(data.current?.temperature_2m);
		const humidity = asNum(data.current?.relative_humidity_2m);
		if (temp === null || humidity === null)
			return null;
		const code = asNum(data.current?.weather_code);
		const wind = asNum(data.current?.wind_speed_10m);
		const daily = data.daily;
		return {
			tempC: temp,
			humidity,
			code: code === null ? -1 : code,
			windKmh: wind === null ? -1 : wind,
			today: daily
				? readDay(
					daily.time,
					daily.weather_code,
					daily.temperature_2m_min,
					daily.temperature_2m_max,
					daily.precipitation_probability_max,
					0,
				)
				: null,
			tomorrow: daily
				? readDay(
					daily.time,
					daily.weather_code,
					daily.temperature_2m_min,
					daily.temperature_2m_max,
					daily.precipitation_probability_max,
					1,
				)
				: null,
			atMs: Date.now(),
		};
	}
	catch {
		return null;
	}
}

export function fetchWeather(
	force: boolean,
	done?: (ok: boolean, detail: string) => void,
) {
	const now = Date.now();
	if (state.inflight) {
		done?.(false, "busy");
		return;
	}
	if (!force && state.lastAttemptMs && now - state.lastAttemptMs < WEATHER_RETRY_MS) {
		done?.(!!state.cached, state.cached ? weatherLabel() : "throttle");
		return;
	}

	const { host, port, lat, lon } = endpoint();
	const path =
		`/v1/forecast?latitude=${lat}&longitude=${lon}` +
		"&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m" +
		"&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
		"&forecast_days=2&timezone=Asia%2FShanghai";

	state.inflight = true;
	state.lastAttemptMs = now;
	trace(`wx fetch ${host}${port ? ":" + port : ""} ${lat},${lon}\n`);

	let finished = false;
	let request: InstanceType<typeof Request> | undefined;
	let timer: ReturnType<typeof Timer.set> | undefined;

	const finish = (ok: boolean, detail: string) => {
		if (finished)
			return;
		finished = true;
		state.inflight = false;
		if (timer !== undefined)
			Timer.clear(timer);
		try { request?.close(); } catch { /* */ }
		trace(`wx done ${ok} ${detail}\n`);
		try { done?.(ok, detail); } catch { /* */ }
	};

	// Defer construct so we never open a socket from inside another network
	// callback (NTP done). That path was hard-resetting the chip.
	Timer.set(() => {
		if (finished)
			return;
		try {
			const opts: { host: string; path: string; response: typeof String; port?: number } = {
				host,
				path,
				response: String,
			};
			if (port !== undefined)
				opts.port = port;
			request = new Request(opts);
			// Assign before any turn of the event loop can deliver socket msgs.
			request.callback = function (message, value) {
				try {
					if (message === Request.error) {
						finish(false, "http err");
						return;
					}
					if (message === Request.status) {
						trace(`wx status ${value}\n`);
						return;
					}
					if (message !== Request.responseComplete)
						return;

					const body = typeof value === "string" ? value : "";
					const snap = parseWeatherBody(body);
					if (!snap) {
						finish(false, "bad json");
						return;
					}
					state.cached = snap;
					finish(true, weatherLabel());
				}
				catch (e) {
					finish(false, String(e));
				}
			};
			timer = Timer.set(() => finish(false, "timeout"), FETCH_TIMEOUT_MS);
		}
		catch (e) {
			finish(false, String(e));
		}
	}, 0);
}
