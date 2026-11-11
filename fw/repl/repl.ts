/*
	JavaScript REPL core: no UI here.

	Input runs through indirect eval, so it is sloppy global code and `var`
	and function declarations persist between lines. Top-level `let`,
	`const` and `class` would vanish with the eval, so scan() rewrites them
	to `var` (only at depth 0, outside strings and comments). The same pass
	decides whether brackets, strings or a template are still open, which
	turns Enter into a continuation line.

	The manifest sets "strip": [] so built-ins this app never calls itself
	(reduce, Map, Proxy...) still exist for typed code.
*/

import Timer from "timer";

export type Kind = "in" | "out" | "err" | "info";
export type Sink = (text: string, kind: Kind) => void;

export type Scan = { open: boolean; code: string };

const IDENT = /[A-Za-z0-9_$]/;

/** Open brackets / strings, and the rewrite of top-level declarations. */
export function scan(src: string): Scan {
	const stack: string[] = [];
	let out = "";
	let quote = "";
	let line = false;
	let block = false;
	let atStart = true;
	let i = 0;
	const n = src.length;
	while (i < n) {
		const c = src.charAt(i);
		const next = src.charAt(i + 1);
		const top = stack.length ? stack[stack.length - 1] : "";
		if (line) {
			if (c === "\n")
				line = false;
			out += c;
			i++;
			continue;
		}
		if (block) {
			if (c === "*" && next === "/") {
				block = false;
				out += "*/";
				i += 2;
				continue;
			}
			out += c;
			i++;
			continue;
		}
		if (quote) {
			if (c === "\\") {
				out += c + next;
				i += 2;
				continue;
			}
			if (c === quote || c === "\n")
				quote = "";
			out += c;
			i++;
			continue;
		}
		if (top === "`") {
			if (c === "\\") {
				out += c + next;
				i += 2;
				continue;
			}
			if (c === "`")
				stack.pop();
			else if (c === "$" && next === "{") {
				stack.push("${");
				out += "${";
				i += 2;
				continue;
			}
			out += c;
			i++;
			continue;
		}
		if (c === "/" && next === "/") {
			line = true;
			out += "//";
			i += 2;
			continue;
		}
		if (c === "/" && next === "*") {
			block = true;
			out += "/*";
			i += 2;
			continue;
		}
		if (c === " " || c === "\t" || c === "\n" || c === "\r") {
			out += c;
			i++;
			continue;
		}
		if (atStart && !stack.length) {
			const rest = src.slice(i);
			const decl = /^(let|const)(\s+)(?=[A-Za-z_$\[{])/.exec(rest);
			if (decl) {
				out += "var" + decl[2];
				i += decl[0].length;
				atStart = false;
				continue;
			}
			const cls = /^class\s+([A-Za-z_$][A-Za-z0-9_$]*)/.exec(rest);
			if (cls) {
				out += "var " + cls[1] + " = " + cls[0];
				i += cls[0].length;
				atStart = false;
				continue;
			}
		}
		atStart = false;
		if (c === "'" || c === "\"")
			quote = c;
		else if (c === "`")
			stack.push("`");
		else if (c === "(" || c === "[" || c === "{")
			stack.push(c);
		else if (c === ")" || c === "]" || c === "}") {
			const want = c === ")" ? "(" : c === "]" ? "[" : "{";
			if (top === want || (c === "}" && top === "${"))
				stack.pop();
			else
				return { open: false, code: src }; // mismatched: let eval report it
			if (c === "}" && !stack.length)
				atStart = true;
		}
		else if (c === ";" && !stack.length)
			atStart = true;
		out += c;
		i++;
	}
	return { open: stack.length > 0 || block, code: out };
}

const MAX_ITEMS = 16;
const MAX_TEXT = 1200;

function quoteString(s: string): string {
	return JSON.stringify(s);
}

function keyText(k: string): string {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : quoteString(k);
}

function ctorName(v: object): string {
	try {
		const proto = Object.getPrototypeOf(v);
		if (proto === null)
			return "[Object: null prototype]";
		const ctor = proto.constructor;
		if (typeof ctor === "function" && ctor.name && ctor.name !== "Object")
			return ctor.name;
	}
	catch {
		/* */
	}
	return "";
}

function fnText(f: Function): string {
	let src = "";
	try {
		src = Function.prototype.toString.call(f);
	}
	catch {
		/* */
	}
	const name = f.name || "(anonymous)";
	return src.startsWith("class") ? `[class ${name}]` : `[Function: ${name}]`;
}

function inner(v: unknown, depth: number, seen: object[]): string {
	switch (typeof v) {
		case "string":
			return quoteString(v);
		case "number":
			return Object.is(v, -0) ? "-0" : String(v);
		case "bigint":
			return String(v) + "n";
		case "symbol":
			return v.toString();
		case "function":
			return fnText(v);
		case "undefined":
			return "undefined";
		case "boolean":
			return String(v);
	}
	if (v === null)
		return "null";
	const o = v as object;
	if (seen.indexOf(o) >= 0)
		return "[Circular]";
	if (o instanceof Error)
		return `${o.name}: ${o.message}`;
	if (o instanceof Date)
		return isNaN(o.getTime()) ? "Invalid Date" : o.toISOString();
	if (o instanceof RegExp)
		return String(o);
	if (o instanceof Promise)
		return "Promise {}";
	if (depth > 2)
		return Array.isArray(o) ? "[Array]" : "[Object]";
	seen.push(o);
	try {
		if (Array.isArray(o)) {
			const parts: string[] = [];
			for (let i = 0; i < o.length && i < MAX_ITEMS; i++)
				parts.push(inner(o[i], depth + 1, seen));
			if (o.length > MAX_ITEMS)
				parts.push(`... ${o.length - MAX_ITEMS} more`);
			return "[" + parts.join(", ") + "]";
		}
		if (ArrayBuffer.isView(o) && !(o instanceof DataView)) {
			const a = o as unknown as ArrayLike<number | bigint>;
			const parts: string[] = [];
			for (let i = 0; i < a.length && i < MAX_ITEMS; i++)
				parts.push(inner(a[i], depth + 1, seen));
			if (a.length > MAX_ITEMS)
				parts.push("...");
			return `${ctorName(o)}(${a.length}) [${parts.join(", ")}]`;
		}
		if (o instanceof ArrayBuffer)
			return `ArrayBuffer(${o.byteLength})`;
		if (o instanceof Map) {
			const parts: string[] = [];
			for (const [k, val] of o) {
				if (parts.length >= MAX_ITEMS) {
					parts.push("...");
					break;
				}
				parts.push(inner(k, depth + 1, seen) + " => " + inner(val, depth + 1, seen));
			}
			return `Map(${o.size}) {${parts.join(", ")}}`;
		}
		if (o instanceof Set) {
			const parts: string[] = [];
			for (const k of o) {
				if (parts.length >= MAX_ITEMS) {
					parts.push("...");
					break;
				}
				parts.push(inner(k, depth + 1, seen));
			}
			return `Set(${o.size}) {${parts.join(", ")}}`;
		}
		const keys = Object.keys(o);
		const parts: string[] = [];
		for (let i = 0; i < keys.length && i < MAX_ITEMS; i++) {
			let val: unknown;
			try {
				val = (o as Record<string, unknown>)[keys[i]];
			}
			catch (e) {
				val = e;
			}
			parts.push(keyText(keys[i]) + ": " + inner(val, depth + 1, seen));
		}
		if (keys.length > MAX_ITEMS)
			parts.push("...");
		const name = ctorName(o);
		const body = parts.length ? "{" + parts.join(", ") + "}" : "{}";
		return name ? name + " " + body : body;
	}
	finally {
		seen.pop();
	}
}

/** Node-like one-line rendering, capped so one result cannot eat the heap. */
export function inspect(v: unknown): string {
	let text: string;
	try {
		text = inner(v, 0, []);
	}
	catch (e) {
		text = "[uninspectable]";
	}
	return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + "..." : text;
}

function errorText(e: unknown): string {
	if (e instanceof Error)
		return `${e.name}: ${e.message}`;
	return "Uncaught " + inspect(e);
}

/** print() shows strings bare, like console.log. */
function joinArgs(args: unknown[]): string {
	return args.map(a => typeof a === "string" ? a : inspect(a)).join(" ");
}

type Handle = ReturnType<typeof Timer.set>;

export class Repl {
	sink: Sink;
	onClear: () => void;
	timers = new Set<Handle>();

	constructor(sink: Sink, onClear: () => void) {
		this.sink = sink;
		this.onClear = onClear;
		this.installGlobals();
	}

	installGlobals() {
		const g = globalThis as Record<string, unknown>;
		const say = (kind: Kind) => (...args: unknown[]): undefined => {
			this.sink(joinArgs(args), kind);
		};
		g.print = say("out");
		g.console = Object.freeze({ log: say("out"), info: say("out"), warn: say("err"), error: say("err") });
		g.clear = () => {
			this.onClear();
		};
		g.inspect = inspect;
		g.setTimeout = (fn: Function, ms = 0, ...args: unknown[]) => this.timer(fn, ms, 0, args);
		g.setInterval = (fn: Function, ms = 0, ...args: unknown[]) => this.timer(fn, ms, Math.max(10, ms), args);
		g.clearTimeout = g.clearInterval = (id: Handle) => {
			if (!id || !this.timers.has(id))
				return;
			this.timers.delete(id);
			Timer.clear(id);
		};
		g.stopAll = () => this.stopAll();
	}

	/** Timers the user started. Callbacks run guarded so a throw prints instead of aborting. */
	timer(fn: Function, ms: number, every: number, args: unknown[]): Handle {
		if (typeof fn !== "function")
			throw new TypeError("callback is not a function");
		const id: Handle = Timer.set(() => {
			if (!every)
				this.timers.delete(id);
			try {
				fn(...args);
			}
			catch (e) {
				this.sink(errorText(e), "err");
			}
		}, Math.max(0, ms | 0), every);
		this.timers.add(id);
		return id;
	}

	stopAll(): number {
		const n = this.timers.size;
		for (const id of this.timers)
			Timer.clear(id);
		this.timers.clear();
		return n;
	}

	/** Evaluate one complete input. Results and errors go to the sink. */
	run(src: string) {
		const code = scan(src).code;
		const g = globalThis as Record<string, unknown>;
		const indirect = eval;
		let value: unknown;
		try {
			const t = code.trim();
			/* `{a: 1}` alone is an object, not a block with a label. */
			if (t.startsWith("{") && t.endsWith("}")) {
				try {
					value = indirect("(" + t + ")");
				}
				catch (e) {
					if (!(e instanceof SyntaxError))
						throw e;
					value = indirect(code);
				}
			}
			else
				value = indirect(code);
		}
		catch (e) {
			this.sink(errorText(e), "err");
			return;
		}
		g._ = value;
		if (value instanceof Promise) {
			this.sink("Promise {<pending>}", "info");
			value.then(
				v => {
					g._ = v;
					this.sink("=> " + inspect(v), "out");
				},
				e => this.sink(errorText(e), "err"),
			);
			return;
		}
		this.sink(inspect(value), value === undefined ? "info" : "out");
	}
}
