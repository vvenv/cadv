import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { MenuBehavior } from "menu-view";
import { MeterBehavior } from "view";

bindFwTheme("db");

const MeterApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, { name: "facePort", left: 0, right: 0, top: 0, bottom: 0, Behavior: MeterBehavior }),
		Port($, { name: "listPort", left: 0, right: 0, top: 0, bottom: 0, visible: false, Behavior: MenuBehavior }),
	],
}));

// 7-seg readout plus one bar per history slot.
export default new MeterApplication(null, {
	displayListLength: 16384,
	commandListLength: 16384,
	touchCount: 0,
});
