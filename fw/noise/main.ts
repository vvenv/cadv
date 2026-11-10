import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { MenuBehavior } from "menu-view";

bindFwTheme("noise");

const NoiseApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, { name: "listPort", left: 0, right: 0, top: 0, bottom: 0, Behavior: MenuBehavior }),
	],
}));

export default new NoiseApplication(null, {
	displayListLength: 8192,
	commandListLength: 8192,
	touchCount: 0,
});
