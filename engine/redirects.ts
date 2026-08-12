/**
 * Pure redirect model plus per-host serializers.
 *
 * Kept pure — no file I/O — so every branch is unit-testable and so the parity
 * verifier can check the same rule set that gets deployed, rather than
 * re-parsing whichever host format happened to be written to disk.
 */

import { normalize } from "./paths";
import type { UrlEntry } from "./types";

export interface Redirect {
	from: string;
	to: string;
	status: number;
}

export interface BuildInput {
	urls?: UrlEntry[];
	/** Hand-written rules. An override always beats a generated rule. */
	overrides?: Record<string, string>;
}

/**
 * Generated rules: every manifest row whose origin URL differs from where the
 * built site serves it. That is the only class of redirect the engine invents,
 * and it is derived from the same manifest the verifier checks — so a rule can
 * never disagree with the URL it is supposed to rescue.
 *
 * Shadowed rows are skipped: their origin belongs to another entry, and a rule
 * pointing away from a live page would take that page off the internet.
 */
function generatedRules(urls: UrlEntry[]): Redirect[] {
	return urls
		.filter((entry) => entry.shadowedBy === undefined)
		.filter((entry) => normalize(entry.origin) !== normalize(entry.target))
		.map((entry) => ({ from: entry.origin, to: entry.target, status: 301 }));
}

/**
 * Rules that are safe on any WordPress migration: the admin surface never
 * exists in a static build. Dropped if it would shadow a live path.
 */
function autoRules(urls: UrlEntry[]): Redirect[] {
	const live = new Set(urls.map((entry) => normalize(entry.origin)));
	return [{ from: "/wp-admin/*", to: "/", status: 301 }].filter(
		(rule) => !live.has(normalize(rule.from)),
	);
}

export function buildRedirects({ urls = [], overrides = {} }: BuildInput): Redirect[] {
	const byFrom = new Map<string, Redirect>();
	for (const rule of [...autoRules(urls), ...generatedRules(urls)]) {
		byFrom.set(rule.from, rule);
	}
	for (const [from, to] of Object.entries(overrides)) {
		byFrom.set(from, { from, to, status: 301 });
	}
	return [...byFrom.values()].sort((a, b) => a.from.localeCompare(b.from));
}

/** Netlify / Cloudflare Pages `_redirects`: `<from>  <to>  <status>` per line. */
export function toNetlify(model: Redirect[]): string {
	// Strip newlines from config-controlled paths so a typo in an override
	// cannot inject extra rules into the generated file.
	const clean = (value: string) => value.replace(/[\r\n]+/g, "");
	return model.map((rule) => `${clean(rule.from)}  ${clean(rule.to)}  ${rule.status}`).join("\n");
}

/**
 * Parse a Netlify/Cloudflare `_redirects` body back into the model.
 * Used by `verify` so a hand-edited host file cannot silently disagree with
 * the rules the parity check resolves against.
 */
export function parseNetlify(text: string): Redirect[] {
	const rules: Redirect[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const parts = line.split(/\s+/);
		if (parts.length < 2) {
			throw new Error(`Invalid _redirects line: ${JSON.stringify(raw)}`);
		}
		const status = parts.length >= 3 ? Number(parts[2]) : 301;
		if (!Number.isFinite(status)) {
			throw new Error(`Invalid status on _redirects line: ${JSON.stringify(raw)}`);
		}
		rules.push({ from: parts[0]!, to: parts[1]!, status });
	}
	return rules;
}

/** Order-independent equality on from/to/status. */
export function sameRedirectModel(a: Redirect[], b: Redirect[]): boolean {
	const key = (rule: Redirect) => `${rule.from}\0${rule.to}\0${rule.status}`;
	const left = a.map(key).sort();
	const right = b.map(key).sort();
	if (left.length !== right.length) return false;
	return left.every((entry, index) => entry === right[index]);
}

/** `vercel.json` redirects array (`permanent` = 301). */
export function toVercel(model: Redirect[]): {
	redirects: { source: string; destination: string; permanent: boolean }[];
} {
	return {
		redirects: model.map((rule) => ({
			source: rule.from,
			destination: rule.to,
			permanent: rule.status === 301,
		})),
	};
}

/**
 * Astro `redirects` config map, read by `astro.config.mjs`.
 *
 * Wildcards are dropped: Astro route patterns are `[...rest]`, not globs, and a
 * literal `/wp-admin/*` key would build a route at that literal path. Those
 * rules still ship in the host redirect file, where the syntax is supported.
 */
export function toAstro(model: Redirect[]): Record<string, { status: number; destination: string }> {
	const out: Record<string, { status: number; destination: string }> = {};
	for (const rule of model) {
		if (rule.from.includes("*")) continue;
		out[rule.from] = { status: rule.status, destination: rule.to };
	}
	return out;
}
