import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { MenuBehavior } from "menu-view";
import { SevenSegBehavior } from "sevenseg";
import { StepFooterBehavior, StepTopBehavior } from "view";

const StepApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "titlePort",
			left: 0, right: 0, top: 0, height: 32,
			Behavior: StepTopBehavior,
		}),
		Port($, {
			name: "facePort",
			left: 0, right: 0, top: 32, bottom: 32,
			Behavior: SevenSegBehavior,
		}),
		Port($, {
			name: "footerPort",
			left: 0, right: 0, bottom: 0, height: 32,
			Behavior: StepFooterBehavior,
		}),
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			visible: false,
			Behavior: MenuBehavior,
		}),
	],
}));

// Port fills void the Piu command list (default 1024 bytes). The 7-segment readout overflows it.
export default new StepApplication(null, {
	displayListLength: 8192,
	commandListLength: 8192,
	touchCount: 0,
});
