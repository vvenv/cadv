import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { confirmBoot } from "boot";
import { MenuBehavior } from "menu-view";

bindFwTheme("scan");
confirmBoot();

const ScanApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, { name: "listPort", left: 0, right: 0, top: 0, bottom: 0, Behavior: MenuBehavior }),
	],
}));

export default new ScanApplication(null, { displayListLength: 8192, commandListLength: 8192, touchCount: 0 });
