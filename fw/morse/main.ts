import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { confirmBoot } from "boot";
import { MenuBehavior } from "menu-view";
import { MorseBehavior } from "view";

bindFwTheme("morse");
confirmBoot();

const MorseApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, { name: "facePort", left: 0, right: 0, top: 0, bottom: 0, Behavior: MorseBehavior }),
		Port($, { name: "listPort", left: 0, right: 0, top: 0, bottom: 0, visible: false, Behavior: MenuBehavior }),
	],
}));

export default new MorseApplication(null, {
	displayListLength: 8192,
	commandListLength: 8192,
	touchCount: 0,
});
