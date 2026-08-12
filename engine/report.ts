/** Human-readable rendering of a parity report. */

import type { ParityReport, ParityResult } from "./parity";

const LABEL: Record<ParityResult["status"], string> = {
	direct: "built",
	redirected: "301",
	ignored: "ignored",
	shadowed: "shadowed",
	missing: "MISSING",
	dangling: "DANGLING",
	chain: "CHAIN",
	loop: "LOOP",
	self: "SELF",
};

function pad(value: string, width: number): string {
	return value.length >= width ? value : value + " ".repeat(width - value.length);
}

export function formatReport(report: ParityReport, options: { verbose?: boolean } = {}): string {
	const { totals } = report;
	const rows = options.verbose ? report.results : report.failures;
	const lines: string[] = [];

	lines.push("URL parity report");
	lines.push("=================");
	lines.push("");
	lines.push(`  origin URLs from export : ${totals.originUrls}`);
	lines.push(`  routes built            : ${totals.routesBuilt}`);
	lines.push("");
	lines.push(`  served directly         : ${totals.direct}`);
	lines.push(`  served via redirect     : ${totals.redirected}`);
	lines.push(`  shadowed (moved)        : ${totals.shadowed}`);
	lines.push(`  ignored by config       : ${totals.ignored}`);
	lines.push(`  unreachable             : ${totals.failed}`);

	if (rows.length > 0) {
		const width = Math.max(...rows.map((row) => row.origin.length), 12);
		lines.push("");
		lines.push(options.verbose ? "  Every origin URL:" : "  Unreachable URLs:");
		for (const row of rows) {
			lines.push(`    ${pad(row.origin, width)}  ${pad(LABEL[row.status], 9)}  ${row.detail}`);
		}
	}

	if (options.verbose && report.newRoutes.length > 0) {
		lines.push("");
		lines.push("  Built routes with no WordPress origin (new pages, archives, 404):");
		for (const route of report.newRoutes) lines.push(`    ${route}`);
	}

	lines.push("");
	lines.push(
		report.ok
			? `PASS — all ${totals.originUrls} WordPress URLs arrive.`
			: `FAIL — ${totals.failed} of ${totals.originUrls} WordPress URLs do not arrive.`,
	);
	return lines.join("\n");
}
