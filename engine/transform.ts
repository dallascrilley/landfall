/**
 * Content transformation: WordPress body HTML → HTML safe to render from a
 * static Astro build.
 *
 * This is deliberately conservative. It removes what cannot work without a
 * WordPress runtime and rewrites what would keep pointing at the old origin.
 * It does not attempt to reconstruct page-builder layouts — see the honest
 * boundaries section of the README.
 */

export interface TransformOptions {
	/** Origin the WordPress site served from, e.g. `https://example.com`. */
	wpOrigin: string;
	/** Astro route prefix for posts, used to rewrite internal post links. */
	postRoutePrefix?: string;
	/** Origin paths that moved, as `{ "/old/": "/new/" }`. */
	rewrites?: Record<string, string>;
}

export interface TransformResult {
	html: string;
	/** What was removed, for the migration report. */
	removed: { scripts: number; styles: number; builderWrappers: number };
	/** Absolute origin links rewritten to site-relative. */
	rewritten: number;
	/** Absolute URLs still pointing at the old origin (media, usually). */
	remainingOriginRefs: string[];
}

/** Attributes WordPress and its page builders hang runtime behavior off. */
const RUNTIME_ATTRS =
	/\s(?:data-elementor-[a-z-]+|data-elementor|data-et-[a-z-]+|data-vc-[a-z-]+|data-settings|data-widget_type|data-id)="[^"]*"/gi;

/** Wrapper classes with no meaning outside the builder that emitted them. */
const BUILDER_CLASSES =
	/\b(?:elementor(?:-[\w-]+)?|et_pb_[\w-]+|et-[\w-]+|vc_[\w-]+|wpb_[\w-]+|wp-block-[\w-]+|has-[\w-]+-color|is-layout-[\w-]+)\b/g;

function stripTag(html: string, tag: string): { html: string; count: number } {
	let count = 0;
	const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
	let out = html.replace(paired, () => {
		count += 1;
		return "";
	});
	const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
	out = out.replace(selfClosing, () => {
		count += 1;
		return "";
	});
	return { html: out, count };
}

/** Drop now-empty `class=""` left behind after builder classes are stripped. */
function cleanClasses(html: string): { html: string; wrappers: number } {
	let wrappers = 0;
	const out = html.replace(/\sclass="([^"]*)"/gi, (match, value: string) => {
		const kept = value.replace(BUILDER_CLASSES, "").replace(/\s+/g, " ").trim();
		if (kept === value) return match;
		wrappers += 1;
		return kept ? ` class="${kept}"` : "";
	});
	return { html: out, wrappers };
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite `https://old-origin/about/` → `/about/`, leaving `/wp-content/`
 * media alone: those files are not in the build, and silently making them
 * relative would turn a working image into a 404.
 */
function relativizeOrigin(
	html: string,
	wpOrigin: string,
): { html: string; rewritten: number; remaining: string[] } {
	const origin = wpOrigin.replace(/\/+$/, "");
	if (!origin) return { html, rewritten: 0, remaining: [] };
	let rewritten = 0;
	const pattern = new RegExp(`${escapeRegExp(origin)}(/[^"'\\s>]*)?`, "gi");
	const remaining = new Set<string>();
	const out = html.replace(pattern, (match, path: string | undefined) => {
		const suffix = path ?? "/";
		if (/^\/wp-(content|includes|admin|json)\b/i.test(suffix)) {
			remaining.add(match);
			return match;
		}
		rewritten += 1;
		return suffix;
	});
	return { html: out, rewritten, remaining: [...remaining] };
}

function applyRewrites(html: string, rewrites: Record<string, string>): string {
	let out = html;
	for (const [from, to] of Object.entries(rewrites)) {
		const pattern = new RegExp(`(href=")${escapeRegExp(from)}(")`, "gi");
		out = out.replace(pattern, `$1${to}$2`);
	}
	return out;
}

export function transformHtml(html: string, options: TransformOptions): TransformResult {
	const source = String(html ?? "");
	const withoutScripts = stripTag(source, "script");
	const withoutStyles = stripTag(withoutScripts.html, "style");
	const withoutAttrs = withoutStyles.html.replace(RUNTIME_ATTRS, "");
	const cleaned = cleanClasses(withoutAttrs);
	const relative = relativizeOrigin(cleaned.html, options.wpOrigin);
	const rewritten = applyRewrites(relative.html, options.rewrites ?? {});

	return {
		html: rewritten.replace(/\n{3,}/g, "\n\n").trim(),
		removed: {
			scripts: withoutScripts.count,
			styles: withoutStyles.count,
			builderWrappers: cleaned.wrappers,
		},
		rewritten: relative.rewritten,
		remainingOriginRefs: relative.remaining,
	};
}
