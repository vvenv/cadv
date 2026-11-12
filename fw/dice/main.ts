import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { confirmBoot } from "boot";
import { MenuBehavior } from "menu-view";
import { DiceBehavior } from "view";

bindFwTheme("dice");
confirmBoot();

const DiceApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, { name: "facePort", left: 0, right: 0, top: 0, bottom: 0, Behavior: DiceBehavior }),
		Port($, { name: "listPort", left: 0, right: 0, top: 0, bottom: 0, visible: false, Behavior: MenuBehavior }),
	],
}));

// Pips are fillDisk rows and the number face is a 7-seg readout.
export default new DiceApplication(null, {
	displayListLength: 16384,
	commandListLength: 16384,
	touchCount: 0,
});
