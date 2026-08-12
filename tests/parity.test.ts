import { describe, expect, it } from "vitest";
import type { BuiltRoute } from "../engine/parity";
import { verifyParity } from "../engine/parity";
import type { Redirect } from "../engine/redirects";
import type { UrlEntry } from "../engine/types";

const url = (partial: Partial<UrlEntry> & Pick<UrlEntry, "origin" | "target">): UrlEntry => ({
	type: "page",
	id: 1,
	title: "Entry",
	...partial,
});

const built = (...routes: string[]): Map<string, BuiltRoute> =>
	new Map(routes.map((route) => [route, { isStub: false }]));

const run = (urls: UrlEntry[], routes: Map<string, BuiltRoute>, rules: Redirect[] = []) =>
	verifyParity({ urls, rules, routes });

describe("URL parity verifier", () => {
	it("passes a URL whose route was built", () => {
		const report = run([url({ origin: "/about/", target: "/about/" })], built("/about/"));
		expect(report.ok).toBe(true);
		expect(report.results[0]?.status).toBe("direct");
	});

	it("fails a URL with no route and no rule", () => {
		const report = run([url({ origin: "/about/", target: "/about/" })], built("/"));
		expect(report.ok).toBe(false);
		expect(report.failures[0]).toMatchObject({ origin: "/about/", status: "missing" });
	});

	it("passes a URL rescued by a redirect to a route that was built", () => {
		const report = run(
			[url({ origin: "/hello/", target: "/blog/hello/" })],
			built("/blog/hello/"),
			[{ from: "/hello/", to: "/blog/hello/", status: 301 }],
		);
		expect(report.ok).toBe(true);
		expect(report.results[0]).toMatchObject({ status: "redirected", resolved: "/blog/hello/" });
	});

	it("fails a redirect pointing at a route that was never built", () => {
		const report = run([url({ origin: "/hello/", target: "/blog/hello/" })], built("/"), [
			{ from: "/hello/", to: "/blog/hello/", status: 301 },
		]);
		expect(report.failures[0]?.status).toBe("dangling");
	});

	it("fails a redirect chain — one hop or it does not count", () => {
		const report = run([url({ origin: "/a/", target: "/c/" })], built("/c/"), [
			{ from: "/a/", to: "/b/", status: 301 },
			{ from: "/b/", to: "/c/", status: 301 },
		]);
		expect(report.failures[0]?.status).toBe("chain");
	});

	it("fails a redirect loop", () => {
		const report = run([url({ origin: "/a/", target: "/b/" })], built("/"), [
			{ from: "/a/", to: "/b/", status: 301 },
			{ from: "/b/", to: "/a/", status: 301 },
		]);
		expect(report.failures[0]?.status).toBe("loop");
	});

	it("fails a self-redirect", () => {
		const report = run([url({ origin: "/a/", target: "/a/" })], built("/"), [
			{ from: "/a/", to: "/a/", status: 301 },
		]);
		expect(report.failures[0]?.status).toBe("self");
	});

	it("does not accept a redirect stub as a landing page", () => {
		const routes = new Map<string, BuiltRoute>([["/about/", { isStub: true }]]);
		const report = run([url({ origin: "/about/", target: "/about/" })], routes);
		expect(report.failures[0]?.status).toBe("missing");
	});

	it("does not accept a redirect into a stub", () => {
		const routes = new Map<string, BuiltRoute>([["/b/", { isStub: true }]]);
		const report = run([url({ origin: "/a/", target: "/b/" })], routes, [
			{ from: "/a/", to: "/b/", status: 301 },
		]);
		expect(report.failures[0]?.status).toBe("chain");
	});

	it("treats /about and /about/ as the same route", () => {
		const routes = new Map<string, BuiltRoute>([["/about/", { isStub: false }]]);
		const report = run([url({ origin: "/about", target: "/about" })], routes);
		expect(report.ok).toBe(true);
	});

	it("resolves wildcard rules by longest matching prefix", () => {
		const report = run([url({ origin: "/wp-admin/edit.php", target: "/" })], built("/"), [
			{ from: "/wp-admin/*", to: "/", status: 301 },
		]);
		expect(report.results[0]?.status).toBe("redirected");
	});

	it("passes a shadowed entry only when its own route was built", () => {
		const shadowed = url({
			origin: "/wholesale/",
			target: "/blog/wholesale/",
			type: "post",
			id: 32,
			shadowedBy: 13,
		});
		expect(run([shadowed], built("/blog/wholesale/")).results[0]?.status).toBe("shadowed");
		expect(run([shadowed], built("/")).failures[0]?.status).toBe("missing");
	});

	it("honours the ignore list, and counts it separately from a pass", () => {
		const report = verifyParity({
			urls: [url({ origin: "/legacy/", target: "/legacy/" })],
			rules: [],
			routes: built("/"),
			ignore: ["/legacy/"],
		});
		expect(report.ok).toBe(true);
		expect(report.totals.ignored).toBe(1);
		expect(report.totals.direct).toBe(0);
	});

	it("lists built routes no WordPress URL claims", () => {
		const report = run([url({ origin: "/", target: "/" })], built("/", "/blog/", "/404.html"));
		expect(report.newRoutes).toEqual(["/404.html", "/blog/"]);
	});

	it("counts origin URLs from the export, so a dropped page cannot vanish", () => {
		const report = run(
			[url({ origin: "/", target: "/" }), url({ origin: "/gone/", target: "/gone/", id: 2 })],
			built("/"),
		);
		expect(report.totals.originUrls).toBe(2);
		expect(report.totals.failed).toBe(1);
	});
});
