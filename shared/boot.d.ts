export interface Installer {
	begin(size: number): void;
	write(chunk: ArrayBuffer): void;
	finish(): void;
	abort(): void;
}

export function openInstaller(): Installer;
export function bootLauncher(): void;

/** Boot the app slot as is when it already holds this image. Returns false otherwise. */
export function bootInstalled(tail: ArrayBuffer, size: number): boolean;
/**
	Mark this image as started after ms (default 3s). Until then a restart
	rolls back to the launcher. The launcher passes 0.
*/
export function confirmBoot(ms?: number): void;
/** The last app restarted before it confirmed, so the bootloader went back to the launcher. */
export function bootCrashed(): boolean;
