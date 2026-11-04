/*
	Cardputer-Adv oriented Moddable + TypeScript hello.
	Desktop sim / device: PIU label + live clock (not yet wired to ADV LCD driver).
*/

import {} from "piu/MC";
import type { Label as LabelContent } from "piu/MC";

const backgroundSkin = new Skin({ fill: "black" });
const titleStyle = new Style({ font: "semibold 20px Open Sans", color: "white" });
const timeStyle = new Style({ font: "24px Open Sans", color: "#7CFC00" });
const subStyle = new Style({ font: "16px Open Sans", color: "#AAAAAA" });

function pad2(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

function formatNow(): string {
	const d = new Date();
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

class ClockBehavior extends Behavior {
	onDisplaying(label: LabelContent) {
		label.string = formatNow();
		label.interval = 500;
		label.start();
	}
	onTimeChanged(label: LabelContent) {
		label.string = formatNow();
	}
}

const HelloApplication = Application.template($ => ({
	skin: backgroundSkin,
	contents: [
		Label($, {
			left: 0, right: 0, top: 18, height: 24,
			style: titleStyle,
			string: "Hello, Cardputer-Adv",
		}),
		Label($, {
			left: 0, right: 0, top: 52, height: 32,
			style: timeStyle,
			string: "--:--:--",
			Behavior: ClockBehavior,
		}),
		Label($, {
			left: 0, right: 0, bottom: 12, height: 20,
			style: subStyle,
			string: "TypeScript + Moddable",
		}),
	],
}));

export default new HelloApplication(null, { displayListLength: 2048, touchCount: 0 });
