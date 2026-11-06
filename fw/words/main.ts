/*
	Word-quiz firmware. Application.template stays in the main module.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { MarqueeBehavior } from "marquee";
import { MenuBehavior } from "menu-view";

const WordApplication = Application.template($ => ({
	skin: new Skin({ fill: "black" }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "dateLabel",
			left: 0, right: 0, top: 0, height: 32,
			Behavior: MarqueeBehavior,
		}),
		Label($, {
			name: "valueLabel",
			left: 0, right: 0, top: 32, bottom: 32,
			style: new Style({ font: "bold 48px Word", color: "#39FF14", horizontal: "center", vertical: "middle" }),
			string: "...",
		}),
		Port($, {
			name: "lunarLabel",
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

export default new WordApplication(null, { displayListLength: 4096, touchCount: 0 });
