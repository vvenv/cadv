/*
	Open-Meteo geocoding. No API key. Up to five hits.
*/

import { Request } from "http";
import Timer from "timer";

export type CityHit = { name: string; lat: number; lon: number };

const HOST = "geocoding-api.open-meteo.com";

function encodeName(text: string): string {
	return encodeURIComponent(text);
}

export function searchCity(query: string, done: (hits: CityHit[], detail: string) => void) {
	const name = query.trim();
	if (!name) {
		done([], "空");
		return;
	}
	let finished = false;
	let request: InstanceType<typeof Request> | undefined;
	let timer: ReturnType<typeof Timer.set> | undefined;
	const finish = (hits: CityHit[], detail: string) => {
		if (finished)
			return;
		finished = true;
		if (timer !== undefined)
			Timer.clear(timer);
		try { request?.close(); } catch { /* */ }
		done(hits, detail);
	};
	try {
		request = new Request({
			host: HOST,
			path: "/v1/search?count=5&language=zh&name=" + encodeName(name),
			response: String,
		});
	}
	catch (e) {
		finish([], String(e));
		return;
	}
	timer = Timer.set(() => finish([], "超时"), 12_000);
	request.callback = function (message, value) {
		if (message === Request.error) {
			finish([], "失败");
			return;
		}
		if (message !== Request.responseComplete)
			return;
		const body = typeof value === "string" ? value : "";
		const hits = parseHits(body);
		finish(hits, hits.length ? "ok" : "没有");
	};
}

function parseHits(body: string): CityHit[] {
	let data: { results?: { name?: string; latitude?: number; longitude?: number; country?: string }[] };
	try {
		data = JSON.parse(body) as typeof data;
	}
	catch {
		return [];
	}
	const rows = data.results;
	if (!rows)
		return [];
	const hits: CityHit[] = [];
	for (let i = 0; i < rows.length && hits.length < 5; i++) {
		const row = rows[i];
		if (!row || typeof row.latitude !== "number" || typeof row.longitude !== "number")
			continue;
		const place = row.name || "城市";
		const country = row.country ? " " + row.country : "";
		hits.push({ name: place + country, lat: row.latitude, lon: row.longitude });
	}
	return hits;
}
