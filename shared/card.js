/*
	SD free space. Touching the files volume mounts the card.
	Do not import that module here: its body calls device natives, and the
	image build runs this module on the host.
*/

import Modules from "modules";

function mount() {
	var root;
	try {
		root = Modules.importNow("embedded:storage/files");
	}
	catch (e) {
		return;
	}
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
