export interface Installer {
	begin(size: number): void;
	write(chunk: ArrayBuffer): void;
	finish(): void;
	abort(): void;
}

export function openInstaller(): Installer;
export function bootLauncher(): void;
