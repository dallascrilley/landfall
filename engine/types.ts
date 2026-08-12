/** Shared shapes for the migration engine. */

export interface Author {
	login: string;
	name: string;
}

export interface Attachment {
	id: number;
	title: string;
	url: string;
	alt: string;
	mimeType: string | null;
}

export interface Seo {
	title: string | null;
	description: string | null;
	canonical: string | null;
}

export interface Term {
	slug: string;
	name: string;
}

/** A published WordPress page or post, normalized. */
export interface WpEntry {
	id: number;
	type: "page" | "post";
	slug: string;
	title: string;
	html: string;
	excerpt: string;
	date: string | null;
	modified: string | null;
	parent: number;
	author: Author | null;
	seo: Seo;
	featuredMedia: Attachment | null;
	categories: Term[];
	tags: Term[];
}

/**
 * One row of the URL manifest: the URL WordPress served, and where the Astro
 * build is expected to serve it (directly, or via a redirect).
 */
export interface UrlEntry {
	/** Site-relative origin path with a trailing slash, e.g. `/about/our-roastery/`. */
	origin: string;
	/** Where the built site serves this content, e.g. `/blog/dialing-in-four-cups/`. */
	target: string;
	type: "page" | "post";
	id: number;
	title: string;
	/**
	 * Set when another entry owns `origin` (WordPress permalink collision).
	 * A shadowed entry keeps its own `target` but claims no origin URL.
	 */
	shadowedBy?: number;
}

export interface IngestResult {
	site: { title: string; origin: string };
	pages: WpEntry[];
	posts: WpEntry[];
	attachments: Attachment[];
	urls: UrlEntry[];
	skipped: { id: number; slug: string; status: string; type: string }[];
}
