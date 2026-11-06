/*
	BLE keyboard. Application.template stays in the main module.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG, FONT_UI, INK, ON } from "ink";
import { MenuBehavior } from "menu-view";

const KbApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Label($, {
			name: "statusLabel",
			left: 6, right: 0, top: 0, height: 32,
			style: new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "middle" }),
			string: "未连接",
		}),
		Label($, {
			name: "echoLabel",
			left: 6, right: 0, top: 32, bottom: 32,
			style: new Style({ font: FONT_UI, color: ON, horizontal: "left", vertical: "middle" }),
			string: "CADV KB",
		}),
		Label($, {
			name: "hintLabel",
			left: 6, right: 0, bottom: 0, height: 32,
			style: new Style({ font: FONT_UI, color: INK, horizontal: "left", vertical: "middle" }),
			string: "",
		}),
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			visible: false,
			Behavior: MenuBehavior,
		}),
	],
}));

export default new KbApplication(null, { displayListLength: 4096, touchCount: 0 });
