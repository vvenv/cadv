/*
	International Morse (ITU-R M.1677). Letters and digits only:
	the punctuation keys are taken by navigation, volume, and help.
*/

const TABLE: Readonly<Record<string, string>> = Object.freeze({
	A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.",
	H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.",
	O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-",
	V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
	"0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
	"5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
});

/** Koch order: start with two characters, add one at a time. */
export const KOCH = "KMURESNAPTLWIJZFOYVGQHBCDX5928347160";
export const KOCH_MIN = 2;

export function morseOf(ch: string): string {
	return TABLE[ch.toUpperCase()] ?? "";
}

export function isMorseChar(ch: string): boolean {
	return ch.length === 1 && morseOf(ch) !== "";
}

/** One dit in ms (PARIS standard: 50 dits per word). */
export function ditMs(wpm: number): number {
	return Math.round(1200 / wpm);
}
