import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Redirects come from the generated map, read with a guarded `fs` call rather
 * than a static import: `content/` is a build artifact, so importing it would
 * break a fresh clone before the first ingest.
 */
function generatedRedirects() {
	const file = path.join(root, "content", "redirects.json");
	if (!fs.existsSync(file)) return {};
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

export default defineConfig({
	site: "https://harborline.example.com",
	trailingSlash: "always",
	build: { format: "directory" },
	redirects: generatedRedirects(),
});
