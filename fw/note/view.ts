import {} from "piu/MC";
import type { Port as PortContent } from "piu/MC";
import { BG, ON } from "ink";
import { QR_SIZE } from "qr";

export function asQr(target: unknown): QrBehavior | null {
	if (!target || typeof target !== "object" || !("behavior" in target))
		return null;
	const b = (target as { behavior?: QrBehavior }).behavior;
	return b && typeof b.setBits === "function" ? b : null;
}

export class QrBehavior extends Behavior {
	bits: Uint8Array | null = null;

	setBits(port: unknown, bits: Uint8Array | null) {
		this.bits = bits;
		if (port && typeof port === "object" && "invalidate" in port && typeof port.invalidate === "function")
			port.invalidate();
	}

	onDraw(port: PortContent) {
		port.fillColor(BG, 0, 0, port.width, port.height);
		const bits = this.bits;
		if (!bits)
			return;
		const cell = Math.floor(Math.min(port.width, port.height) / (QR_SIZE + 2));
		const originX = Math.floor((port.width - cell * QR_SIZE) / 2);
		const originY = Math.floor((port.height - cell * QR_SIZE) / 2);
		for (let y = 0; y < QR_SIZE; y++) {
			for (let x = 0; x < QR_SIZE; x++) {
				if (!bits[y * QR_SIZE + x])
					continue;
				port.fillColor(ON, originX + x * cell, originY + y * cell, cell, cell);
			}
		}
	}
}
