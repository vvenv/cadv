import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { MenuBehavior } from "menu-view";
import { MeterBehavior } from "view";

const RecApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "meterPort",
			left: 0, right: 0, top: 0, bottom: 0,
			Behavior: MeterBehavior,
		}),
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			visible: false,
			Behavior: MenuBehavior,
		}),
	],
}));

export default new RecApplication(null, { displayListLength: 8192, commandListLength: 8192, touchCount: 0 });
