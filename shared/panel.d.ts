export interface PanelOut {
	readonly width: number;
	readonly height: number;
	readonly pixelFormat: number;
	readonly async: boolean;
	readonly c_dispatch: object;
	begin(x: number, y: number, width: number, height: number): void;
	send(pixels: Uint16Array | ArrayBuffer, offset?: number, count?: number): void;
	end(): void;
	pixelsToBytes(count: number): number;
	adaptInvalid?(rect?: object): void;
}

export function takePanel(): PanelOut | null;
export function panelStats(): string;
export function panelShow(on: boolean): void;
export function paintDeck(
	screen: object,
	width: number,
	height: number,
	bg: number,
	ink: number,
	accent: number,
	text: string,
): void;
