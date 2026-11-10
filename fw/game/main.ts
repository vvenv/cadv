import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { MenuBehavior } from "menu-view";
import { GameBehavior } from "view";

bindFwTheme("game");

const GameApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, { name: "gamePort", left: 0, right: 0, top: 0, bottom: 0, visible: false, Behavior: GameBehavior }),
		Port($, { name: "listPort", left: 0, right: 0, top: 0, bottom: 0, Behavior: MenuBehavior }),
	],
}));

// A long snake is one fill per cell; 2048 draws 16 tiles with labels.
export default new GameApplication(null, {
	displayListLength: 16384,
	commandListLength: 16384,
	touchCount: 0,
});
