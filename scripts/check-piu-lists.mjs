#!/usr/bin/env node
/*
	Guard against the "backlight on, black panel" failure from Piu command-list overflow.

	Port.fill queue into a byte buffer sized by Application's commandListLength
	(default 1024). shared/draw's 7-segment and disk helpers burn that quickly;
	overflow throws "command list overflowed" in sim/debug and leaves a black
	panel on release with the backlight already lit by Power.

	Usage:
	  node scripts/check-piu-lists.mjs
	  node scripts/check-piu-lists.mjs step metro
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FW = path.join(ROOT, "fw");

/** Apps that call these must raise commandListLength well above the default. */
const HEAVY = [
	{ re: /\bdrawReadout\b/, why: "drawReadout", min: 8192 },
	{ re: /\bfillDisk\b/, why: "fillDisk", min: 8192 },
	{ re: /\bstrokeDisk\b/, why: "strokeDisk", min: 8192 },
];

/** Many Port.fill without the shared helpers can still overflow. */
const FILL_WARN = 40;
const FILL_MIN = 4096;

function listFwIds(filter) {
	const ids = fs.readdirSync(FW).filter((id) => {
		const dir = path.join(FW, id);
		return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, "manifest.json"));
	}).sort();
	if (!filter.length)
		return ids;
	const missing = filter.filter((id) => !ids.includes(id));
	if (missing.length)
		throw new Error("没有固件：" + missing.join(" "));
	return filter;
}

function walkTs(dir) {
	const out = [];
	for (const name of fs.readdirSync(dir)) {
		if (name === "sample" || name === "node_modules")
			continue;
		const full = path.join(dir, name);
		const st = fs.statSync(full);
		if (st.isDirectory())
			out.push(...walkTs(full));
		else if (/\.(ts|js)$/.test(name) && name !== "main.ts")
			out.push(full);
	}
	return out;
}

function readMain(id) {
	const file = path.join(FW, id, "main.ts");
	if (!fs.existsSync(file))
		return { file, text: "", commandListLength: null, displayListLength: null };
	const text = fs.readFileSync(file, "utf8");
	const cmd = text.match(/\bcommandListLength\s*:\s*(\d+)/);
	const disp = text.match(/\bdisplayListLength\s*:\s*(\d+)/);
	return {
		file,
		text,
		commandListLength: cmd ? Number(cmd[1]) : null,
		displayListLength: disp ? Number(disp[1]) : null,
	};
}

function scanApp(id) {
	const sources = walkTs(path.join(FW, id)).map((file) => ({
		file,
		text: fs.readFileSync(file, "utf8"),
	}));
	const body = sources.map((s) => s.text).join("\n");
	const hits = [];
	let min = 0;
	for (const rule of HEAVY) {
		if (!rule.re.test(body))
			continue;
		hits.push(rule.why);
		if (rule.min > min)
			min = rule.min;
	}
	const fillCount = (body.match(/\.fillColor\s*\(/g) || []).length;
	if (!hits.length && fillCount >= FILL_WARN) {
		hits.push(`fillColor×${fillCount}`);
		min = FILL_MIN;
	}
	return { id, hits, min, fillCount, main: readMain(id), sources };
}

function check(id) {
	const app = scanApp(id);
	if (!app.hits.length)
		return { id, ok: true, detail: "无重绘制" };
	const have = app.main.commandListLength;
	if (have == null) {
		return {
			id,
			ok: false,
			detail: `${app.hits.join("+")} 需要 main.ts 设 commandListLength >= ${app.min}（现在是默认 1024）`,
		};
	}
	if (have < app.min) {
		return {
			id,
			ok: false,
			detail: `${app.hits.join("+")} 需要 commandListLength >= ${app.min}（现在是 ${have}）`,
		};
	}
	const disp = app.main.displayListLength;
	const note = disp == null ? "；建议同时设 displayListLength" : "";
	return {
		id,
		ok: true,
		detail: `${app.hits.join("+")} ok（commandListLength ${have}${note}）`,
	};
}

function main() {
	const filter = process.argv.slice(2).filter((a) => !a.startsWith("-"));
	const ids = listFwIds(filter);
	let failed = 0;
	for (const id of ids) {
		const r = check(id);
		const mark = r.ok ? "✓" : "✗";
		console.log(`${mark} ${id}: ${r.detail}`);
		if (!r.ok)
			failed++;
	}
	if (failed) {
		console.error(`\n${failed} 个固件可能黑屏：Piu command list 不够。见 shared/draw.ts 顶部说明。`);
		process.exit(1);
	}
}

main();
