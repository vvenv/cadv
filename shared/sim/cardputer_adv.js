/*
	mcsim device for the Cardputer-Adv: a 240×135 landscape screen in a plain
	body. do.sh links this file into $MODDABLE/build/simulators so ./do.sh sim
	shows the real aspect ratio. sortingTitle puts it first in the device menu.
	The body colour is matched exactly by scripts/sim-shot.swift to find the
	screen in a window capture; keep the two in sync.
*/

import {
	ControlsColumn,
} from "ControlsPane";

import {
	DeviceBehavior,
	DeviceContainer,
	DeviceScreen,
} from "DevicePane";

const BODY = "#2c263a";
const MARGIN = 16;

export default {
	// Required: mcsim tests every device's filter when a file opens. This one
	// matches the -p mac builds that do.sh sim makes, so they pick this device.
	applicationName: "mc/debug/.*",
	title: "Cardputer-Adv",
	sortingTitle: "0000",
	Workers: {
	},
	ControlsTemplate: ControlsColumn.template($ => ({
		contents: [
		],
	})),
	DeviceTemplates: {
		0: DeviceContainer.template($ => ({
			Behavior: DeviceBehavior,
			contents: [
				Content($, { left: 0, top: 0, width: 240 + 2 * MARGIN, height: 135 + 2 * MARGIN, skin: new Skin({ fill: BODY }) }),
				DeviceScreen($, { left: MARGIN, width: 240, top: MARGIN, height: 135, rotation: 0 }),
			],
		})),
	},
};
