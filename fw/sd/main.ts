/*
	SD card firmware. Application.template stays in the main module.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { MenuBehavior } from "menu-view";

const SdApplication = Application.template($ => ({
	skin: new Skin({ fill: "black" }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			Behavior: MenuBehavior,
		}),
	],
}));

export default new SdApplication(null, { displayListLength: 4096, touchCount: 0 });
