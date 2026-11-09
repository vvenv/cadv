/*
	SD card firmware. Application.template stays in the main module.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { MenuBehavior } from "menu-view";
import { HomeBehavior } from "view";
import { BG } from "ink";
import { bindFwTheme } from "theme";

bindFwTheme("sd");

const SdApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "homePort",
			left: 0, right: 0, top: 0, bottom: 0,
			Behavior: HomeBehavior,
		}),
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			visible: false,
			Behavior: MenuBehavior,
		}),
	],
}));

export default new SdApplication(null, { displayListLength: 8192, commandListLength: 8192, touchCount: 0 });
