/*
	BLE keyboard. Application.template stays in the main module.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { confirmBoot } from "boot";
import { MarqueeBehavior } from "marquee";
import { MenuBehavior } from "menu-view";

bindFwTheme("kb");
confirmBoot();

const KbApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "statusLabel",
			left: 0, right: 0, top: 0, height: 32,
			Behavior: MarqueeBehavior,
		}),
		Port($, {
			name: "echoLabel",
			left: 0, right: 0, top: 32, bottom: 32,
			Behavior: MarqueeBehavior,
		}),
		Port($, {
			name: "hintLabel",
			left: 0, right: 0, bottom: 0, height: 32,
			Behavior: MarqueeBehavior,
		}),
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			visible: false,
			Behavior: MenuBehavior,
		}),
	],
}));

export default new KbApplication(null, { displayListLength: 8192, commandListLength: 8192, touchCount: 0 });
