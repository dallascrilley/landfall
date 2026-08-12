import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { distPathToUrlPath, isRedirectStub, scanDist } from "../engine/dist-scan";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "landfall-dist-"));

function write(relative: string, html: string): void {
	const target = path.join(dir, relative);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, html);
}

write("index.html", "<html><body>Home</body></html>");
write("about/index.html", "<html><body>About</body></html>");
write("about/our-roastery/index.html", "<html><body>Roastery</body></html>");
write("404.html", "<html><body>Not found</body></html>");
write("hello/index.html", '<html><head><meta http-equiv="refresh" content="0;url=/blog/hello/">');
write("assets/app.css", "body{}");

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("dist scan", () => {
	it("maps built files to the URLs they are served at", () => {
		expect(distPathToUrlPath(dir, path.join(dir, "index.html"))).toBe("/");
		expect(distPathToUrlPath(dir, path.join(dir, "about", "index.html"))).toBe("/about/");
		expect(distPathToUrlPath(dir, path.join(dir, "about", "our-roastery", "index.html"))).toBe(
			"/about/our-roastery/",
		);
		expect(distPathToUrlPath(dir, path.join(dir, "404.html"))).toBe("/404.html");
	});

	it("recognizes a meta-refresh page as a stub, not a landing page", () => {
		expect(isRedirectStub('<meta http-equiv="refresh" content="0;url=/x/">')).toBe(true);
		expect(isRedirectStub("<p>real page</p>")).toBe(false);
	});

	it("collects every route and flags the stubs", () => {
		const routes = scanDist(dir);
		expect([...routes.keys()].sort()).toEqual([
			"/",
			"/404.html",
			"/about/",
			"/about/our-roastery/",
			"/hello/",
		]);
		expect(routes.get("/hello/")?.isStub).toBe(true);
		expect(routes.get("/about/")?.isStub).toBe(false);
	});

	it("returns nothing for a directory that was never built", () => {
		expect(scanDist(path.join(dir, "nope")).size).toBe(0);
	});
});
