/*
	Device info. Application.template stays in the main module.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { MenuBehavior } from "menu-view";
import { InfoBehavior } from "view";

const InfoApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "infoPort",
			left: 0, right: 0, top: 0, bottom: 0,
			Behavior: InfoBehavior,
		}),
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			visible: false,
			Behavior: MenuBehavior,
		}),
	],
}));

export default new InfoApplication(null, { displayListLength: 8192, commandListLength: 8192, touchCount: 0 });
