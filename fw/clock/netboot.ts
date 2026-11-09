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
const NTP_TIMEOUT_MS = 15000;
/** Moddable defaults to 1.1.1.1 / 8.8.8.8 — often unreachable in CN, so NTP never resolves. */
const DNS_SERVERS = Object.freeze(["223.5.5.5", "119.29.29.29", "180.76.76.76"]);

let station: InstanceType<typeof WiFi> | undefined;

type NtpHandle = {
	getTime: (cb: (err: unknown, value?: number) => void) => void;
	close: () => void;
};

type NtpClient = {
	io?: new (opts: object) => NtpHandle;
	dns?: { io?: unknown; servers?: string[]; socket?: object };
	socket?: object;
	servers?: string[];
};

/** Prefer mainland DNS for NTP / HTTP name lookups on this device. */
function preferChinaDns() {
	try {
		const g = globalThis as {
			device?: { network?: { dns?: { resolver?: { servers?: string[] } } } };
		};
		const resolver = g.device?.network?.dns?.resolver;
		if (resolver)
			resolver.servers = DNS_SERVERS.slice();
	}
	catch {
		/* resolver may be frozen on some hosts */
	}
}

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
		// Reuse a live association. Closing + connect() while already joined
		// makes ESP-IDF reconnect (disconnect→got-ip), which flaps the UI.
		if (station) {
			try {
				if (station.connection >= 500) {
					done(true, station.address ?? "ok");
					return;
				}
			}
			catch {
				/* fall through and replace the monitor */
			}
			try { station.close(); } catch { /* */ }
			station = undefined;
		}

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
		// Already up (host left STA associated): onChanged will not re-fire.
		if (w.connection >= 500) {
			finish(true, w.address ?? "ok");
			return;
		}
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
	preferChinaDns();

	const root = config as Record<string, unknown>;
	const sntp = cfgString(root, "sntp") || "ntp.aliyun.com";
	// Mainland hosts first; pool.ntp.org is often slow or filtered in CN.
	const servers = [sntp, "ntp.tencent.com", "ntp1.aliyun.com"];
	const g = globalThis as {
		device?: {
			io?: { UDP?: unknown };
			network?: { ntp?: { client?: NtpClient } };
		};
	};
	const client = g.device?.network?.ntp?.client;
	if (!client?.io) {
		done(false, "no NTP");
		return;
	}

	let finished = false;
	let timer: ReturnType<typeof Timer.set> | undefined;
	let ntp: NtpHandle | undefined;

	const finish = (ok: boolean, detail: string) => {
		if (finished)
			return;
		finished = true;
		if (timer !== undefined)
			Timer.clear(timer);
		try { ntp?.close(); } catch { /* */ }
		try { done(ok, detail); } catch { /* UI must not kill the net path */ }
	};

	try {
		// config.js leaves socket.io as the string "UDP". Resolve the class so
		// `new socket.io(...)` / DNS sends don't throw inside a timer (abort→reboot).
		const UDP = g.device?.io?.UDP;
		const socket = UDP ? { ...(client.socket ?? {}), io: UDP } : client.socket;
		const dns = client.dns
			? {
				...client.dns,
				servers: DNS_SERVERS.slice(),
				socket: UDP && client.dns.socket
					? { ...client.dns.socket, io: UDP }
					: client.dns.socket,
			}
			: undefined;
		ntp = new client.io({
			...client,
			servers,
			...(socket ? { socket } : {}),
			...(dns ? { dns } : {}),
		});
	}
	catch (e) {
		finish(false, String(e));
		return;
	}

	timer = Timer.set(() => finish(false, "NTP timeout"), NTP_TIMEOUT_MS);

	try {
		ntp.getTime((error, value) => {
			try {
				if (error || value === undefined || typeof value !== "number" || value !== value) {
					finish(false, "NTP fail");
					return;
				}
				Time.set(value / 1000);
				finish(true, String(Math.floor(value / 1000)));
			}
			catch (e) {
				finish(false, String(e));
			}
		});
	}
	catch (e) {
		finish(false, String(e));
	}
}

export function connectAndSync(
	creds: WifiCreds,
	onStatus: (msg: string) => void,
	done: (ok: boolean, detail: string) => void,
) {
	preferChinaDns();
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
