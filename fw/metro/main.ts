import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { MenuBehavior } from "menu-view";
import { SevenSegBehavior } from "sevenseg";
import { MetroFooterBehavior, MetroTopBehavior } from "view";

const MetroApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "titlePort",
			left: 0, right: 0, top: 0, height: 32,
			Behavior: MetroTopBehavior,
		}),
		Port($, {
			name: "facePort",
			left: 0, right: 0, top: 32, bottom: 32,
			Behavior: SevenSegBehavior,
		}),
		Port($, {
			name: "footerPort",
			left: 0, right: 0, bottom: 0, height: 32,
			Behavior: MetroFooterBehavior,
		}),
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			visible: false,
			Behavior: MenuBehavior,
		}),
	],
}));

export default new MetroApplication(null, {
	displayListLength: 16384,
	commandListLength: 16384,
	touchCount: 0,
});
