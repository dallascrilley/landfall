/**
 * Path normalization. Every comparison in the parity verifier goes through
 * `normalize`, so `/about`, `/about/` and `/about/?utm=x` can never be counted
 * as three different routes.
 */

export interface PathNode {
	id: number;
	slug: string;
	parent: number;
}

/** `about` → `/about/`; empty → `/`. Always leading and trailing slash. */
export function toPath(slug: string): string {
	const bare = String(slug ?? "").replace(/^\/+|\/+$/g, "");
	return bare ? `/${bare}/` : "/";
}

/**
 * Canonical form for route comparison: query and fragment dropped, trailing
 * slash enforced except for `/` and bare files (`/404.html`).
 */
export function normalize(urlPath: string): string {
	const raw = String(urlPath ?? "");
	if (!raw.startsWith("/")) return raw;
	const [bare] = raw.split(/[?#]/);
	if (bare === "/" || /\.[a-z0-9]+$/i.test(bare)) return bare;
	return bare.endsWith("/") ? bare : `${bare}/`;
}

/**
 * Full WordPress page path, walking the parent chain: a page with slug
 * `our-roastery` under `about` is served at `about/our-roastery`, not
 * `our-roastery`. Cycles (a corrupt export) terminate instead of hanging.
 */
export function pagePath(page: PathNode, byId: Map<number, PathNode>): string {
	const segments = [page.slug];
	const seen = new Set<number>([page.id]);
	let current = page;
	while (current.parent > 0) {
		const parent = byId.get(current.parent);
		if (!parent || seen.has(parent.id)) break;
		seen.add(parent.id);
		segments.unshift(parent.slug);
		current = parent;
	}
	return segments.join("/");
}
