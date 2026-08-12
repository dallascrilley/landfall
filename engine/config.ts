export type RedirectTarget = "netlify" | "vercel" | "astro";

export interface LandfallConfig {
	export: string;
	site: {
		title: string;
		wpOrigin: string;
		siteUrl: string;
	};
	frontPageSlug: string | null;
	postRoutePrefix: string;
	redirects: {
		targets: RedirectTarget[];
		overrides: Record<string, string>;
	};
	parity: {
		ignore: string[];
	};
}

/** Where generated artifacts land, relative to the repo root. */
export const paths = {
	content: "content",
	pages: "content/pages.json",
	posts: "content/posts.json",
	urls: "content/urls.json",
	redirectsJson: "content/redirects.json",
	publicRedirects: "public/_redirects",
	vercelJson: "vercel.json",
	report: "reports/url-parity.json",
	dist: "dist",
} as const;
