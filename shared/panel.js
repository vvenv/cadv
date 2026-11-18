/*
	Device side of the external ILI9341. The image build runs this module
	on the host, so native calls stay inside functions.
*/

class Panel extends Native("xs_panel_destructor") {
	constructor() {
		super();
		this.present = native("xs_panel").call(this) ? true : false;
	}

	begin(x, y, width, height) {
		return native("xs_panel_begin").call(this, x, y, width, height);
	}

	send(pixels, offset, count) {
		return native("xs_panel_send").call(this, pixels, offset, count);
	}

	end() {
		return native("xs_panel_end").call(this);
	}

	adaptInvalid() {
	}

	pixelsToBytes(count) {
		return count << 1;
	}

	get pixelFormat() {
		return native("xs_panel_format").call(this);
	}

	get width() {
		return 320;
	}

	get height() {
		return 240;
	}

	get async() {
		return false;
	}

	get c_dispatch() {
		return this;
	}
}

export function takePanel() {
	try {
		const panel = new Panel();
		if (!panel.present)
			return null;
		return panel;
	}
	catch (e) {
		return null;
	}
}

export function panelStats() {
	try {
		const raw = native("xs_panel_stats").call(this);
		return typeof raw === "string" ? raw : "";
	}
	catch (e) {
		return "";
	}
}

export function panelShow(on) {
	try {
		native("xs_panel_show").call(this, on ? 1 : 0);
	}
	catch (e) {
	}
}

export function paintDeck(screen, width, height, bg, ink, accent, text) {
	return native("xs_panel_deck").call(this, screen, width, height, bg, ink, accent, text);
}
