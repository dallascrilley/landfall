import { describe, expect, it } from "vitest";
import {
	buildRedirects,
	parseNetlify,
	sameRedirectModel,
	toAstro,
	toNetlify,
	toVercel,
} from "../engine/redirects";
import type { UrlEntry } from "../engine/types";

const url = (partial: Partial<UrlEntry> & Pick<UrlEntry, "origin" | "target">): UrlEntry => ({
	type: "post",
	id: 1,
	title: "Entry",
	...partial,
});

describe("redirect model", () => {
	it("generates a rule wherever the origin URL differs from the built route", () => {
		const model = buildRedirects({
			urls: [url({ origin: "/hello/", target: "/blog/hello/" })],
		});
		expect(model).toContainEqual({ from: "/hello/", to: "/blog/hello/", status: 301 });
	});

	it("generates nothing for a URL that did not move", () => {
		const model = buildRedirects({
			urls: [url({ origin: "/about/", target: "/about/", type: "page" })],
		});
		expect(model.some((rule) => rule.from === "/about/")).toBe(false);
	});

	it("never emits a rule that would shadow a live page", () => {
		const model = buildRedirects({
			urls: [
				url({ origin: "/wholesale/", target: "/wholesale/", type: "page", id: 13 }),
				url({ origin: "/wholesale/", target: "/blog/wholesale/", id: 32, shadowedBy: 13 }),
			],
		});
		expect(model.some((rule) => rule.from === "/wholesale/")).toBe(false);
	});

	it("drops the wp-admin rule if a real page lives there", () => {
		const withAdmin = buildRedirects({ urls: [] });
		expect(withAdmin.some((rule) => rule.from === "/wp-admin/*")).toBe(true);

		const collides = buildRedirects({
			urls: [url({ origin: "/wp-admin/*", target: "/wp-admin/*", type: "page" })],
		});
		expect(collides.some((rule) => rule.from === "/wp-admin/*")).toBe(false);
	});

	it("lets an override beat a generated rule", () => {
		const model = buildRedirects({
			urls: [url({ origin: "/hello/", target: "/blog/hello/" })],
			overrides: { "/hello/": "/somewhere-else/" },
		});
		const rule = model.find((entry) => entry.from === "/hello/");
		expect(rule?.to).toBe("/somewhere-else/");
		expect(model.filter((entry) => entry.from === "/hello/")).toHaveLength(1);
	});
});

describe("serializers", () => {
	const model = [{ from: "/hello/", to: "/blog/hello/", status: 301 }];

	it("writes Netlify/Cloudflare rows", () => {
		expect(toNetlify(model)).toBe("/hello/  /blog/hello/  301");
	});

	it("cannot be tricked into injecting extra rows via a newline in config", () => {
		const text = toNetlify([{ from: "/a/\n/b/  /evil/  301", to: "/x/", status: 301 }]);
		expect(text.split("\n")).toHaveLength(1);
	});

	it("writes Vercel rules", () => {
		expect(toVercel(model).redirects[0]).toEqual({
			source: "/hello/",
			destination: "/blog/hello/",
			permanent: true,
		});
	});

	it("omits wildcards from the Astro map, which has no glob syntax", () => {
		const map = toAstro([...model, { from: "/wp-admin/*", to: "/", status: 301 }]);
		expect(map["/hello/"]).toEqual({ status: 301, destination: "/blog/hello/" });
		expect(map["/wp-admin/*"]).toBeUndefined();
	});

	it("round-trips Netlify text so verify can detect a hand-edited host file", () => {
		const full = buildRedirects({
			urls: [url({ origin: "/hello/", target: "/blog/hello/" })],
		});
		const text = toNetlify(full);
		expect(sameRedirectModel(full, parseNetlify(text))).toBe(true);
		expect(sameRedirectModel(full, parseNetlify(`${text}\n/evil/  /x/  301`))).toBe(false);
	});
});
