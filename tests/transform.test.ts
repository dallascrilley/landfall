import { describe, expect, it } from "vitest";
import { transformHtml } from "../engine/transform";

const wpOrigin = "https://harborline.example.com";

describe("content transformation", () => {
	it("removes scripts and styles that need a WordPress runtime", () => {
		const result = transformHtml(
			`<p>Body</p><script src="${wpOrigin}/wp-includes/js/wp-emoji-release.min.js"></script><style>.x{}</style>`,
			{ wpOrigin },
		);
		expect(result.html).toBe("<p>Body</p>");
		expect(result.removed.scripts).toBe(1);
		expect(result.removed.styles).toBe(1);
	});

	it("strips page-builder wrapper classes but keeps the content", () => {
		const result = transformHtml(
			'<div class="elementor elementor-8 intro" data-elementor-type="wp-page"><p>Kept</p></div>',
			{ wpOrigin },
		);
		expect(result.html).toBe('<div class="intro"><p>Kept</p></div>');
		expect(result.removed.builderWrappers).toBe(1);
	});

	it("drops the class attribute when nothing survives", () => {
		const result = transformHtml('<div class="vc_row wpb_wrapper"><p>Kept</p></div>', { wpOrigin });
		expect(result.html).toBe("<div><p>Kept</p></div>");
	});

	it("rewrites absolute origin links to site-relative", () => {
		const result = transformHtml(`<a href="${wpOrigin}/wholesale/">Wholesale</a>`, { wpOrigin });
		expect(result.html).toBe('<a href="/wholesale/">Wholesale</a>');
		expect(result.rewritten).toBe(1);
	});

	it("leaves uploads absolute and reports them, rather than breaking the image", () => {
		const src = `${wpOrigin}/wp-content/uploads/2024/03/quay.jpg`;
		const result = transformHtml(`<img src="${src}" alt="Quay" />`, { wpOrigin });
		expect(result.html).toContain(src);
		expect(result.rewritten).toBe(0);
		expect(result.remainingOriginRefs).toEqual([src]);
	});

	it("applies configured path rewrites", () => {
		const result = transformHtml('<a href="/shop/">Shop</a>', {
			wpOrigin,
			rewrites: { "/shop/": "/wholesale/" },
		});
		expect(result.html).toBe('<a href="/wholesale/">Shop</a>');
	});

	it("leaves other origins alone", () => {
		const result = transformHtml('<a href="https://example.org/x/">Out</a>', { wpOrigin });
		expect(result.html).toBe('<a href="https://example.org/x/">Out</a>');
	});
});
