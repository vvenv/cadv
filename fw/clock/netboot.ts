/*
	Wi-Fi + SNTP bootstrap for app.
	Creds: Preference("wifi") first, then mc/config ssid/password.
*/

import Preference from "preference";
import Time from "time";
import Timer from "timer";
import WiFi from "embedded:network/interface/wifi";
import config from "mc/config";

const PREF = "wifi";
const WIFI_TIMEOUT_MS = 15000;

let station: InstanceType<typeof WiFi> | undefined;

/** RSSI of the association left open by connectWifi. Null when down. */
export function wifiRssi(): number | null {
	if (!station)
		return null;
	try {
		if (station.connection < 500)
			return null;
		const value = station.RSSI;
		return typeof value === "number" ? value : null;
	}
	catch {
		return null;
	}
}

export type WifiCreds = { ssid: string; password: string };

function cfgString(obj: Record<string, unknown>, key: string): string | undefined {
	const v = obj[key];
	return typeof v === "string" ? v : undefined;
}

export function loadWifiCreds(): WifiCreds | null {
	try {
		const ssid = Preference.get(PREF, "ssid");
		if (typeof ssid === "string" && ssid.length > 0) {
			const password = Preference.get(PREF, "password");
			return { ssid, password: typeof password === "string" ? password : "" };
		}
	}
	catch {
		/* Preference missing on some hosts */
	}
	const root = config as Record<string, unknown>;
	const ssid = cfgString(root, "ssid");
	if (ssid && ssid.length > 0)
		return { ssid, password: cfgString(root, "password") ?? "" };
	return null;
}

export function saveWifiCreds(creds: WifiCreds) {
	Preference.set(PREF, "ssid", creds.ssid);
	Preference.set(PREF, "password", creds.password);
}

export function connectWifi(creds: WifiCreds, done: (ok: boolean, detail: string) => void) {
	let finished = false;
	let timer: ReturnType<typeof Timer.set> | undefined;
	let w: InstanceType<typeof WiFi> | undefined;

	const finish = (ok: boolean, detail: string) => {
		if (finished)
			return;
		finished = true;
		if (timer !== undefined)
			Timer.clear(timer);
		if (ok && w) {
			try { station?.close(); } catch { /* */ }
			station = w;
		}
		else {
			try { w?.close(); } catch { /* */ }
		}
		done(ok, detail);
	};

	try {
		w = new WiFi({
			onChanged(property) {
				if (property !== "connection")
					return;
				const c = this.connection;
				if (c >= 500)
					finish(true, this.address ?? "ok");
				else if (c <= 200)
					finish(false, "WiFi fail");
			},
		});
		timer = Timer.set(() => finish(false, "WiFi timeout"), WIFI_TIMEOUT_MS);
		if (creds.password)
			w.connect({ SSID: creds.ssid, password: creds.password });
		else
			w.connect({ SSID: creds.ssid });
	}
	catch (e) {
		finish(false, String(e));
	}
}

export function syncNtp(done: (ok: boolean, detail: string) => void) {
	const root = config as Record<string, unknown>;
	const sntp = cfgString(root, "sntp") || "ntp.aliyun.com";
	const servers = [sntp, "ntp.tencent.com", "pool.ntp.org"];
	const g = globalThis as {
		device?: {
			network?: {
				ntp?: {
					client?: {
						io?: new (opts: object) => {
							getTime: (cb: (err: unknown, value?: number) => void) => void;
							close: () => void;
						};
					};
				};
			};
		};
	};
	const client = g.device?.network?.ntp?.client;
	if (!client?.io) {
		done(false, "no NTP");
		return;
	}

	let ntp: { getTime: (cb: (err: unknown, value?: number) => void) => void; close: () => void };
	try {
		ntp = new client.io({ ...client, servers });
	}
	catch (e) {
		done(false, String(e));
		return;
	}

	const timer = Timer.set(() => {
		try { ntp.close(); } catch { /* */ }
		done(false, "NTP timeout");
	}, 10000);

	ntp.getTime((error, value) => {
		Timer.clear(timer);
		try { ntp.close(); } catch { /* */ }
		if (error || value === undefined) {
			done(false, "NTP fail");
			return;
		}
		Time.set(value / 1000);
		done(true, String(Math.floor(value / 1000)));
	});
}

export function connectAndSync(
	creds: WifiCreds,
	onStatus: (msg: string) => void,
	done: (ok: boolean, detail: string) => void,
) {
	onStatus(`WiFi ${creds.ssid}`);
	connectWifi(creds, (ok, detail) => {
		if (!ok) {
			done(false, detail);
			return;
		}
		onStatus("NTP...");
		syncNtp(done);
	});
}
