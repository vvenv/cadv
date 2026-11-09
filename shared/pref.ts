/*
	Typed Preference getters for a single NVS domain.
	Firmware schemas stay in each app; this only parses and clamps.
*/

import Preference from "preference";

export type Pref = {
	getBool(name: string, fallback: boolean): boolean;
	getInt(name: string, fallback: number, min: number, max: number): number;
	/** Unbounded number (or parseInt of a string). */
	getNum(name: string, fallback: number): number;
	getFloat(name: string, fallback: number): number;
	getString(name: string, fallback: string, options?: { nonempty?: boolean }): string;
	set(name: string, value: boolean | number | string): void;
};

export function pref(domain: string): Pref {
	return Object.freeze({
		getBool(name, fallback) {
			try {
				const v = Preference.get(domain, name);
				if (typeof v === "boolean")
					return v;
				if (typeof v === "number")
					return v !== 0;
				if (typeof v === "string")
					return v === "1" || v === "true";
			}
			catch {
				/* */
			}
			return fallback;
		},
		getInt(name, fallback, min, max) {
			try {
				const v = Preference.get(domain, name);
				let n = fallback;
				if (typeof v === "number")
					n = v;
				else if (typeof v === "string")
					n = parseInt(v, 10);
				if (typeof n !== "number" || n !== n)
					n = fallback;
				if (n < min)
					n = min;
				if (n > max)
					n = max;
				return n | 0;
			}
			catch {
				return fallback;
			}
		},
		getNum(name, fallback) {
			try {
				const v = Preference.get(domain, name);
				if (typeof v === "number" && v === v)
					return v;
				if (typeof v === "string") {
					const n = parseInt(v, 10);
					if (n === n)
						return n;
				}
			}
			catch {
				/* */
			}
			return fallback;
		},
		getFloat(name, fallback) {
			try {
				const v = Preference.get(domain, name);
				let n = fallback;
				if (typeof v === "number")
					n = v;
				else if (typeof v === "string")
					n = parseFloat(v);
				if (n !== n)
					return fallback;
				return n;
			}
			catch {
				return fallback;
			}
		},
		getString(name, fallback, options) {
			try {
				const v = Preference.get(domain, name);
				if (typeof v === "string") {
					if (options && options.nonempty && !v.length)
						return fallback;
					return v;
				}
			}
			catch {
				/* */
			}
			return fallback;
		},
		set(name, value) {
			Preference.set(domain, name, value);
		},
	});
}
