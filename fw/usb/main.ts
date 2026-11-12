/*
	USB disk. Application.template stays in the main module.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { confirmBoot } from "boot";
import { MenuBehavior } from "menu-view";
import { UsbViewBehavior } from "view";

bindFwTheme("usb");
confirmBoot();

const UsbApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "usbPort",
			left: 0, right: 0, top: 0, bottom: 0,
			Behavior: UsbViewBehavior,
		}),
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			visible: false,
			Behavior: MenuBehavior,
		}),
	],
}));

export default new UsbApplication(null, {
	displayListLength: 8192,
	commandListLength: 8192,
	touchCount: 0,
});
