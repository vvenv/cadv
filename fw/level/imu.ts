/*
	Cardputer-Adv BMI270 on the keyboard I2C bus (SDA 8 / SCL 9).
	The stock driver waits forever when config load fails, which left the
	panel black. This path writes the config in short bursts and gives up.
*/

import SMBus from "embedded:io/smbus";
import Timer from "timer";
import config from "mc/config";

const ADDRS = [0x68, 0x69];
const CHIP_ID = 0x24;
const REG_CHIP = 0x00;
const REG_STATUS = 0x03;
const REG_ACC = 0x0C;
const REG_ACC_CONF = 0x40;
const REG_ACC_RANGE = 0x41;
const REG_INIT_CTRL = 0x59;
const REG_INIT_ADDR = 0x5B;
const REG_INIT_DATA = 0x5E;
const REG_INTERNAL = 0x21;
const REG_PWR_CONF = 0x7C;
const REG_PWR_CTRL = 0x7D;
const REG_CMD = 0x7E;
const SOFT_RESET = 0xB6;
const CHUNK = 64;
/** ±2 g, 16-bit. */
const SCALE = 2 / 32768;

export type AccelSample = { x: number; y: number; z: number };

export type ImuHandle = {
	sample(): AccelSample | null;
	close(): void;
};

let lastError = "无芯片";

export function imuError(): string {
	return lastError;
}

type BusPins = { data: number; clock: number };

function busPins(): BusPins {
	const root = config as Record<string, unknown>;
	const kb = root.keyboard;
	if (kb && typeof kb === "object") {
		const o = kb as Record<string, unknown>;
		if (typeof o.sda === "number" && typeof o.scl === "number")
			return { data: o.sda, clock: o.scl };
	}
	return { data: 8, clock: 9 };
}

function configBytes(): Uint8Array {
	const raw = native("xs_bmi270_config_file")();
	return new Uint8Array(raw);
}

function write8(io: SMBus, reg: number, value: number) {
	io.writeUint8(reg, value);
	for (let i = 0; i < 3; i++) {
		if ((io.readUint8(REG_STATUS) & 0x04) === 0)
			return;
		Timer.delay(1);
	}
}

function upload(io: SMBus, src: Uint8Array) {
	write8(io, REG_INIT_CTRL, 0x00);
	let words = 0;
	for (let off = 0; off < src.length; off += CHUNK) {
		const n = Math.min(CHUNK, src.length - off);
		io.writeUint16(REG_INIT_ADDR, words, false);
		io.writeBuffer(REG_INIT_DATA, src.subarray(off, off + n));
		words += n >> 1;
	}
	write8(io, REG_INIT_CTRL, 0x01);
	for (let i = 0; i < 40; i++) {
		const msg = io.readUint8(REG_INTERNAL) & 0x0f;
		if (msg === 1)
			return;
		if (msg === 2)
			throw new Error("配置失败");
		Timer.delay(1);
	}
	throw new Error("配置超时");
}

function openBus(address: number, pins: BusPins): SMBus {
	return new SMBus({
		hz: 400_000,
		address,
		data: pins.data,
		clock: pins.clock,
	});
}

function bringUp(io: SMBus): ImuHandle {
	write8(io, REG_CMD, SOFT_RESET);
	Timer.delay(10);
	write8(io, REG_PWR_CONF, 0x00);
	Timer.delay(1);
	upload(io, configBytes());
	write8(io, REG_ACC_CONF, 0xa8);
	write8(io, REG_ACC_RANGE, 0x00);
	write8(io, REG_PWR_CTRL, 0x04);

	const raw = new Uint8Array(6);
	const view = new DataView(raw.buffer);
	let last: AccelSample | null = null;
	return {
		sample() {
			try {
				io.readBuffer(REG_ACC, raw);
				last = {
					x: view.getInt16(0, true) * SCALE,
					y: view.getInt16(2, true) * SCALE,
					z: view.getInt16(4, true) * SCALE,
				};
				return last;
			}
			catch {
				return last;
			}
		},
		close() {
			try { io.close(); } catch { /* */ }
		},
	};
}

export function openImu(): ImuHandle | null {
	const pins = busPins();
	lastError = "无芯片";
	for (let i = 0; i < ADDRS.length; i++) {
		let io: SMBus | null = null;
		try {
			io = openBus(ADDRS[i], pins);
			if (io.readUint8(REG_CHIP) !== CHIP_ID) {
				io.close();
				io = null;
				continue;
			}
			const handle = bringUp(io);
			io = null;
			lastError = "";
			return handle;
		}
		catch (e) {
			try { io?.close(); } catch { /* */ }
			if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string")
				lastError = (e as { message: string }).message;
			else
				lastError = "读取失败";
		}
	}
	return null;
}
