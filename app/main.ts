/*
	Cardputer-Adv Moddable + TypeScript clock entry.
	Application.template (+ Skin/Style) must stay in the main module —
	Moddable link rejects those constructors in other modules.
*/

import {} from "piu/MC";
import { AppBehavior } from "app-behavior";
import { MarqueeBehavior } from "marquee";
import { SevenSegBehavior } from "sevenseg";

const ClockApplication = Application.template($ => ({
	skin: new Skin({ fill: "black" }),
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
		Label($, {
			name: "valueLabel",
			left: 0, right: 0, top: 32, bottom: 32,
			style: new Style({ font: "12px Zpix", color: "#39FF14", horizontal: "center", vertical: "middle" }),
			string: "",
			visible: false,
		}),
		Port($, {
			name: "lunarLabel",
			left: 0, right: 0, bottom: 0, height: 32,
			Behavior: MarqueeBehavior,
		}),
	],
}));

export default new ClockApplication(null, { displayListLength: 4096, touchCount: 0 });
