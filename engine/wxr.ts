/**
 * WXR (WordPress eXtended RSS) ingestion.
 *
 * Input is the file WordPress writes from Tools → Export. Output is a
 * normalized `IngestResult` plus the URL manifest that the parity verifier
 * later checks the built site against.
 *
 * Only `publish` entries produce URLs. Drafts, private pages, revisions and
 * attachments never entered the public URL space, so they must not enter the
 * manifest either — a verifier that demands a URL WordPress never served is as
 * broken as one that misses a URL it did.
 */

import { XMLParser } from "fast-xml-parser";
import { pagePath, toPath } from "./paths";
import type { Attachment, Author, IngestResult, Seo, Term, UrlEntry, WpEntry } from "./types";

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	trimValues: true,
	// Slugs like `2024` and post ids must survive as strings/numbers predictably.
	parseTagValue: false,
	cdataPropName: "__cdata",
	isArray: (name) => ["item", "wp:postmeta", "category", "wp:author"].includes(name),
});

type XmlNode = unknown;

function text(node: XmlNode): string {
	if (node === null || node === undefined) return "";
	if (typeof node === "string") return node;
	if (typeof node === "number" || typeof node === "boolean") return String(node);
	if (Array.isArray(node)) return text(node[0]);
	const record = node as Record<string, unknown>;
	if ("__cdata" in record) return text(record.__cdata);
	if ("#text" in record) return text(record["#text"]);
	return "";
}

function asArray<T>(value: T | T[] | undefined): T[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

function postmeta(item: Record<string, unknown>): Map<string, string> {
	const map = new Map<string, string>();
	for (const meta of asArray(item["wp:postmeta"] as Record<string, unknown>[])) {
		const key = text(meta["wp:meta_key"]);
		if (key) map.set(key, text(meta["wp:meta_value"]));
	}
	return map;
}

function parseAuthors(channel: Record<string, unknown>): Map<string, Author> {
	const byLogin = new Map<string, Author>();
	for (const author of asArray(channel["wp:author"] as Record<string, unknown>[])) {
		const login = text(author["wp:author_login"]);
		if (!login) continue;
		byLogin.set(login, { login, name: text(author["wp:author_display_name"]) || login });
	}
	return byLogin;
}

function parseAttachments(items: Record<string, unknown>[]): Map<number, Attachment> {
	const byId = new Map<number, Attachment>();
	for (const item of items) {
		if (text(item["wp:post_type"]) !== "attachment") continue;
		const id = Number(text(item["wp:post_id"]));
		if (!id) continue;
		const meta = postmeta(item);
		byId.set(id, {
			id,
			title: text(item.title),
			url: text(item["wp:attachment_url"]) || text(item.link),
			alt: meta.get("_wp_attachment_image_alt") ?? "",
			mimeType: meta.get("_wp_attachment_mime") ?? null,
		});
	}
	return byId;
}

/** Yoast is the most common SEO plugin; its postmeta is the only one read. */
function parseSeo(meta: Map<string, string>): Seo {
	return {
		title: meta.get("_yoast_wpseo_title") || null,
		description: meta.get("_yoast_wpseo_metadesc") || null,
		canonical: meta.get("_yoast_wpseo_canonical") || null,
	};
}

function parseTerms(item: Record<string, unknown>): { categories: Term[]; tags: Term[] } {
	const categories: Term[] = [];
	const tags: Term[] = [];
	for (const raw of asArray(item.category as Record<string, unknown>[])) {
		const term: Term = { slug: String(raw["@_nicename"] ?? ""), name: text(raw) };
		if (!term.slug) continue;
		if (raw["@_domain"] === "post_tag") tags.push(term);
		else categories.push(term);
	}
	return { categories, tags };
}

function mapEntry(
	item: Record<string, unknown>,
	type: "page" | "post",
	authors: Map<string, Author>,
	attachments: Map<number, Attachment>,
): WpEntry {
	const meta = postmeta(item);
	const thumbnailId = Number(meta.get("_thumbnail_id") ?? 0);
	const { categories, tags } = parseTerms(item);
	return {
		id: Number(text(item["wp:post_id"])),
		type,
		slug: text(item["wp:post_name"]),
		title: text(item.title),
		html: text(item["content:encoded"]),
		excerpt: text(item["excerpt:encoded"]),
		date: text(item["wp:post_date"]) || null,
		modified: text(item["wp:post_modified"]) || null,
		parent: Number(text(item["wp:post_parent"])) || 0,
		author: authors.get(text(item["dc:creator"])) ?? null,
		seo: parseSeo(meta),
		featuredMedia: attachments.get(thumbnailId) ?? null,
		categories,
		tags,
	};
}

export interface ManifestOptions {
	frontPageSlug?: string | null;
	postRoutePrefix?: string;
}

/**
 * The URL manifest: one row per URL WordPress served, and where the Astro site
 * serves it now.
 *
 * Pages own their origin path. When a post's flat `/{slug}/` collides with a
 * page (WordPress can only serve one of them), the page wins and the post is
 * marked `shadowedBy` — it keeps its `/blog/{slug}/` target but claims no
 * origin URL, so no redirect is generated that would bury a live page.
 */
export function buildUrlManifest(
	pages: WpEntry[],
	posts: WpEntry[],
	options: ManifestOptions = {},
): UrlEntry[] {
	const { frontPageSlug = null, postRoutePrefix = "/blog" } = options;
	const prefix = `/${String(postRoutePrefix).replace(/^\/+|\/+$/g, "")}`;
	const byId = new Map(pages.map((page) => [page.id, page]));

	const entries: UrlEntry[] = pages.map((page) => {
		const isFront = frontPageSlug !== null && page.slug === frontPageSlug && page.parent === 0;
		const path = isFront ? "/" : toPath(pagePath(page, byId));
		return { origin: path, target: path, type: "page", id: page.id, title: page.title };
	});

	const claimed = new Map(entries.map((entry) => [entry.origin, entry.id]));

	for (const post of posts) {
		const origin = toPath(post.slug);
		const target = `${prefix}${toPath(post.slug)}`;
		const owner = claimed.get(origin);
		entries.push({
			origin,
			target,
			type: "post",
			id: post.id,
			title: post.title,
			...(owner === undefined ? {} : { shadowedBy: owner }),
		});
		if (owner === undefined) claimed.set(origin, post.id);
	}

	return entries;
}

export function parseWxr(xml: string, options: ManifestOptions = {}): IngestResult {
	const doc = parser.parse(xml) as Record<string, Record<string, unknown>>;
	const channel = (doc?.rss?.channel ?? doc?.channel) as Record<string, unknown> | undefined;
	if (!channel) throw new Error("Invalid WXR: no <rss><channel> root found.");

	const items = asArray(channel.item as Record<string, unknown>[]);
	const authors = parseAuthors(channel);
	const attachments = parseAttachments(items);

	const pages: WpEntry[] = [];
	const posts: WpEntry[] = [];
	const skipped: IngestResult["skipped"] = [];

	for (const item of items) {
		const type = text(item["wp:post_type"]);
		const status = text(item["wp:status"]);
		if (type !== "page" && type !== "post") continue;
		if (status !== "publish") {
			skipped.push({
				id: Number(text(item["wp:post_id"])),
				slug: text(item["wp:post_name"]),
				status,
				type,
			});
			continue;
		}
		const entry = mapEntry(item, type, authors, attachments);
		if (type === "page") pages.push(entry);
		else posts.push(entry);
	}

	return {
		site: {
			title: text(channel.title),
			origin: text(channel["wp:base_site_url"]) || text(channel.link),
		},
		pages,
		posts,
		attachments: [...attachments.values()],
		urls: buildUrlManifest(pages, posts, options),
		skipped,
	};
}
