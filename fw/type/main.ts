import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { MenuBehavior } from "menu-view";
import { TypeBehavior } from "view";

bindFwTheme("type");

const TypeApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, { name: "facePort", left: 0, right: 0, top: 0, bottom: 0, Behavior: TypeBehavior }),
		Port($, { name: "listPort", left: 0, right: 0, top: 0, bottom: 0, visible: false, Behavior: MenuBehavior }),
	],
}));

// Each target char is its own drawString, plus marks for errors.
export default new TypeApplication(null, {
	displayListLength: 8192,
	commandListLength: 8192,
	touchCount: 0,
});
