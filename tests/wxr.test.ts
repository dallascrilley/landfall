import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildUrlManifest, parseWxr } from "../engine/wxr";

const fixture = fs.readFileSync(
	path.join(process.cwd(), "fixtures", "harborline.wxr.xml"),
	"utf8",
);
const result = parseWxr(fixture, { frontPageSlug: "home", postRoutePrefix: "/blog" });
const originOf = (slug: string) => result.urls.find((entry) => entry.origin === slug);

describe("WXR ingestion", () => {
	it("reads channel identity", () => {
		expect(result.site.title).toBe("Harborline Coffee Roasters");
		expect(result.site.origin).toBe("https://harborline.example.com");
	});

	it("keeps only published pages and posts", () => {
		expect(result.pages.map((page) => page.slug).sort()).toEqual([
			"about",
			"contact",
			"home",
			"our-roastery",
			"wholesale",
		]);
		expect(result.posts).toHaveLength(3);
		expect(result.skipped.map((entry) => entry.status).sort()).toEqual(["draft", "private"]);
	});

	it("does not treat attachments as content", () => {
		expect(result.attachments).toHaveLength(2);
		expect(result.pages.some((page) => page.slug === "quay-at-dawn")).toBe(false);
	});

	it("resolves authors, categories, tags and featured media", () => {
		const post = result.posts.find((entry) => entry.slug === "dialing-in-four-cups");
		expect(post?.author?.name).toBe("Tobias Ilg");
		expect(post?.categories.map((term) => term.slug)).toEqual(["brewing"]);
		expect(post?.tags.map((term) => term.slug)).toEqual(["filter", "method"]);

		const roastery = result.pages.find((entry) => entry.slug === "our-roastery");
		expect(roastery?.featuredMedia?.alt).toBe("A 12kg drum roaster mid-batch");
		expect(roastery?.featuredMedia?.url).toContain("/wp-content/uploads/");
	});

	it("reads Yoast SEO postmeta", () => {
		const home = result.pages.find((entry) => entry.slug === "home");
		expect(home?.seo.title).toBe("Harborline Coffee Roasters | North quay small-batch coffee");
		expect(home?.seo.description).toContain("eighteen hours");
	});
});

describe("URL manifest", () => {
	it("serves the configured front page at /", () => {
		expect(originOf("/")?.id).toBe(10);
	});

	it("preserves nested page paths from the parent chain", () => {
		expect(originOf("/about/our-roastery/")?.id).toBe(12);
		expect(result.urls.some((entry) => entry.origin === "/our-roastery/")).toBe(false);
	});

	it("moves posts under the post route prefix", () => {
		const post = originOf("/why-we-stopped-buying-spot/");
		expect(post?.target).toBe("/blog/why-we-stopped-buying-spot/");
	});

	it("gives a colliding origin URL to the page, not the post", () => {
		const wholesale = originOf("/wholesale/");
		expect(wholesale?.type).toBe("page");

		const shadowed = result.urls.find((entry) => entry.id === 32);
		expect(shadowed?.shadowedBy).toBe(13);
		expect(shadowed?.target).toBe("/blog/wholesale/");
	});

	it("emits no URL for unpublished entries", () => {
		expect(result.urls.some((entry) => entry.origin === "/staff-handbook/")).toBe(false);
		expect(result.urls.some((entry) => entry.origin === "/notes-new-cupping-table/")).toBe(false);
	});

	it("terminates on a corrupt export with a parent cycle", () => {
		const cyclic = [
			{ id: 1, slug: "a", parent: 2, type: "page" as const, title: "A" },
			{ id: 2, slug: "b", parent: 1, type: "page" as const, title: "B" },
		].map((node) => ({
			...node,
			html: "",
			excerpt: "",
			date: null,
			modified: null,
			author: null,
			seo: { title: null, description: null, canonical: null },
			featuredMedia: null,
			categories: [],
			tags: [],
		}));
		const urls = buildUrlManifest(cyclic, []);
		expect(urls.map((entry) => entry.origin).sort()).toEqual(["/b/a/", "/a/b/"].sort());
	});
});
