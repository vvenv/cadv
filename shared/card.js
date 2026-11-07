/*
	SD free space. Importing the files volume mounts the card first.
	Do not call native at import time: the image build runs this on the host.
*/

import root from "embedded:storage/files";

function mount() {
	try {
		root.status("cadv");
	}
	catch (e) {
		/* missing directory still means the volume mounted */
	}
}

export function cardSpace() {
	var raw;
	var parts;
	var free;
	var total;
	mount();
	try {
		raw = String(native("xs_card_space")());
	}
	catch (e) {
		return null;
	}
	if (!raw)
		return null;
	parts = raw.split("\t");
	free = Number(parts[0]);
	total = Number(parts[1]);
	if (!(free >= 0) || !(total > 0) || free !== free || total !== total)
		return null;
	return { free: free, total: total };
}
