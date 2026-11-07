import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { MenuBehavior } from "menu-view";
import { PianoBehavior } from "view";

const PianoApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, { name: "facePort", left: 0, right: 0, top: 0, bottom: 0, Behavior: PianoBehavior }),
		Port($, { name: "listPort", left: 0, right: 0, top: 0, bottom: 0, visible: false, Behavior: MenuBehavior }),
	],
}));

export default new PianoApplication(null, { displayListLength: 4096, touchCount: 0 });
