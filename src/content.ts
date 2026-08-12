/**
 * Reader for the generated content in `content/`.
 *
 * Read through `fs` rather than a JSON import so a fresh clone type-checks
 * before the first ingest, and so a stale build can never silently reuse
 * content baked into the module graph.
 */

import fs from "node:fs";
import path from "node:path";

export interface ContentEntry {
	id: number;
	slug: string;
	route: string;
	title: string;
	html: string;
	excerpt: string;
	date: string | null;
	author: string | null;
	seo: { title: string | null; description: string | null };
	image: { url: string; alt: string } | null;
	categories: string[];
	tags: string[];
}

const contentDir = path.join(process.cwd(), "content");

function read(file: string): ContentEntry[] {
	const target = path.join(contentDir, file);
	if (!fs.existsSync(target)) {
		throw new Error(`content/${file} is missing — run \`pnpm ingest\` before building.`);
	}
	return JSON.parse(fs.readFileSync(target, "utf8")) as ContentEntry[];
}

export function pages(): ContentEntry[] {
	return read("pages.json");
}

export function posts(): ContentEntry[] {
	return read("posts.json").sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/** `/blog/foo/` → `blog/foo`, the shape Astro's `[...slug]` param wants. */
export function routeToParam(route: string): string {
	return route.replace(/^\/+|\/+$/g, "");
}
