export type AppHost = {
	content: (name: string) => unknown;
};

export function contentByName(app: AppHost, name: string): unknown {
	return app.content(name);
}

export function setStringProp(target: unknown, value: string) {
	if (target && typeof target === "object" && "string" in target)
		(target as { string: string }).string = value;
}

export function setVisibleProp(target: unknown, value: boolean) {
	if (!target || typeof target !== "object" || !("visible" in target))
		return;
	const node = target as { visible: boolean };
	if (node.visible !== value)
		node.visible = value;
}
