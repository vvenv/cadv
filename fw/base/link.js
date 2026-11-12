/*
	Device side of the USB file link. The Mac build uses link_stub.ts.
	Do not call native at import time: the image build runs this module on the host.
*/

export function pollLink() {
	const raw = native("xs_link_poll").call(this);
	if (typeof raw !== "string" || raw.length === 0)
		return null;
	const parts = raw.split("\t");
	const phase = parts[0];
	if (phase === "err")
		return { phase, name: "", got: 0, total: 0, message: parts[1] || "io" };
	if (phase === "done")
		return { phase, name: parts[1] || "", got: 0, total: 0, message: "" };
	if (phase === "recv")
		return {
			phase,
			name: parts[1] || "",
			got: Number(parts[2] || 0),
			total: Number(parts[3] || 0),
			message: "",
		};
	return null;
}

export function setLinkBusy(busy) {
	return native("xs_link_busy").call(this, busy ? 1 : 0);
}
