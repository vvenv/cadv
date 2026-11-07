import { GAPClient, type Advertisement } from "embedded:io/bluetoothle/central";

export type Hit = { name: string; extra: string };

export type Air = { close(): void };

export function openAir(onHit: (hit: Hit) => void): Air | null {
	try {
		const client = new GAPClient({
			onReadable(count: number) {
				for (let i = 0; i < count; i++) {
					const ad = this.read() as Advertisement | undefined;
					if (!ad)
						continue;
					const rssi = typeof ad.rssi === "number" ? ad.rssi + "dB" : "";
					onHit({ name: ad.name || ad.address, extra: rssi });
				}
			},
		});
		return {
			close() {
				try { client.close(); } catch { /* */ }
			},
		};
	}
	catch {
		return null;
	}
}
