/**
 * URL parity verifier — the proof that every URL arrived.
 *
 * The claim being tested: every URL the WordPress export says the old site
 * served is reachable on the built Astro site, either because that route was
 * built, or because a redirect rule that will actually be deployed sends it to
 * a route that was built, in one hop.
 *
 * Three properties make this a proof rather than a summary:
 *
 *  1. The origin list comes from the export, not from the build. You cannot
 *     make the report pass by forgetting to migrate a page — a page that never
 *     made it is a missing URL, not an absent row.
 *  2. Redirect targets are resolved against built routes. A rule pointing at a
 *     404, at another rule, or at itself fails; it does not count as coverage.
 *  3. A redirect stub (`<meta http-equiv="refresh">`) is a route that exists
 *     but does not land, so it never satisfies a URL on its own.
 *
 * The core is pure: it takes the manifest, the rules and a map of built routes.
 * `scanDist` is the only part that touches the filesystem.
 */

import { normalize } from "./paths";
import type { Redirect } from "./redirects";
import type { UrlEntry } from "./types";

export type ParityStatus =
	| "direct"
	| "redirected"
	| "ignored"
	| "shadowed"
	| "missing"
	| "dangling"
	| "chain"
	| "loop"
	| "self";

/** `true` when the status means the URL is genuinely reachable. */
export const PASSING: ReadonlySet<ParityStatus> = new Set<ParityStatus>([
	"direct",
	"redirected",
	"ignored",
	"shadowed",
]);

export interface ParityResult {
	origin: string;
	status: ParityStatus;
	/** Where the URL ended up, when it resolved. */
	resolved: string | null;
	type: "page" | "post";
	title: string;
	detail: string;
}

export interface ParityReport {
	generatedAt: string;
	ok: boolean;
	totals: {
		originUrls: number;
		direct: number;
		redirected: number;
		ignored: number;
		shadowed: number;
		failed: number;
		routesBuilt: number;
	};
	failures: ParityResult[];
	results: ParityResult[];
	/** Built routes no origin URL claims — new pages, archives, 404. */
	newRoutes: string[];
}

export interface BuiltRoute {
	/** A `<meta http-equiv="refresh">` page: exists, but does not land. */
	isStub: boolean;
}

export interface VerifyInput {
	urls: UrlEntry[];
	rules: Redirect[];
	routes: Map<string, BuiltRoute>;
	/** Origin path prefixes that are intentionally not migrated. */
	ignore?: string[];
}

function isIgnored(path: string, ignore: string[]): boolean {
	return ignore.some((prefix) => path === prefix || path.startsWith(prefix));
}

/** Exact match first, then `/prefix/*` wildcards, longest prefix wins. */
function matchRule(path: string, rules: Redirect[]): Redirect | null {
	const target = normalize(path);
	const exact = rules.find((rule) => normalize(rule.from) === target);
	if (exact) return exact;

	let best: Redirect | null = null;
	for (const rule of rules) {
		if (!rule.from.endsWith("*")) continue;
		const prefix = rule.from.slice(0, -1);
		if (!target.startsWith(prefix)) continue;
		if (!best || prefix.length > best.from.length - 1) best = rule;
	}
	return best;
}

function lands(path: string, routes: Map<string, BuiltRoute>): boolean {
	const route = routes.get(normalize(path));
	return route !== undefined && !route.isStub;
}

function isExternal(target: string): boolean {
	return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

/** Resolve one origin URL against the built site and the deployed rules. */
function resolveOne(
	entry: UrlEntry,
	rules: Redirect[],
	routes: Map<string, BuiltRoute>,
	ignore: string[],
): ParityResult {
	const origin = normalize(entry.origin);
	const base = { origin, type: entry.type, title: entry.title };

	if (isIgnored(origin, ignore)) {
		return { ...base, status: "ignored", resolved: null, detail: "listed in parity.ignore" };
	}

	// A shadowed row does not own its origin URL — another entry does, and that
	// entry is checked on its own row. What still has to be true is that the
	// shadowed content itself was built somewhere.
	if (entry.shadowedBy !== undefined) {
		const target = normalize(entry.target);
		if (lands(target, routes)) {
			return {
				...base,
				status: "shadowed",
				resolved: target,
				detail: `origin claimed by #${entry.shadowedBy}; content served at ${target}`,
			};
		}
		return {
			...base,
			status: "missing",
			resolved: null,
			detail: `shadowed by #${entry.shadowedBy} and its own route ${target} was not built`,
		};
	}

	if (lands(origin, routes)) {
		return { ...base, status: "direct", resolved: origin, detail: "route built" };
	}

	const rule = matchRule(origin, rules);
	if (!rule) {
		const stub = routes.get(origin)?.isStub === true;
		return {
			...base,
			status: "missing",
			resolved: null,
			detail: stub
				? "route is a redirect stub with no rule behind it"
				: "no route built and no redirect rule matches",
		};
	}

	const destination = normalize(rule.to);
	if (isExternal(rule.to)) {
		return {
			...base,
			status: "redirected",
			resolved: rule.to,
			detail: "redirects off-site (target not verifiable here)",
		};
	}
	if (destination === origin) {
		return { ...base, status: "self", resolved: destination, detail: "rule redirects to itself" };
	}
	if (lands(destination, routes)) {
		return {
			...base,
			status: "redirected",
			resolved: destination,
			detail: `301 → ${destination}`,
		};
	}

	const next = matchRule(destination, rules);
	if (next) {
		const status: ParityStatus = normalize(next.to) === origin ? "loop" : "chain";
		return {
			...base,
			status,
			resolved: destination,
			detail:
				status === "loop"
					? `${origin} → ${destination} → ${origin}`
					: `${origin} → ${destination} → ${normalize(next.to)} (more than one hop)`,
		};
	}
	if (routes.get(destination)?.isStub === true) {
		return {
			...base,
			status: "chain",
			resolved: destination,
			detail: `${destination} is a redirect stub, not a landing page`,
		};
	}
	return {
		...base,
		status: "dangling",
		resolved: destination,
		detail: `redirect target ${destination} was not built`,
	};
}

export function verifyParity({ urls, rules, routes, ignore = [] }: VerifyInput): ParityReport {
	const results = urls.map((entry) => resolveOne(entry, rules, routes, ignore));

	const claimed = new Set<string>();
	for (const result of results) {
		claimed.add(result.origin);
		if (result.resolved && !isExternal(result.resolved)) claimed.add(normalize(result.resolved));
	}

	const count = (status: ParityStatus) => results.filter((r) => r.status === status).length;
	const failures = results.filter((result) => !PASSING.has(result.status));

	return {
		generatedAt: new Date().toISOString(),
		ok: failures.length === 0,
		totals: {
			originUrls: results.length,
			direct: count("direct"),
			redirected: count("redirected"),
			ignored: count("ignored"),
			shadowed: count("shadowed"),
			failed: failures.length,
			routesBuilt: routes.size,
		},
		failures,
		results,
		newRoutes: [...routes.keys()].filter((route) => !claimed.has(route)).sort(),
	};
}
