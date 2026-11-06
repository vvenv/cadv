/*
	Word-quiz firmware. Application.template stays in the main module.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { MarqueeBehavior } from "marquee";
import { BG, FONT_WORD, ON } from "ink";
import { MenuBehavior } from "menu-view";

const WordApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "glossLabel",
			left: 0, right: 0, top: 0, height: 32,
			Behavior: MarqueeBehavior,
		}),
		Label($, {
			name: "puzzleLabel",
			left: 0, right: 0, top: 32, bottom: 32,
			style: new Style({ font: FONT_WORD, color: ON, horizontal: "center", vertical: "middle" }),
			string: "...",
		}),
		Port($, {
			name: "phoneLabel",
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
