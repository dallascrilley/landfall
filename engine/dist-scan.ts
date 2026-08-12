/**
 * Filesystem adapter for the parity verifier: turn a built `dist/` tree into
 * the route map `verifyParity` consumes. The only part of the verifier that
 * touches disk.
 */

import fs from "node:fs";
import path from "node:path";
import type { BuiltRoute } from "./parity";
import { normalize } from "./paths";

export function walkHtmlFiles(dir: string, files: string[] = []): string[] {
	if (!fs.existsSync(dir)) return files;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walkHtmlFiles(full, files);
		else if (entry.name.endsWith(".html")) files.push(full);
	}
	return files;
}

/** `dist/about/index.html` → `/about/`; `dist/404.html` → `/404.html`. */
export function distPathToUrlPath(distDir: string, filePath: string): string {
	const rel = path.relative(distDir, filePath).split(path.sep).join("/");
	if (rel === "index.html") return "/";
	if (!rel.endsWith("/index.html")) return `/${rel}`;
	return `/${rel.slice(0, -"index.html".length)}`;
}

/** A page whose only job is to bounce the browser somewhere else. */
export function isRedirectStub(html: string): boolean {
	return /<meta\s+http-equiv=["']refresh["']/i.test(html);
}

export function scanDist(distDir: string): Map<string, BuiltRoute> {
	const routes = new Map<string, BuiltRoute>();
	for (const filePath of walkHtmlFiles(distDir)) {
		const html = fs.readFileSync(filePath, "utf8");
		routes.set(normalize(distPathToUrlPath(distDir, filePath)), {
			isStub: isRedirectStub(html),
		});
	}
	return routes;
}
