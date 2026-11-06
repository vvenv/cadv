/*
	BLE HID keyboard. ESP32-S3 has no classic Bluetooth.
	Just Works + bonding is security mode 1 level 2, which HOGP allows.
	Mac and iPhone pair without a passkey.
*/

import { GATTServer } from "embedded:io/bluetoothle/peripheral";
import { DEVICE_NAME } from "hid";

export type LinkState = "wait" | "link" | "ready" | "sim" | "down";

export type RadioListener = {
	onStatus(state: LinkState): void;
	onCaps(on: boolean): void;
};

type NotifyLink = {
	notify(characteristic: unknown, value: Uint8Array): void;
};

const REPORT_MAP = Uint8Array.of(
	0x05, 0x01,
	0x09, 0x06,
	0xa1, 0x01,
	0x85, 0x01,
	0x05, 0x07,
	0x19, 0xe0,
	0x29, 0xe7,
	0x15, 0x00,
	0x25, 0x01,
	0x75, 0x01,
	0x95, 0x08,
	0x81, 0x02,
	0x95, 0x01,
	0x75, 0x08,
	0x81, 0x01,
	0x95, 0x05,
	0x75, 0x01,
	0x05, 0x08,
	0x19, 0x01,
	0x29, 0x05,
	0x91, 0x02,
	0x95, 0x01,
	0x75, 0x03,
	0x91, 0x01,
	0x95, 0x06,
	0x75, 0x08,
	0x15, 0x00,
	0x25, 0x65,
	0x05, 0x07,
	0x19, 0x00,
	0x29, 0x65,
	0x81, 0x00,
	0xc0,
);

export class KeyboardRadio {
	#listener: RadioListener;
	#conn: NotifyLink | null = null;
	#input: unknown = null;
	#report = new Uint8Array(8);
	#suspended = false;
	#ready = false;

	constructor(listener: RadioListener) {
		this.#listener = listener;
		const radio = this;
		const props = GATTServer.properties;
		const input = {
			uuid: "2a4d",
			properties: props.readEncrypted | props.subscribeEncrypted,
			onRead() {
				return radio.reportBytes();
			},
			onSubscribe(connection: NotifyLink) {
				radio.noteSubscribed(connection, this);
			},
			onUnsubscribe() {
				radio.noteUnsubscribed();
			},
			descriptors: [
				{
					uuid: "2908",
					value: Uint8Array.of(0x01, 0x01),
				},
			],
		};
		new GATTServer({
			mtu: 128,
			security: {
				bond: true,
				immediate: true,
			},
			services: [
				{
					uuid: "1800",
					characteristics: [
						{
							uuid: "2a00",
							properties: props.read,
							value: ArrayBuffer.fromString(DEVICE_NAME),
						},
						{
							uuid: "2a01",
							properties: props.read,
							value: Uint8Array.of(0xc1, 0x03),
						},
					],
				},
				{
					uuid: "1812",
					characteristics: [
						{
							uuid: "2a4a",
							properties: props.readEncrypted,
							value: Uint8Array.of(0x11, 0x01, 0x00, 0x02),
						},
						{
							uuid: "2a4b",
							properties: props.readEncrypted,
							value: REPORT_MAP,
						},
						{
							uuid: "2a4c",
							properties: props.writeWithOutResponse,
							onWrite(value: ArrayBuffer) {
								radio.noteControl(value);
							},
						},
						{
							uuid: "2a4e",
							properties: props.read | props.writeWithOutResponse,
							onRead() {
								return Uint8Array.of(0x01);
							},
							onWrite() {
							},
						},
						input,
						{
							uuid: "2a4d",
							properties: props.writeEncrypted | props.writeWithOutResponse,
							onWrite(value: ArrayBuffer) {
								radio.noteLeds(value);
							},
							descriptors: [
								{
									uuid: "2908",
									value: Uint8Array.of(0x01, 0x02),
								},
							],
						},
					],
				},
			],
			onReady() {
				this.startAdvertising({
					flags: 6,
					name: DEVICE_NAME,
					services: ["1812"],
					[0x19]: Uint8Array.of(0xc1, 0x03),
				});
				radio.markWaiting();
			},
			onConnect() {
				radio.markLink();
			},
			onDisconnect() {
				radio.markDown();
			},
		});
	}

	get ready(): boolean {
		return this.#ready;
	}

	markWaiting() {
		this.#listener.onStatus("wait");
	}

	markLink() {
		this.#ready = false;
		this.#conn = null;
		this.#input = null;
		this.#suspended = false;
		this.#listener.onStatus("link");
	}

	markDown() {
		this.noteUnsubscribed();
		this.#suspended = false;
		this.#listener.onCaps(false);
		this.#listener.onStatus("wait");
	}

	reportBytes(): Uint8Array {
		return this.#report;
	}

	noteSubscribed(connection: NotifyLink, characteristic: unknown) {
		this.#conn = connection;
		this.#input = characteristic;
		this.#ready = true;
		this.#listener.onStatus("ready");
		this.#flush();
	}

	noteUnsubscribed() {
		this.#conn = null;
		this.#input = null;
		this.#ready = false;
	}

	noteControl(value: ArrayBuffer) {
		const bytes = new Uint8Array(value);
		if (bytes.length === 0)
			return;
		const suspend = bytes[0] === 0;
		if (suspend === this.#suspended)
			return;
		this.#suspended = suspend;
		if (!suspend)
			this.#flush();
	}

	noteLeds(value: ArrayBuffer) {
		const bytes = new Uint8Array(value);
		if (bytes.length === 0)
			return;
		const leds = bytes.length >= 2 && bytes[0] === 1 ? bytes[1] : bytes[0];
		this.#listener.onCaps((leds & 0x02) !== 0);
	}

	send(report: Uint8Array) {
		this.#report.set(report.subarray(0, 8));
		this.#flush();
	}

	#flush() {
		const conn = this.#conn;
		const input = this.#input;
		if (!this.#ready || this.#suspended || !conn || !input)
			return;
		try {
			conn.notify(input, this.#report);
		}
		catch {
			/* The next key retries. A dropped link clears the subscription. */
		}
	}

	close() {
	}
}

export function openRadio(listener: RadioListener): KeyboardRadio {
	return new KeyboardRadio(listener);
}
