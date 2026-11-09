/*
	Dictionary lookup. Application.template stays in the main module.
	One entry on screen. The lexicon is cadv/dict/lex.bin, not flash.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { MarqueeBehavior } from "marquee";
import { BG, FONT_UI, ON } from "ink";
import { bindFwTheme } from "theme";
import { MenuBehavior } from "menu-view";

bindFwTheme("dict");

const DictApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "queryLabel",
			left: 0, right: 0, top: 0, height: 32,
			Behavior: MarqueeBehavior,
		}),
		Label($, {
			name: "wordLabel",
			left: 0, right: 0, top: 32, bottom: 64,
			style: new Style({ font: FONT_UI, color: ON, horizontal: "center", vertical: "middle" }),
			string: "",
		}),
		Port($, {
			name: "glossLabel",
			left: 0, right: 0, bottom: 32, height: 32,
			Behavior: MarqueeBehavior,
		}),
		Port($, {
			name: "phoneLabel",
			left: 0, right: 0, bottom: 0, height: 32,
			Behavior: MarqueeBehavior,
		}),
		Port($, {
			name: "listPort",
			left: 0, right: 0, top: 0, bottom: 0,
			visible: false,
			Behavior: MenuBehavior,
		}),
	],
}));

export default new DictApplication(null, { displayListLength: 4096, touchCount: 0 });
