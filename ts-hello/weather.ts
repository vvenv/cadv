/*
	Open-Meteo current weather (HTTP, no API key).
	Default: 福清 lat/lon; override via mc/config weatherLat/weatherLon/weatherHost.
*/

import { Request } from "http";
import Timer from "timer";
import config from "mc/config";

export type WeatherSnapshot = {
	tempC: number;
	humidity: number;
	atMs: number;
};

const DEFAULT_LAT = 25.7212;
const DEFAULT_LON = 119.3841;
const DEFAULT_HOST = "api.open-meteo.com";
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
	return {
		host,
		port: port > 0 ? port : undefined,
		lat: cfgNumber(root, "weatherLat", DEFAULT_LAT),
		lon: cfgNumber(root, "weatherLon", DEFAULT_LON),
	};
}

export function getWeather(): WeatherSnapshot | null {
	return state.cached;
}

/** Compact label using glyphs available in Zpix-Regular-12 (`C` `%` digits). */
export function weatherLabel(): string {
	if (!state.cached)
		return "";
	const t = Math.round(state.cached.tempC);
	const h = Math.round(state.cached.humidity);
	return `${t}C ${h}%`;
}

export function formatLunarWithWeather(lunar: string): string {
	const w = weatherLabel();
	return w ? `${lunar} ${w}` : lunar;
}

function parseWeatherBody(body: string): WeatherSnapshot | null {
	try {
		const filtered = JSON.parse(body, [
			"current",
			"temperature_2m",
			"relative_humidity_2m",
		]) as {
			current?: { temperature_2m?: number; relative_humidity_2m?: number };
		};
		let temp = filtered.current?.temperature_2m;
		let humidity = filtered.current?.relative_humidity_2m;
		if (typeof temp !== "number" || typeof humidity !== "number") {
			const full = JSON.parse(body) as {
				current?: { temperature_2m?: number; relative_humidity_2m?: number };
			};
			temp = full.current?.temperature_2m;
			humidity = full.current?.relative_humidity_2m;
		}
		if (typeof temp !== "number" || typeof humidity !== "number")
			return null;
		return { tempC: temp, humidity, atMs: Date.now() };
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
		"&current=temperature_2m,relative_humidity_2m&timezone=Asia%2FShanghai";

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
		done?.(ok, detail);
	};

	try {
		const opts: { host: string; path: string; response: typeof String; port?: number } = {
			host,
			path,
			response: String,
		};
		if (port !== undefined)
			opts.port = port;
		request = new Request(opts);
	}
	catch (e) {
		finish(false, String(e));
		return;
	}

	timer = Timer.set(() => finish(false, "timeout"), FETCH_TIMEOUT_MS);

	request.callback = function (message, value) {
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
	};
}
