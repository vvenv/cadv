import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { MenuBehavior } from "menu-view";

const CalcApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			Behavior: MenuBehavior,
		}),
	],
}));

export default new CalcApplication(null, { displayListLength: 4096, touchCount: 0 });
