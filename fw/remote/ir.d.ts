/** Mark / space durations in µs, starting with a mark. Blocks until sent. */
export function irSend(pin: number, carrierHz: number, durations: number[]): void;
export function irClose(): void;
export const irAvailable: boolean;
