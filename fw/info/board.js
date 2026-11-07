/*
	Device side. Do not call native at import time: the image build runs
	this module on the host.
	Battery is GPIO10, ADC1. Schematic Sch_M5CardputerAdv_v1.0: R9 = R8 =
	100k, so the pin is half the cell. Analog attenuation 12 maps a full
	scale reading to 2450 mV in this SDK (kAttenuationTable).
	I2C is probed once, before the keyboard driver takes the bus.
*/

import SMBus from "embedded:io/smbus";
import Analog from "embedded:io/analog";
import config from "mc/config";
import { parseSnap } from "format";

var peripherals = null;
var adc = null;
var adcDead = false;

function busPins() {
	var data = 8;
	var clock = 9;
	var address = 52;
	var kb = config.keyboard;
	if (kb) {
		if (typeof kb.sda === "number")
			data = kb.sda;
		if (typeof kb.scl === "number")
			clock = kb.scl;
		if (typeof kb.address === "number")
			address = kb.address;
	}
	return { data: data, clock: clock, address: address };
}

function readReg(pins, address, reg) {
	var io = null;
	var value = -1;
	try {
		io = new SMBus({
			hz: 400000,
			address: address,
			data: pins.data,
			clock: pins.clock,
		});
		value = io.readUint8(reg);
	}
	catch (e) {
		value = -1;
	}
	if (io) {
		try {
			io.close();
		}
		catch (e2) {
		}
	}
	return value;
}

function probe(pins) {
	var kb;
	var imu;
	var codec;
	if (peripherals)
		return peripherals;
	kb = readReg(pins, pins.address, 0x01);
	imu = readReg(pins, 0x68, 0x00);
	if (imu !== 0x24)
		imu = readReg(pins, 0x69, 0x00);
	codec = readReg(pins, 0x18, 0xfd);
	peripherals = {
		keyboard: kb >= 0 ? "TCA8418" : "无",
		imu: imu === 0x24 ? "BMI270" : "无",
		codec: codec === 0x83 ? "ES8311" : "无",
	};
	return peripherals;
}

function batteryMv() {
	var sum = 0;
	var n = 0;
	var i;
	var pinMv;
	if (adcDead)
		return -1;
	try {
		if (!adc)
			adc = new Analog({ pin: 10, esp32: { attenuation: 12 } });
		for (i = 0; i < 8; i++) {
			var raw = adc.read();
			if (typeof raw === "number" && raw >= 0) {
				sum += raw;
				n++;
			}
		}
		if (!n)
			return -1;
		pinMv = Math.round((sum / n) * 2450 / 4095);
		return pinMv * 2;
	}
	catch (e) {
		adcDead = true;
		adc = null;
		return -1;
	}
}

export function readBoard() {
	var pins = busPins();
	var parts = probe(pins);
	var raw = native("xs_board_read").call(this);
	return parseSnap(String(raw), {
		batteryMv: batteryMv(),
		keyboard: parts.keyboard,
		imu: parts.imu,
		codec: parts.codec,
	});
}
