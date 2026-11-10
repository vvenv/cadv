/*
	Desktop stand-in. No IR LED: sends are traced so the codes can be checked.
*/

export const irAvailable = false;

export function irSend(pin: number, carrierHz: number, durations: number[]): void {
	trace(`ir pin ${pin} ${carrierHz}Hz ${durations.length} edges: ${durations.slice(0, 12).join(",")}…\n`);
}

export function irClose(): void {
}
