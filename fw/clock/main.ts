/*
	Cardputer-Adv Moddable + TypeScript clock entry.
	Application.template (+ Skin/Style) must stay in the main module —
	Moddable link rejects those constructors in other modules.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { MarqueeBehavior } from "marquee";
import { MenuBehavior } from "menu-view";
import { BG } from "ink";
import { SevenSegBehavior } from "sevenseg";

const ClockApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "dateLabel",
			left: 0, right: 0, top: 0, height: 32,
			Behavior: MarqueeBehavior,
		}),
		Port($, {
			name: "clockPort",
			left: 0, right: 0, top: 32, bottom: 32,
			Behavior: SevenSegBehavior,
		}),
		Port($, {
			name: "valueLabel",
			left: 0, right: 0, top: 32, bottom: 32,
			visible: false,
			Behavior: MarqueeBehavior,
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

export default new ClockApplication(null, { displayListLength: 4096, touchCount: 0 });
