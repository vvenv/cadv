/*
	Spirit level. Application.template stays in the main module.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { MenuBehavior } from "menu-view";
import { LevelViewBehavior } from "view";

const LevelApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "levelPort",
			left: 0, right: 0, top: 0, bottom: 0,
			Behavior: LevelViewBehavior,
		}),
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			visible: false,
			Behavior: MenuBehavior,
		}),
	],
}));

export default new LevelApplication(null, { displayListLength: 4096, touchCount: 0 });
