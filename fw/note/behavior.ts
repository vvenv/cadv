/*
	Edit cadv/*.txt. Other files show their size. Fn+Q draws a short QR.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { listFiles, MAX_TEXT_BYTES, nextName, openHome, readText, utf8Length, writeText, type NoteFile } from "files";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, isPageBack, navDir } from "keys";
import { helpList } from "help-ui";
import { menuStep } from "list";
import { asMenu } from "menu-view";
import { noteGlyph } from "ink";
import { Power } from "power";
import { qrBits } from "qr";
import { acceptStroke, titleGlyph } from "session";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { asQr } from "view";
import type { Directory } from "embedded:storage/files";

type Mode = "list" | "edit" | "qr" | "help";

const WIDTH = 16;

export class AppBehavior extends Behavior {
	mode: Mode = "list";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	dir: Directory | null = null;
	files: NoteFile[] = [];
	index = 0;
	helpIndex = 0;
	name = "";
	text = "";
	/** Text changed since open; only then is it written back. */
	dirty = false;
	/** File name armed by a first D press; a second D on it deletes. */
	armedDelete = "";
	hostEnterDown = false;
	note = "";

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.power = new Power("blank");
		this.dir = openHome();
		this.refresh();
		this.kb = new CardputerKeyboard();
		this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 25);
		this.paint(app);
	}

	onKeyboardTick(app: AppHost) {
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(app);
		if (stroke)
			this.handleStroke(app, stroke);
	}

	onKeyDown(content: unknown, key: string) {
		if (key === "\r" || key === "\n") {
			if (this.hostEnterDown)
				return;
			this.hostEnterDown = true;
		}
		const stroke = hostStroke(key);
		const use = this.power ? acceptStroke(this.power, stroke, true) : stroke;
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(content as AppHost);
		if (use)
			this.handleStroke(content as AppHost, use);
	}

	onKeyUp(_content: unknown, key: string) {
		if (key === "\r" || key === "\n")
			this.hostEnterDown = false;
	}

	handleStroke(app: AppHost, stroke: KeyStroke) {
		if (isLauncher(stroke)) {
			this.save();
			bootLauncher();
			return;
		}
		if (isHelp(stroke) && this.mode !== "help" && this.mode !== "edit") {
			this.mode = "help";
			this.helpIndex = 0;
			this.showQr(app, false);
			this.paint(app);
			return;
		}
		if (this.mode === "help" || this.mode === "qr") {
			if (isBack(stroke) || isConfirm(stroke)) {
				this.mode = this.mode === "qr" ? "edit" : "list";
				this.showQr(app, false);
				this.paint(app);
				return;
			}
			if (this.mode === "help") {
				const dir = navDir(stroke);
				if (dir !== 0)
					this.helpIndex += dir;
			}
			this.paint(app);
			return;
		}
		if (this.mode === "edit") {
			this.onEdit(app, stroke);
			return;
		}
		const wantsDelete = stroke.chars.some(ch => ch === "d" || ch === "D");
		if (!wantsDelete)
			this.armedDelete = "";
		if (stroke.chars.some(ch => ch === "n" || ch === "N")) {
			this.create(app);
			return;
		}
		const dir = navDir(stroke);
		if (dir !== 0 && this.files.length)
			this.index = menuStep(this.index, this.files.length, dir);
		if (isConfirm(stroke))
			this.open(app);
		if (wantsDelete)
			this.remove();
		this.paint(app);
	}

	onEdit(app: AppHost, stroke: KeyStroke) {
		if (isPageBack(stroke) && this.text.length === 0) {
			this.save();
			this.mode = "list";
			this.refresh();
			this.paint(app);
			return;
		}
		if (stroke.esc || stroke.left) {
			this.save();
			this.mode = "list";
			this.refresh();
			this.paint(app);
			return;
		}
		if (stroke.qr) {
			const bits = this.text.length && utf8Length(this.text) <= 17 ? qrBits(this.text) : null;
			this.note = bits ? "" : (this.text.length ? "太长" : "空");
			if (!bits) {
				this.paint(app);
				return;
			}
			this.mode = "qr";
			this.showQr(app, true);
			const port = contentByName(app, "qrPort");
			asQr(port)?.setBits(port, bits);
			return;
		}
		const before = this.text;
		if (stroke.del && this.text.length)
			this.text = this.text.slice(0, -1);
		else if (stroke.enter)
			this.text += "\n";
		else {
			for (const ch of stroke.chars) {
				if (this.text.length < 800)
					this.text += ch;
			}
		}
		if (this.text !== before)
			this.dirty = true;
		this.paint(app);
	}

	create(app: AppHost) {
		if (!this.dir) {
			this.note = "无卡";
			this.paint(app);
			return;
		}
		this.name = nextName(this.files);
		this.text = "";
		this.dirty = false;
		this.mode = "edit";
		this.paint(app);
	}

	open(app: AppHost) {
		const file = this.files[this.index];
		if (!file || !this.dir)
			return;
		if (!file.text) {
			this.note = file.name + " " + file.size + "B";
			this.paint(app);
			return;
		}
		const text = readText(this.dir, file.name);
		if (text === null) {
			this.note = file.size > MAX_TEXT_BYTES ? "太大 不能编辑" : "读不全 不能编辑";
			this.paint(app);
			return;
		}
		this.text = text;
		this.dirty = false;
		this.name = file.name;
		this.mode = "edit";
		this.paint(app);
	}

	remove() {
		const file = this.files[this.index];
		if (!file || !this.dir)
			return;
		if (this.armedDelete !== file.name) {
			this.armedDelete = file.name;
			this.note = "再按 D 删除";
			return;
		}
		this.armedDelete = "";
		try {
			this.dir.delete(file.name);
		}
		catch {
			this.note = "删失败";
		}
		this.refresh();
	}

	save() {
		if (!this.dir || !this.name || this.mode === "list" || !this.dirty)
			return;
		try {
			writeText(this.dir, this.name, this.text);
			this.dirty = false;
		}
		catch {
			this.note = "写失败";
		}
	}

	refresh() {
		this.files = this.dir ? listFiles(this.dir) : [];
		if (this.index >= this.files.length)
			this.index = 0;
	}

	showQr(app: AppHost, on: boolean) {
		setVisibleProp(contentByName(app, "qrPort"), on);
		setVisibleProp(contentByName(app, "listPort"), !on);
	}

	paint(app: AppHost) {
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (!view)
			return;
		if (this.mode === "help") {
			const page = helpList(helpFor(), this, helpTitle());
			view.setList(port, page.title, page.lines, "");
			return;
		}
		if (this.mode === "edit") {
			const lines = wrap(this.text.length ? this.text : "空").map(row => ({ text: row.text, selected: false }));
			const editNote = this.note;
			const g = noteGlyph(editNote).kind ? noteGlyph(editNote) : titleGlyph(this.power);
			view.setList(port, this.name + (editNote ? " " + editNote : ""), lines, "", g.kind, g.level);
			this.note = "";
			return;
		}
		if (!this.files.length) {
			const empty = this.dir ? (this.note || "N 新建") : "无卡";
			const g = noteGlyph(empty).kind ? noteGlyph(empty) : titleGlyph(this.power);
			view.setList(port, "记事", [{ text: empty, selected: false }], "", g.kind, g.level);
			this.note = "";
			return;
		}
		const lines = this.files.map((file, i) => ({
			text: file.text ? file.name : file.name + " " + file.size + "B",
			selected: i === this.index,
		}));
		const listNote = this.note;
		const g = noteGlyph(listNote).kind ? noteGlyph(listNote) : titleGlyph(this.power);
		view.setList(port, listNote || "记事", lines, "", g.kind, g.level);
		this.note = "";
	}
}

function wrap(text: string): { text: string }[] {
	const rows: { text: string }[] = [];
	const parts = text.split("\n");
	for (let p = 0; p < parts.length && rows.length < 8; p++) {
		const line = parts[p];
		if (!line.length) {
			rows.push({ text: " " });
			continue;
		}
		for (let i = 0; i < line.length && rows.length < 8; i += WIDTH)
			rows.push({ text: line.slice(i, i + WIDTH) });
	}
	return rows.length ? rows : [{ text: " " }];
}
