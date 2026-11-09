import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { MenuBehavior } from "menu-view";
import { SevenSegBehavior } from "sevenseg";
import { CountFooterBehavior, CountTopBehavior } from "view";

bindFwTheme("count");

const CountApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "titlePort",
			left: 0, right: 0, top: 0, height: 32,
			Behavior: CountTopBehavior,
		}),
		Port($, {
			name: "facePort",
			left: 0, right: 0, top: 32, bottom: 32,
			Behavior: SevenSegBehavior,
		}),
		Port($, {
			name: "footerPort",
			left: 0, right: 0, bottom: 0, height: 32,
			Behavior: CountFooterBehavior,
		}),
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			visible: false,
			Behavior: MenuBehavior,
		}),
	],
}));

// Tall Casio middle band + up to 6 digits: same budget as clock HH:MM:SS.
// 8192 overflows → XS abort on paint → reboot loop leaves launcher "校验…".
export default new CountApplication(null, {
	displayListLength: 16384,
	commandListLength: 16384,
	touchCount: 0,
});
