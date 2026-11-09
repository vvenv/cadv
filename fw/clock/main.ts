/*
	Cardputer-Adv Moddable + TypeScript clock entry.
	Application.template (+ Skin/Style) must stay in the main module —
	Moddable link rejects those constructors in other modules.
*/

import {} from "piu/MC";
import { AppBehavior } from "behavior";
import { MarqueeBehavior } from "marquee";
import { MenuBehavior } from "menu-view";
import { BG } from "ink";
import { bindFwTheme } from "theme";
import { SevenSegBehavior } from "sevenseg";

bindFwTheme("clock");

declare function trace(message: string): void;

// Keep the VM up long enough to print why we were about to restart.
(globalThis as { abort?: (msg: string, exception: { stack?: string }) => boolean }).abort = function (msg, exception) {
	trace("ABORT " + msg + "\n");
	if (exception && exception.stack)
		trace(exception.stack + "\n");
	return false;
};

const ClockApplication = Application.template($ => ({
	skin: new Skin({ fill: BG }),
	Behavior: AppBehavior,
	contents: [
		Port($, {
			name: "dateLabel",
			left: 0, right: 0, top: 0, height: 32,
			Behavior: MarqueeBehavior,
		}),
		Port($, {
			name: "clockPort",
			left: 0, right: 0, top: 32, bottom: 32,
			Behavior: SevenSegBehavior,
		}),
		Port($, {
			name: "valueLabel",
			left: 0, right: 0, top: 32, bottom: 32,
			visible: false,
			Behavior: MarqueeBehavior,
		}),
		Port($, {
			name: "lunarLabel",
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

// Port fills queue Piu lists (default 1024). HH:MM:SS + marquees + wifi glyph
// overflow 8192 → "display list overflowed" abort flood → stuck on 正在对时.
// Match count/step (16384); clock has two marquees on top of the Casio face.
export default new ClockApplication(null, {
	displayListLength: 32768,
	commandListLength: 32768,
	touchCount: 0,
});
