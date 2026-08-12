#!/usr/bin/env tsx
/**
 * Landfall CLI.
 *
 *   tsx engine/cli.ts ingest              WXR export → content/*.json
 *   tsx engine/cli.ts redirects           URL manifest → host redirect files
 *   tsx engine/cli.ts verify [--dist d]   built site → reports/url-parity.json
 *
 * `verify` exits 1 when any WordPress URL does not arrive. That exit code is
 * the whole point: it is what makes the parity claim enforceable in CI rather
 * than a number in a report nobody reads.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../landfall.config";
import { paths } from "./config";
import { scanDist } from "./dist-scan";
import { verifyParity } from "./parity";
import { buildRedirects, toAstro, toNetlify, toVercel } from "./redirects";
import { formatReport } from "./report";
import { transformHtml } from "./transform";
import type { UrlEntry, WpEntry } from "./types";
import { parseWxr } from "./wxr";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Repo-relative by default; an absolute `--json`/`--dist` path is honoured. */
const resolveRoot = (target: string) => path.resolve(repoRoot, target);

function writeJson(relative: string, value: unknown): void {
	const target = resolveRoot(relative);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson<T>(relative: string): T {
	const target = resolveRoot(relative);
	if (!fs.existsSync(target)) {
		throw new Error(`${relative} is missing — run \`pnpm ingest\` first.`);
	}
	return JSON.parse(fs.readFileSync(target, "utf8")) as T;
}

function flag(argv: string[], name: string): string | null {
	const index = argv.indexOf(`--${name}`);
	return index >= 0 ? (argv[index + 1] ?? null) : null;
}

/** Content entry as written to `content/*.json` and read by the Astro routes. */
interface OutputEntry {
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

function toOutput(entry: WpEntry, route: string): OutputEntry {
	const { html } = transformHtml(entry.html, {
		wpOrigin: config.site.wpOrigin,
		postRoutePrefix: config.postRoutePrefix,
	});
	return {
		id: entry.id,
		slug: entry.slug,
		route,
		title: entry.title,
		html,
		excerpt: entry.excerpt,
		date: entry.date,
		author: entry.author?.name ?? null,
		seo: { title: entry.seo.title, description: entry.seo.description },
		image: entry.featuredMedia
			? { url: entry.featuredMedia.url, alt: entry.featuredMedia.alt }
			: null,
		categories: entry.categories.map((term) => term.name),
		tags: entry.tags.map((term) => term.name),
	};
}

function ingest(): void {
	const exportPath = resolveRoot(config.export);
	if (!fs.existsSync(exportPath)) {
		throw new Error(`WordPress export not found at ${config.export}`);
	}
	const result = parseWxr(fs.readFileSync(exportPath, "utf8"), {
		frontPageSlug: config.frontPageSlug,
		postRoutePrefix: config.postRoutePrefix,
	});

	const routeById = new Map(result.urls.map((entry) => [entry.id, entry.target]));
	const pages = result.pages.map((page) => toOutput(page, routeById.get(page.id) ?? "/"));
	const posts = result.posts.map((post) => toOutput(post, routeById.get(post.id) ?? "/"));

	writeJson(paths.pages, pages);
	writeJson(paths.posts, posts);
	writeJson(paths.urls, result.urls);

	const shadowed = result.urls.filter((entry) => entry.shadowedBy !== undefined).length;
	console.log(
		`Ingested ${pages.length} page(s), ${posts.length} post(s), ` +
			`${result.attachments.length} attachment(s) from ${config.export}.`,
	);
	console.log(
		`URL manifest: ${result.urls.length} entries ` +
			`(${shadowed} shadowed, ${result.skipped.length} unpublished entries skipped).`,
	);
}

function redirects(): void {
	const urls = readJson<UrlEntry[]>(paths.urls);
	const model = buildRedirects({ urls, overrides: config.redirects.overrides });
	const written: string[] = [];

	for (const target of config.redirects.targets) {
		switch (target) {
			case "netlify": {
				const out = resolveRoot(paths.publicRedirects);
				fs.mkdirSync(path.dirname(out), { recursive: true });
				fs.writeFileSync(out, `${toNetlify(model)}\n`);
				written.push(paths.publicRedirects);
				break;
			}
			case "vercel":
				writeJson(paths.vercelJson, toVercel(model));
				written.push(paths.vercelJson);
				break;
			case "astro":
				writeJson(paths.redirectsJson, toAstro(model));
				written.push(paths.redirectsJson);
				break;
			default:
				console.warn(`Unknown redirect target: ${target}`);
		}
	}

	console.log(`Generated ${model.length} redirect rule(s):`);
	for (const file of written) console.log(`  -> ${file}`);
}

function verify(argv: string[]): number {
	const distDir = path.resolve(repoRoot, flag(argv, "dist") ?? paths.dist);
	if (!fs.existsSync(distDir)) {
		console.error(`No build found at ${distDir} — run \`pnpm build\` first.`);
		return 1;
	}

	const urls = readJson<UrlEntry[]>(paths.urls);
	const rules = buildRedirects({ urls, overrides: config.redirects.overrides });
	const report = verifyParity({
		urls,
		rules,
		routes: scanDist(distDir),
		ignore: config.parity.ignore,
	});

	const reportPath = flag(argv, "json") ?? paths.report;
	writeJson(reportPath, report);
	console.log(formatReport(report, { verbose: argv.includes("--verbose") }));
	console.log(`\nReport written to ${reportPath}`);
	return report.ok ? 0 : 1;
}

function main(): number {
	const [command, ...argv] = process.argv.slice(2);
	switch (command) {
		case "ingest":
			ingest();
			return 0;
		case "redirects":
			redirects();
			return 0;
		case "verify":
			return verify(argv);
		default:
			console.error("Usage: tsx engine/cli.ts <ingest|redirects|verify> [options]");
			return 2;
	}
}

process.exit(main());
