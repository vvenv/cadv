import type { Air, Hit } from "air";

export type { Air, Hit };

export function openAir(_onHit: (hit: Hit) => void): Air | null {
	return null;
}
