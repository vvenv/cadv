/*
	USB MSC bridge. The Mac build uses msc_stub.ts.
	Do not call native at import time: the image build runs this module on the host.
*/

export function start() {
	const raw = native("xs_msc_start").call(this);
	return typeof raw === "string" ? raw : "";
}

export function stop() {
	return native("xs_msc_stop").call(this);
}

export function status() {
	const raw = native("xs_msc_status").call(this);
	if (typeof raw !== "string" || raw.length === 0)
		return { ready: false, sectors: 0, sectorSize: 0 };
	const parts = raw.split("\t");
	return {
		ready: parts[0] === "1",
		sectors: Number(parts[1] || 0),
		sectorSize: Number(parts[2] || 0),
	};
}
