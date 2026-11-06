export interface LinkEvent {
	phase: "recv" | "done" | "err";
	name: string;
	got: number;
	total: number;
	message: string;
}

export function pollLink(): LinkEvent | null;
export function setLinkBusy(busy: boolean): void;
