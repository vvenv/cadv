/*
	Game picker plus three games: Snake, 2048, and a falling-block puzzle.
	Directions are the keycap arrows (; . , /), WASD, or Fn+H/J/K/L.
	Blocks also reads the held keys so left / right / down repeat.
*/

import {} from "piu/MC";
import Timer from "timer";
import { bootLauncher } from "boot";
import { helpFor, helpTitle } from "help";
import { helpList } from "help-ui";
import { CardputerKeyboard, type KeyStroke } from "keyboard";
import { hostStroke } from "hostkey";
import { isBack, isConfirm, isHelp, isLauncher, navDir, volumeDelta } from "keys";
import { asMenu, type MenuLine } from "menu-view";
import { pref } from "pref";
import { Power } from "power";
import { acceptStroke, titleGlyph } from "session";
import { ClockSound } from "sound";
import { VOL_DEFAULT, VOL_MAX, VOL_MIN } from "volume";
import { contentByName, setVisibleProp, type AppHost } from "ui";
import { Snake, type Dir } from "snake";
import { Tiles } from "tiles";
import { Blocks } from "blocks";
import { asGame } from "view";

const store = pref("game");

type GameId = "snake" | "tiles" | "blocks";
type Mode = "menu" | "play" | "help";

const GAMES: readonly { id: GameId; label: string }[] = Object.freeze([
	{ id: "snake", label: "贪吃蛇" },
	{ id: "tiles", label: "2048" },
	{ id: "blocks", label: "方块" },
]);

/* Held-key repeat for blocks: first repeat after DAS_MS, then every ARR_MS. */
const DAS_MS = 170;
const ARR_MS = 55;
const SOFT_MS = 40;

/** 0 up, 1 right, 2 down, 3 left, or -1. Arrow flags first, then keycaps and WASD. */
function dirOf(stroke: KeyStroke): Dir | -1 {
	if (stroke.up)
		return 0;
	if (stroke.right)
		return 1;
	if (stroke.down)
		return 2;
	if (stroke.left)
		return 3;
	let d: Dir | -1 = -1;
	for (const ch of stroke.chars) {
		const c = ch.toLowerCase();
		if (c === ";" || c === "w")
			d = 0;
		else if (c === "/" || c === "d")
			d = 1;
		else if (c === "." || c === "s")
			d = 2;
		else if (c === "," || c === "a")
			d = 3;
	}
	return d;
}

export class AppBehavior extends Behavior {
	mode: Mode = "menu";
	kb: CardputerKeyboard | null = null;
	power: Power | null = null;
	sound: ClockSound | null = null;
	kbTimer: ReturnType<typeof Timer.repeat> | null = null;
	stepTimer: ReturnType<typeof Timer.set> | null = null;
	pick = 0;
	game: GameId = "snake";
	snake: Snake | null = null;
	tiles: Tiles | null = null;
	blocks: Blocks | null = null;
	/** Held direction for blocks repeat: -1 left, 1 right, 2 down, 0 none. */
	holdDir = 0;
	holdNext = 0;
	paused = false;
	best: Record<GameId, number> = { snake: 0, tiles: 0, blocks: 0 };
	newBest = false;
	volume = VOL_DEFAULT;
	helpIndex = 0;
	helpFrom: Mode = "menu";
	hostEnterDown = false;

	onDisplaying(content: unknown) {
		const app = content as AppHost;
		this.best.snake = store.getInt("best_snake", 0, 0, 99999);
		this.best.tiles = store.getInt("best_tiles", 0, 0, 9999999);
		this.best.blocks = store.getInt("best_blocks", 0, 0, 9999999);
		this.volume = store.getInt("volume", VOL_DEFAULT, VOL_MIN, VOL_MAX);
		this.pick = store.getInt("pick", 0, 0, GAMES.length - 1);
		this.power = new Power("blank");
		this.paint(app);
		Timer.set(() => {
			this.sound = new ClockSound();
			this.sound.setVolume(this.volume);
			this.kb = new CardputerKeyboard();
			this.kbTimer = Timer.repeat(() => this.onKeyboardTick(app), 20);
		}, 1);
	}

	onKeyboardTick(app: AppHost) {
		const raw = this.kb?.poll() ?? null;
		const stroke = this.power ? acceptStroke(this.power, raw, true) : raw;
		const note = this.power?.takeNote() ?? "";
		if (note)
			this.paint(app);
		if (stroke)
			this.handleStroke(app, stroke);
		if (this.mode === "play" && this.game === "blocks")
			this.repeatHeld(app);
	}

	/** Auto-repeat for blocks from the physical keys still down (board only). */
	repeatHeld(app: AppHost) {
		const kb = this.kb;
		const b = this.blocks;
		if (!kb || !b || b.over || this.paused)
			return;
		kb.pollHeld();
		let dir = 0;
		for (const k of kb.held.keys) {
			const c = typeof k.code === "string" ? k.code.toLowerCase() : "";
			if (c === "," || c === "a")
				dir = -1;
			else if (c === "/" || c === "d")
				dir = 1;
			else if (c === "." || c === "s")
				dir = 2;
		}
		const now = Date.now();
		if (dir !== this.holdDir) {
			/* The press itself already moved once via handleStroke. */
			this.holdDir = dir;
			this.holdNext = now + (dir === 2 ? SOFT_MS : DAS_MS);
			return;
		}
		if (!dir || now < this.holdNext)
			return;
		if (dir === 2) {
			this.holdNext = now + SOFT_MS;
			this.blocksSoft(app);
			return;
		}
		this.holdNext = now + ARR_MS;
		if (b.shift(dir))
			this.paint(app);
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
			this.stopClock();
			try { this.sound?.close(); } catch { /* */ }
			bootLauncher();
			return;
		}
		if (isHelp(stroke) && this.mode !== "help") {
			this.helpFrom = this.mode;
			if (this.mode === "play" && this.game !== "tiles")
				this.pause(true);
			this.helpIndex = 0;
			this.mode = "help";
			this.paint(app);
			return;
		}
		if (this.mode === "help") {
			if (isBack(stroke) || isConfirm(stroke)) {
				this.mode = this.helpFrom;
				this.paint(app);
				return;
			}
			const dir = navDir(stroke);
			if (dir !== 0)
				this.helpIndex += dir;
			this.paint(app);
			return;
		}
		const vol = volumeDelta(stroke.chars);
		if (vol !== 0) {
			this.volume = Math.max(VOL_MIN, Math.min(VOL_MAX, this.volume + vol));
			this.sound?.setVolume(this.volume);
			try { store.set("volume", this.volume); } catch { /* */ }
			this.paint(app);
			return;
		}
		if (this.mode === "menu") {
			const dir = navDir(stroke);
			if (dir !== 0) {
				this.pick = (this.pick + dir + GAMES.length) % GAMES.length;
				this.paint(app);
				return;
			}
			if (isConfirm(stroke))
				this.start(app, GAMES[this.pick].id);
			return;
		}
		/* Playing. BS / Esc go back; ← (Fn+H) is a direction here. */
		if (stroke.del || stroke.esc) {
			this.stopClock();
			this.mode = "menu";
			this.paint(app);
			return;
		}
		if (this.game === "snake")
			this.snakeKey(app, stroke);
		else if (this.game === "blocks")
			this.blocksKey(app, stroke);
		else
			this.tilesKey(app, stroke);
	}

	start(app: AppHost, id: GameId) {
		this.stopClock();
		this.game = id;
		this.mode = "play";
		this.paused = false;
		this.newBest = false;
		try { store.set("pick", this.pick); } catch { /* */ }
		if (id === "snake") {
			this.snake = new Snake();
			this.paint(app);
			this.scheduleStep(app);
		}
		else if (id === "blocks") {
			this.blocks = new Blocks();
			this.holdDir = 0;
			this.paint(app);
			this.scheduleFall(app);
		}
		else {
			this.tiles = new Tiles();
			this.paint(app);
		}
	}

	blocksKey(app: AppHost, stroke: KeyStroke) {
		const b = this.blocks;
		if (!b)
			return;
		if (b.over) {
			if (stroke.enter || stroke.chars.indexOf(" ") >= 0)
				this.start(app, "blocks");
			return;
		}
		if (stroke.chars.some(ch => ch === "p" || ch === "P") || (stroke.enter && this.paused)) {
			this.pause(!this.paused);
			if (!this.paused)
				this.scheduleFall(app);
			this.paint(app);
			return;
		}
		if (this.paused)
			return;
		if (stroke.chars.indexOf(" ") >= 0 || stroke.enter) {
			b.hardDrop();
			this.afterLock(app);
			return;
		}
		if (stroke.chars.some(ch => ch === "z" || ch === "Z")) {
			if (b.rotate(-1))
				this.paint(app);
			return;
		}
		const d = dirOf(stroke);
		if (d === 0) {
			if (b.rotate(1))
				this.paint(app);
		}
		else if (d === 1 || d === 3) {
			if (b.shift(d === 1 ? 1 : -1))
				this.paint(app);
		}
		else if (d === 2)
			this.blocksSoft(app);
	}

	blocksSoft(app: AppHost) {
		const b = this.blocks;
		if (!b)
			return;
		if (b.fall(true))
			this.afterLock(app);
		else
			this.paint(app);
	}

	scheduleFall(app: AppHost) {
		this.stopClock();
		const b = this.blocks;
		if (!b || b.over || this.paused)
			return;
		/* While resting on the stack, check often so the lock delay is honoured. */
		const ms = b.groundedAt ? 60 : b.fallMs;
		this.stepTimer = Timer.set(() => {
			this.stepTimer = null;
			if (!this.blocks || this.mode !== "play" || this.paused)
				return;
			if (this.blocks.fall(false))
				this.afterLock(app);
			else {
				this.paint(app);
				this.scheduleFall(app);
			}
		}, ms);
	}

	/** Sound, score bookkeeping, and the next gravity tick after a piece locks. */
	afterLock(app: AppHost) {
		const b = this.blocks;
		if (!b)
			return;
		if (b.cleared) {
			const tones = [{ hz: 880, ms: 40 }];
			for (let i = 1; i < b.cleared; i++)
				tones.push({ hz: 880 + i * 220, ms: 40 });
			this.sound?.play(tones);
		}
		else
			this.sound?.play([{ hz: 300, ms: 15 }]);
		if (b.over) {
			this.stopClock();
			this.sound?.play([{ hz: 330, ms: 120 }, { hz: 220, ms: 220 }]);
			this.record("blocks", b.score);
			this.power?.activity();
			this.paint(app);
			return;
		}
		this.paint(app);
		this.scheduleFall(app);
	}

	snakeKey(app: AppHost, stroke: KeyStroke) {
		const snake = this.snake;
		if (!snake)
			return;
		if (snake.over) {
			if (stroke.enter || stroke.chars.indexOf(" ") >= 0)
				this.start(app, "snake");
			return;
		}
		for (const ch of stroke.chars) {
			if (ch === "p" || ch === "P" || ch === " ") {
				this.pause(!this.paused);
				if (!this.paused)
					this.scheduleStep(app);
				this.paint(app);
				return;
			}
		}
		if (stroke.enter && this.paused) {
			this.pause(false);
			this.scheduleStep(app);
			this.paint(app);
			return;
		}
		const d = dirOf(stroke);
		if (d < 0)
			return;
		if (this.paused) {
			this.pause(false);
			this.scheduleStep(app);
		}
		snake.turn(d as Dir);
	}

	pause(on: boolean) {
		this.paused = on;
		if (on)
			this.stopClock();
	}

	scheduleStep(app: AppHost) {
		this.stopClock();
		const snake = this.snake;
		if (!snake || snake.over || this.paused)
			return;
		this.stepTimer = Timer.set(() => {
			this.stepTimer = null;
			this.snakeStep(app);
		}, snake.stepMs);
	}

	snakeStep(app: AppHost) {
		const snake = this.snake;
		if (!snake || this.mode !== "play" || this.paused)
			return;
		snake.step();
		if (snake.ate)
			this.sound?.play([{ hz: 1200 + Math.min(snake.score, 40) * 20, ms: 30 }]);
		if (snake.over) {
			this.sound?.play([{ hz: 330, ms: 120 }, { hz: 220, ms: 220 }]);
			this.record("snake", snake.score);
			/* Game over wakes a dimmed panel so the score is seen. */
			this.power?.activity();
			this.paint(app);
			return;
		}
		this.paint(app);
		this.scheduleStep(app);
	}

	tilesKey(app: AppHost, stroke: KeyStroke) {
		const tiles = this.tiles;
		if (!tiles)
			return;
		if (tiles.over) {
			if (stroke.enter || stroke.chars.indexOf(" ") >= 0)
				this.start(app, "tiles");
			return;
		}
		if (tiles.won && !tiles.keepGoing && (stroke.enter || stroke.chars.indexOf(" ") >= 0)) {
			tiles.keepGoing = true;
			this.paint(app);
			return;
		}
		const d = dirOf(stroke);
		if (d < 0)
			return;
		if (tiles.won && !tiles.keepGoing)
			tiles.keepGoing = true;
		if (!tiles.move(d)) {
			this.sound?.play([{ hz: 200, ms: 25 }]);
			return;
		}
		if (tiles.merged) {
			const step = Math.min(10, Math.round(Math.log(tiles.merged) / Math.LN2));
			this.sound?.play([{ hz: 500 + step * 90, ms: 35 }]);
		}
		if (tiles.over) {
			this.sound?.play([{ hz: 330, ms: 120 }, { hz: 220, ms: 220 }]);
			this.record("tiles", tiles.score);
		}
		else if (tiles.score > this.best.tiles)
			this.record("tiles", tiles.score);
		this.paint(app);
	}

	record(id: GameId, score: number) {
		if (score <= this.best[id])
			return;
		this.best[id] = score;
		this.newBest = true;
		try { store.set("best_" + id, score); } catch { /* */ }
	}

	stopClock() {
		if (this.stepTimer)
			Timer.clear(this.stepTimer);
		this.stepTimer = null;
	}

	paint(app: AppHost) {
		const list = contentByName(app, "listPort");
		const port = contentByName(app, "gamePort");
		if (this.mode !== "play") {
			setVisibleProp(port, false);
			setVisibleProp(list, true);
			const view = asMenu(list);
			if (!view)
				return;
			if (this.mode === "help") {
				const page = helpList(helpFor(), this, helpTitle());
				view.setList(list, page.title, page.lines, "");
				return;
			}
			const lines: MenuLine[] = [];
			for (let i = 0; i < GAMES.length; i++) {
				const g = GAMES[i];
				lines.push({ text: g.label, right: "最高 " + this.best[g.id], selected: i === this.pick });
			}
			const g = titleGlyph(this.power);
			view.setList(list, "游戏", lines, "", g.kind || (this.volume <= 0 ? "mute" : "vol"), g.kind ? g.level : this.volume);
			return;
		}
		setVisibleProp(list, false);
		setVisibleProp(port, true);
		const view = asGame(port);
		if (!view)
			return;
		if (this.game === "snake" && this.snake) {
			const s = this.snake;
			view.setSnake(port, {
				body: s.body.slice(),
				food: s.food,
				score: s.score,
				best: this.best.snake,
				banner: s.over ? (this.newBest ? "新纪录 " : "结束 ") + s.score : this.paused ? "暂停" : "",
			});
		}
		else if (this.game === "blocks" && this.blocks) {
			const b = this.blocks;
			const piece = b.over ? [] : b.cellsAt(b.px, b.py, b.turn);
			const ghost = b.over ? [] : b.cellsAt(b.px, b.ghostY(), b.turn);
			view.setBlocks(port, {
				well: Array.from(b.well),
				piece,
				ghost,
				kind: b.kind,
				next: b.nextCells(),
				nextKind: b.next,
				score: b.score,
				lines: b.lines,
				level: b.level + 1,
				best: this.best.blocks,
				banner: b.over ? (this.newBest ? "新纪录" : "结束") : this.paused ? "暂停" : "",
			});
		}
		else if (this.tiles) {
			const t = this.tiles;
			let banner = "";
			if (t.over)
				banner = this.newBest ? "新纪录" : "结束";
			else if (t.won && !t.keepGoing)
				banner = "2048!";
			view.setTiles(port, {
				cells: t.cells.slice(),
				spawned: t.spawned,
				score: t.score,
				best: this.best.tiles,
				banner,
			});
		}
	}
}
