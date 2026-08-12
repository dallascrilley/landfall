#!/usr/bin/env tsx
/**
 * The deliberate-failure proof.
 *
 * A verifier that only ever prints PASS proves nothing — it could be counting
 * to zero. This script takes the real build, copies it, deletes one page from
 * the copy, and requires the verifier to fail and to name that exact URL.
 *
 * It is wired into `pnpm check` and CI, so the day the verifier stops
 * detecting a dropped page, the build goes red.
 *
 *   pnpm build && pnpm prove:missing
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ParityReport } from "../engine/parity";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(repoRoot, "dist");

/** The page we delete. Nested, so it also proves parent paths are preserved. */
const VICTIM_ROUTE = "/about/our-roastery/";

function fail(message: string): never {
	console.error(`prove:missing FAILED — ${message}`);
	process.exit(1);
}

if (!fs.existsSync(dist)) fail("no dist/ found. Run `pnpm build` first.");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "landfall-proof-"));
const brokenDist = path.join(workDir, "dist");
const reportPath = path.join(workDir, "url-parity.json");

try {
	fs.cpSync(dist, brokenDist, { recursive: true });

	const victim = path.join(brokenDist, VICTIM_ROUTE.replace(/^\/|\/$/g, ""), "index.html");
	if (!fs.existsSync(victim)) fail(`${VICTIM_ROUTE} was not in the build — nothing to remove.`);
	fs.rmSync(path.dirname(victim), { recursive: true });
	console.log(`Removed ${VICTIM_ROUTE} from a copy of the build.`);

	const run = spawnSync(
		"node",
		[
			"--import",
			"tsx",
			path.join(repoRoot, "engine", "cli.ts"),
			"verify",
			"--dist",
			brokenDist,
			"--json",
			reportPath,
		],
		{ cwd: repoRoot, encoding: "utf8" },
	);

	console.log(run.stdout?.trim() ?? "");

	if (run.status === 0) fail("the verifier passed a build with a page removed.");

	const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as ParityReport;
	const hit = report.failures.find((failure) => failure.origin === VICTIM_ROUTE);
	if (!hit) {
		fail(`the verifier failed, but did not name ${VICTIM_ROUTE}. That is the wrong failure.`);
	}
	if (report.failures.length !== 1) {
		fail(
			`expected exactly one failure, got ${report.failures.length}: ` +
				report.failures.map((failure) => failure.origin).join(", "),
		);
	}

	console.log("");
	console.log(`prove:missing PASSED — exit ${run.status}, one failure, reported as:`);
	console.log(`  ${hit.origin}  ${hit.status}  ${hit.detail}`);
} finally {
	fs.rmSync(workDir, { recursive: true, force: true });
}
