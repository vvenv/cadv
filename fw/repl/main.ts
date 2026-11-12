import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { confirmBoot } from "boot";
import { MenuBehavior } from "menu-view";
import { TermBehavior } from "view";

bindFwTheme("repl");
confirmBoot();

const ReplApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, { name: "termPort", left: 0, right: 0, top: 0, bottom: 0, Behavior: TermBehavior }),
		Port($, { name: "listPort", left: 0, right: 0, top: 0, bottom: 0, visible: false, Behavior: MenuBehavior }),
	],
}));

export default new ReplApplication(null, { displayListLength: 4096, touchCount: 0 });
