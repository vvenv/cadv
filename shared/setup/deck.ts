/*
	Runs after setup/piu, which has already built the built-in screen.
	Only modules under setup/ are invoked before main.
*/

import { startDeck } from "deck";

export default function (done: () => void) {
	try {
		startDeck();
	}
	finally {
		done();
	}
}
