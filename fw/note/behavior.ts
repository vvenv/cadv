/*
	Notes in cadv/note/*.txt. List shows each note's first line, newest first.
	The editor has a cursor (Fn+H/J/K/L), held keys repeat, and the note is
	saved a few seconds after typing stops and again on leaving.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { listFiles, MAX_TEXT_BYTES, nextName, openHome, readText, utf8Length, writeText, type NoteFile } from "files";
import { asEdit } from "editor";
import { helpFor, helpTitle } from "help";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir } from "keys";
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

/** Save this long after the last edit. */
const AUTOSAVE_MS = 3000;
const REPEAT_DELAY = 400;
const REPEAT_RATE = 60;

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
	cursor = 0;
	bytes = 0;
	/** Text changed since the last write; only then is it written back. */
	dirty = false;
	/** Date.now() of the last edit, for autosave. */
	editedAt = 0;
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
		else if (this.dirty && this.mode === "edit" && Date.now() - this.editedAt > AUTOSAVE_MS) {
			this.save();
			this.paint(app);
		}
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
		if (this.mode === "edit") {
			this.onEdit(app, stroke);
			return;
		}
		if (isHelp(stroke) && this.mode !== "help") {
			this.mode = "help";
			this.helpIndex = 0;
			this.show(app);
			this.paint(app);
			return;
		}
		if (this.mode === "help" || this.mode === "qr") {
			if (isBack(stroke) || isConfirm(stroke) || stroke.qr) {
				this.mode = this.mode === "qr" ? "edit" : "list";
				this.show(app);
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
		if (isConfirm(stroke)) {
			this.open(app);
			return;
		}
		if (wantsDelete)
			this.remove();
		this.paint(app);
	}

	onEdit(app: AppHost, stroke: KeyStroke) {
		const port = contentByName(app, "editPort");
		const view = asEdit(port);
		if (stroke.esc) {
			this.leaveEdit(app);
			return;
		}
		if (stroke.qr) {
			const bits = this.text.length && this.bytes <= 17 ? qrBits(this.text) : null;
			if (!bits) {
				this.note = this.text.length ? "太长" : "空";
				this.paint(app);
				return;
			}
			this.mode = "qr";
			this.show(app);
			const qrPort = contentByName(app, "qrPort");
			asQr(qrPort)?.setBits(qrPort, bits);
			return;
		}
		if (stroke.up || stroke.down) {
			if (view)
				this.cursor = view.vertical(stroke.up ? -1 : 1);
			this.paint(app);
			return;
		}
		if (view)
			view.goalX = -1;
		if (stroke.left || stroke.right) {
			this.cursor = Math.max(0, Math.min(this.text.length, this.cursor + (stroke.left ? -1 : 1)));
			this.paint(app);
			return;
		}
		const t = this.text;
		const c = this.cursor;
		if (stroke.del) {
			if (c > 0) {
				this.bytes -= utf8Length(t.charAt(c - 1));
				this.text = t.slice(0, c - 1) + t.slice(c);
				this.cursor = c - 1;
			}
		}
		else {
			let add = stroke.enter ? "\n" : stroke.tab ? "  " : stroke.chars.join("");
			while (add.length && this.bytes + utf8Length(add) > MAX_TEXT_BYTES)
				add = add.slice(0, -1);
			if (!add.length && (stroke.enter || stroke.chars.length))
				this.note = "满了";
			if (add.length) {
				this.text = t.slice(0, c) + add + t.slice(c);
				this.cursor = c + add.length;
				this.bytes += utf8Length(add);
			}
		}
		if (this.text !== t) {
			this.dirty = true;
			this.editedAt = Date.now();
		}
		this.paint(app);
	}

	enterEdit(app: AppHost, name: string, text: string) {
		this.name = name;
		this.text = text;
		this.cursor = text.length;
		this.bytes = utf8Length(text);
		this.dirty = false;
		this.mode = "edit";
		if (this.kb) {
			this.kb.repeatDelay = REPEAT_DELAY;
			this.kb.repeatRate = REPEAT_RATE;
		}
		const view = asEdit(contentByName(app, "editPort"));
		if (view) {
			view.top = 0;
			view.goalX = -1;
		}
		this.show(app);
		this.paint(app);
	}

	leaveEdit(app: AppHost) {
		this.save();
		if (this.kb)
			this.kb.repeatDelay = 0;
		this.mode = "list";
		this.refresh();
		const at = this.files.findIndex(f => f.name === this.name);
		if (at >= 0)
			this.index = at;
		this.show(app);
		this.paint(app);
	}

	create(app: AppHost) {
		if (!this.dir) {
			this.note = "无卡";
			this.paint(app);
			return;
		}
		this.enterEdit(app, nextName(this.files), "");
	}

	open(app: AppHost) {
		const file = this.files[this.index];
		if (!file || !this.dir) {
			this.paint(app);
			return;
		}
		const text = readText(this.dir, file.name);
		if (text === null) {
			this.note = file.size > MAX_TEXT_BYTES ? "太大 不能编辑" : "读不全 不能编辑";
			this.paint(app);
			return;
		}
		this.enterEdit(app, file.name, text);
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
			this.note = "已删";
		}
		catch {
			this.note = "删失败";
		}
		this.refresh();
	}

	save() {
		if (!this.dir || !this.name || this.mode === "list" || this.mode === "help" || !this.dirty)
			return;
		try {
			writeText(this.dir, this.name, this.text);
			this.dirty = false;
		}
		catch {
			this.note = "写失败";
			// Retry on the next autosave window, not every tick.
			this.editedAt = Date.now();
		}
	}

	refresh() {
		this.files = this.dir ? listFiles(this.dir) : [];
		if (this.index >= this.files.length)
			this.index = Math.max(0, this.files.length - 1);
	}

	show(app: AppHost) {
		setVisibleProp(contentByName(app, "qrPort"), this.mode === "qr");
		setVisibleProp(contentByName(app, "editPort"), this.mode === "edit");
		setVisibleProp(contentByName(app, "listPort"), this.mode === "list" || this.mode === "help");
	}

	paint(app: AppHost) {
		if (this.mode === "qr")
			return;
		if (this.mode === "edit") {
			const port = contentByName(app, "editPort");
			const view = asEdit(port);
			if (!view)
				return;
			const status = this.note || (this.dirty ? "*" : "");
			const g = noteGlyph(this.note).kind ? noteGlyph(this.note) : titleGlyph(this.power);
			view.setDoc(port, this.name.replace(/\.txt$/, "") + (status ? " " + status : ""), this.text, this.cursor, g.kind, g.level);
			this.note = "";
			return;
		}
		const port = contentByName(app, "listPort");
		const view = asMenu(port);
		if (!view)
			return;
		if (this.mode === "help") {
			const page = helpList(helpFor(), this, helpTitle());
			view.setList(port, page.title, page.lines, "");
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
			text: file.preview || "(空)",
			right: file.name.replace(/\.txt$/, ""),
			selected: i === this.index,
		}));
		const listNote = this.note;
		const g = noteGlyph(listNote).kind ? noteGlyph(listNote) : titleGlyph(this.power);
		view.setList(port, listNote || "记事 " + this.files.length, lines, "", g.kind, g.level);
		this.note = "";
	}
}
