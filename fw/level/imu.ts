/*
	Cardputer-Adv BMI270 on the keyboard I2C bus (SDA 8 / SCL 9).
	The stock driver waits forever when config load fails, which left the
	panel black. This path writes the config in short bursts and gives up.
*/

import SMBus from "embedded:io/smbus";
import Timer from "timer";
import config from "mc/config";

declare function trace(message: string): void;

/* SDO is tied high on Cardputer-Adv, so 0x69 answers. 0x68 is the other strap. */
const ADDRS = [0x69, 0x68];
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

/*
	A typed array created at module scope is frozen into flash.
	writeRead then rejects it as a read-only buffer, which is the I2C error
	on device. Allocate the destination when the sensor is actually opened.
*/
let oneByte: Uint8Array | null = null;
function readBuf(): Uint8Array {
	if (!oneByte) {
		oneByte = new Uint8Array(1);
		oneByte[0] = 0;
	}
	return oneByte;
}

function readReg(io: SMBus, reg: number): number {
	const dst = readBuf();
	io.readBuffer(reg, dst);
	return dst[0];
}

function write8(io: SMBus, reg: number, value: number) {
	io.writeUint8(reg, value);
	for (let i = 0; i < 3; i++) {
		if ((readReg(io, REG_STATUS) & 0x04) === 0)
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
		const msg = readReg(io, REG_INTERNAL) & 0x0f;
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
		hz: 100_000,
		address,
		data: pins.data,
		clock: pins.clock,
	});
}

function readId(io: SMBus): number {
	acks(io);
	Timer.delay(20);
	return readReg(io, REG_CHIP);
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
	raw[0] = 0;
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

function acks(io: SMBus): boolean {
	try {
		const result = io.write(new ArrayBuffer(0)) as unknown as number;
		return result !== 1;
	}
	catch {
		return false;
	}
}

function scan(pins: BusPins): string {
	let text = "";
	for (let addr = 0x08; addr < 0x78; addr++) {
		let io: SMBus | null = null;
		try {
			io = openBus(addr, pins);
			if (acks(io))
				text += (text ? " " : "") + addr.toString(16);
		}
		catch { /* */ }
		try { io?.close(); } catch { /* */ }
	}
	return text || "空";
}

function errorText(e: unknown): string {
	if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string")
		return (e as { message: string }).message;
	return "读取失败";
}

export function openImu(): ImuHandle | null {
	const pins = busPins();
	lastError = "无芯片";
	for (let i = 0; i < ADDRS.length; i++) {
		const addr = ADDRS[i];
		let io: SMBus | null = null;
		try {
			io = openBus(addr, pins);
			const id = readId(io);
			trace("imu " + addr.toString(16) + " id " + id.toString(16) + "\n");
			if (id !== CHIP_ID) {
				io.close();
				io = null;
				lastError = addr.toString(16) + " id" + id.toString(16);
				continue;
			}
			const handle = bringUp(io);
			io = null;
			lastError = "";
			return handle;
		}
		catch (e) {
			try { io?.close(); } catch { /* */ }
			lastError = addr.toString(16) + " " + errorText(e);
			trace("imu " + lastError + "\n");
		}
	}
	const found = scan(pins);
	lastError = "总线 " + found;
	trace("imu scan " + found + "\n");
	return null;
}
