/*
	Built-in practice text. No `?` anywhere: that key opens help.
	Lines are wrapped at LINE_MAX characters so they fit the 240px panel
	in the proportional UI font.
*/

export type Source = "words" | "sentences" | "home";

export const SOURCES: readonly Source[] = Object.freeze(["words", "sentences", "home"]);

export const LINE_MAX = 18;

const WORDS: readonly string[] = Object.freeze([
	"the", "be", "to", "of", "and", "in", "that", "have", "it", "for",
	"not", "on", "with", "he", "as", "you", "do", "at", "this", "but",
	"his", "by", "from", "they", "we", "say", "her", "she", "or", "an",
	"will", "my", "one", "all", "would", "there", "their", "what", "so", "up",
	"out", "if", "about", "who", "get", "which", "go", "me", "when", "make",
	"can", "like", "time", "no", "just", "him", "know", "take", "people", "into",
	"year", "your", "good", "some", "could", "them", "see", "other", "than", "then",
	"now", "look", "only", "come", "its", "over", "think", "also", "back", "after",
	"use", "two", "how", "our", "work", "first", "well", "way", "even", "new",
	"want", "because", "any", "these", "give", "day", "most", "us", "is", "was",
	"are", "had", "has", "been", "were", "said", "each", "many", "much", "very",
	"long", "little", "own", "old", "right", "big", "high", "small", "large", "next",
	"early", "young", "few", "great", "same", "able", "last", "home", "water", "room",
	"mother", "father", "school", "book", "word", "hand", "eye", "place", "world", "life",
	"child", "head", "house", "friend", "night", "light", "tree", "river", "city", "story",
	"music", "game", "class", "point", "number", "open", "close", "start", "keep", "turn",
	"bring", "write", "read", "play", "run", "move", "live", "stand", "learn", "change",
	"help", "show", "hear", "ask", "feel", "try", "leave", "call", "find", "tell",
	"quick", "brown", "happy", "green", "cold", "warm", "sweet", "clean", "early", "quiet",
]);

const SENTENCES: readonly string[] = Object.freeze([
	"The quick brown fox jumps over the lazy dog.",
	"Pack my box with five dozen liquor jugs.",
	"How vexingly quick daft zebras jump.",
	"Sphinx of black quartz, judge my vow.",
	"The five boxing wizards jump quickly.",
	"Practice makes perfect.",
	"Slow and steady wins the race.",
	"Every day is a new start.",
	"Read a little every day.",
	"Keep your eyes on the screen.",
	"Small steps add up to big results.",
	"The early bird catches the worm.",
	"Good things take time.",
	"Water is cold; tea is warm.",
	"I like apples, pears, and plums.",
	"She sells sea shells by the sea shore.",
	"Two plus three is five.",
	"Open the window and let the light in.",
	"My friend lives near the river.",
	"We play games after school.",
	"It is never too late to learn.",
	"Look before you leap.",
	"Actions speak louder than words.",
	"Do not count your chickens early.",
	"The rain in Spain stays mainly in the plain.",
	"A journey of a thousand miles begins with one step.",
]);

const HOME: readonly string[] = Object.freeze([
	"asdf", "jkl;", "fdsa", ";lkj", "fjfj", "dkdk", "slsl", "a;a;",
	"ask", "lad", "dad", "sad", "fall", "hall", "flask", "salad",
	"gag", "had", "glad", "half", "dash", "lash", "jag", "hag",
	"fj dk", "sl a;", "gh gh", "as df", "jk l;",
	"sign", "work", "both", "hand", "turn", "form", "half", "make",
	"wish", "town", "girl", "rich", "laid", "fork", "lamb", "dial",
]);

function pick<T>(list: readonly T[]): T {
	return list[Math.floor(Math.random() * list.length)];
}

/** Greedy wrap of a word stream into lines of at most LINE_MAX chars. */
function wrap(words: string[], lines: number): string[] {
	const out: string[] = [];
	let line = "";
	for (const w of words) {
		if (out.length >= lines)
			break;
		if (!line.length)
			line = w;
		else if (line.length + 1 + w.length <= LINE_MAX)
			line += " " + w;
		else {
			out.push(line);
			line = w;
		}
	}
	if (line.length && out.length < lines)
		out.push(line);
	return out;
}

/** `count` lines of practice text for one round. */
export function makeRound(source: Source, count: number): string[] {
	const words: string[] = [];
	if (source === "sentences") {
		/* Whole sentences, in a shuffled order, until the lines are full. */
		const order = SENTENCES.slice();
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			const t = order[i];
			order[i] = order[j];
			order[j] = t;
		}
		for (const s of order) {
			for (const w of s.split(" "))
				words.push(w);
			if (words.length > count * 6)
				break;
		}
	}
	else {
		const list = source === "home" ? HOME : WORDS;
		for (let i = 0; i < count * 8; i++)
			words.push(pick(list));
	}
	const lines = wrap(words, count);
	while (lines.length < count)
		lines.push(pick(WORDS));
	return lines;
}

export function sourceLabel(source: Source): string {
	if (source === "sentences")
		return "句子";
	if (source === "home")
		return "键位";
	return "单词";
}
