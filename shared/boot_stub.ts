/*
	Desktop stand-in. Installing an image and rebooting only exist on the device.
*/

export interface Installer {
	begin(size: number): void;
	write(chunk: ArrayBuffer): void;
	finish(): void;
	abort(): void;
}

export function openInstaller(): Installer {
	throw new Error("仅真机");
}

export function bootLauncher() {
}

export function bootInstalled(_tail: ArrayBuffer, _size: number): boolean {
	return false;
}

export function confirmBoot(_ms?: number) {
}

export function bootCrashed(): boolean {
	return false;
}
