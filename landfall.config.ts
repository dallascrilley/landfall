import type { LandfallConfig } from "./engine/config";

/**
 * The one file you edit to point Landfall at a different WordPress export.
 *
 * Out of the box it targets the synthetic Harborline fixture in `fixtures/`,
 * so `pnpm migrate && pnpm verify` works in a fresh clone with no real site.
 */
export const config: LandfallConfig = {
	/** Path to the WXR file produced by WordPress → Tools → Export. */
	export: "fixtures/harborline.wxr.xml",

	site: {
		title: "Harborline Coffee Roasters",
		/** Origin the WordPress site served from. Used to rewrite absolute links. */
		wpOrigin: "https://harborline.example.com",
		/** Origin the Astro site will be deployed to. */
		siteUrl: "https://harborline.example.com",
	},

	/**
	 * Page slug WordPress served as the static front page. Its origin URL is `/`,
	 * not `/home/`. Leave `null` if the front page was the blog index.
	 */
	frontPageSlug: "home",

	/** Astro route prefix for posts. WordPress served them flat at `/{slug}/`. */
	postRoutePrefix: "/blog",

	redirects: {
		/** Serializers to emit. `netlify` also covers Cloudflare Pages. */
		targets: ["netlify", "astro"],
		/** Hand-written rules. An override always beats a generated rule. */
		overrides: {
			"/shop/": "/wholesale/",
		},
	},

	parity: {
		/**
		 * Origin paths that are intentionally not migrated. Every entry needs a
		 * reason: this list is the only way a URL can be missing and still pass,
		 * so it is the first place a reviewer looks.
		 */
		ignore: [],
	},
};

export default config;
