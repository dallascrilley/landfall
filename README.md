# Landfall

**Migrates WordPress sites to Astro and proves every URL arrived.**

Moving a WordPress site to a static build is mostly mechanical. The part that
actually hurts is the long tail of URLs: the nested child page, the post whose
permalink collides with a page, the slug someone changed in 2019 and forgot.
Those pages do not announce themselves when they go missing. They quietly 404
until search traffic drops.

Landfall's answer is an enforceable claim. The URL manifest comes from the
WordPress export, not from the build, and the verifier fails the build when any
URL in that manifest cannot be reached on the built site — directly or through a
redirect that lands in one hop.

> **What this repository is.** The engine was extracted from production
> WordPress→Astro migrations. The site it migrates *here* is not one of them:
> `fixtures/harborline.wxr.xml` is a synthetic WordPress export written for this
> repository — an invented coffee roaster, invented authors, invented posts. No
> client content, and no client's URLs, are in this repo. Everything below was
> executed against that fixture on a clean clone.

---

## The proof

`pnpm verify` scans the built `dist/`, resolves every origin URL against the
built routes and the redirect rules that will actually be deployed, and writes
`reports/url-parity.json`. Verbatim output of `pnpm verify:verbose` (the same
run, plus a row per URL) on the bundled fixture:

```
URL parity report
=================

  origin URLs from export : 8
  routes built            : 13

  served directly         : 5
  served via redirect     : 2
  shadowed (moved)        : 1
  ignored by config       : 0
  unreachable             : 0

  Every origin URL:
    /                             built      route built
    /about/                       built      route built
    /about/our-roastery/          built      route built
    /wholesale/                   built      route built
    /contact/                     built      route built
    /why-we-stopped-buying-spot/  301        301 → /blog/why-we-stopped-buying-spot/
    /dialing-in-four-cups/        301        301 → /blog/dialing-in-four-cups/
    /wholesale/                   shadowed   origin claimed by #13; content served at /blog/wholesale/

  Built routes with no WordPress origin (new pages, archives, 404):
    /404.html
    /blog/
    /shop/

PASS — all 8 WordPress URLs arrive.

Report written to reports/url-parity.json
```

Three lines in there are the whole design:

- `/about/our-roastery/` is **built at its nested path**, not flattened to
  `/our-roastery/`. Slug preservation is walked from the WordPress parent chain.
- `/why-we-stopped-buying-spot/` was a flat WordPress permalink and is now under
  `/blog/`. It counts as arrived only because a 301 exists **and** its target is
  a page that was really built.
- `/wholesale/` appears twice. A page and a post shared that slug; WordPress can
  only serve one. The page keeps the URL, the post is marked `shadowed` and
  checked at its own route — and no redirect is generated that would have buried
  the live page.

### Proving the verifier can fail

A verifier that only ever prints PASS proves nothing; it might be counting to
zero. `pnpm prove:missing` copies the real build, deletes one page from the
copy, and requires the verifier to fail **and to name that page** (totals block
trimmed to the lines that changed — `routes built` also drops to 12):

```
Removed /about/our-roastery/ from a copy of the build.

  origin URLs from export : 8
  served directly         : 4
  unreachable             : 1

  Unreachable URLs:
    /about/our-roastery/  MISSING    no route built and no redirect rule matches

FAIL — 1 of 8 WordPress URLs do not arrive.

prove:missing PASSED — exit 1, one failure, reported as:
  /about/our-roastery/  missing  no route built and no redirect rule matches
```

Both commands run in CI. The build is green only when every URL arrives *and*
the verifier is still capable of noticing when one does not.

---

## Quickstart

Executed verbatim on a clean clone. Requires Node ≥ 22.12 and pnpm 11. Nothing
reaches the network past `pnpm install`; no WordPress site and no credentials
are involved.

```bash
pnpm install
pnpm build          # ingest the export → generate redirects → build the site
pnpm verify         # PASS — all 8 WordPress URLs arrive.
pnpm prove:missing  # delete a page from a copy of the build; expect a named failure
```

Point it at a different site by editing one file, `landfall.config.ts`:

```ts
export: "path/to/your-export.xml",   // WordPress → Tools → Export
site: { wpOrigin: "https://old-site.example", ... },
frontPageSlug: "home",               // the page WordPress served at "/"
postRoutePrefix: "/blog",            // where posts live now
redirects: { targets: ["netlify", "astro"], overrides: { "/shop/": "/wholesale/" } },
parity:    { ignore: [] },           // URLs you are deliberately not migrating
```

### Commands

| Command | What it does |
| --- | --- |
| `pnpm ingest` | WXR export → `content/{pages,posts,urls}.json` |
| `pnpm redirects` | URL manifest → `public/_redirects`, `content/redirects.json` |
| `pnpm build` | ingest + redirects + `astro build` |
| `pnpm verify` | parity check against `dist/`; exit 1 on any unreachable URL |
| `pnpm verify:verbose` | same, plus a row per URL and the unclaimed built routes |
| `pnpm prove:missing` | deliberate-failure proof |
| `pnpm test` | 46 unit tests over ingestion, transform, redirects, parity |
| `pnpm check` | everything above, in the order CI runs it |

---

## How it works

```
fixtures/*.wxr.xml ──▶ engine/wxr.ts ──▶ content/pages.json
   WordPress export         parse         content/posts.json
                            ▼             content/urls.json  ◀── the claim
                     engine/transform.ts
                            │
                            ▼
                     engine/redirects.ts ──▶ public/_redirects
                            │                content/redirects.json
                            ▼
                        astro build ──▶ dist/
                            │
                            ▼
   content/urls.json ─▶ engine/parity.ts ◀─ engine/dist-scan.ts
                            │
                            ▼
                    reports/url-parity.json + exit code
```

| Module | Responsibility |
| --- | --- |
| `engine/wxr.ts` | Parse the WXR export: pages, posts, authors, attachments, categories, tags, Yoast SEO postmeta. Build the URL manifest. |
| `engine/paths.ts` | Path normalization and the parent-chain walk that preserves nested page slugs. |
| `engine/transform.ts` | Strip what needs a WordPress runtime (scripts, styles, page-builder wrappers), rewrite absolute origin links to site-relative. |
| `engine/redirects.ts` | Pure redirect model plus Netlify/Cloudflare, Vercel and Astro serializers. |
| `engine/dist-scan.ts` | Turn a built `dist/` into a route map, flagging meta-refresh stubs. |
| `engine/parity.ts` | The verifier. Pure: manifest + rules + routes → report. |

### What makes the parity report a proof rather than a summary

1. **The origin list comes from the export.** You cannot make the report pass by
   forgetting to migrate a page — a page that never made it is a missing URL,
   not an absent row.
2. **Redirect targets are resolved against built routes.** A rule pointing at a
   404, at another rule, or at itself fails. Chains, loops, self-redirects and
   dangling targets each get their own status.
3. **A redirect stub is not a landing page.** A `<meta http-equiv="refresh">`
   page exists but does not land, so it never satisfies a URL on its own.
4. **Unpublished content claims no URL.** Drafts and private pages never entered
   the public URL space, so demanding them would be as wrong as missing a URL
   that did.
5. **The only way to pass with a URL missing is `parity.ignore`** — an explicit,
   reviewable list in config, counted separately from a pass in every report.

---

## Honest boundaries

This is a URL-and-content engine. It is deliberately not a theme converter.

- **Layout is not migrated.** `src/layouts/Base.astro` is a plain layout written
  for this repository so the engine has a real build to verify against. It is
  not a port of your WordPress theme, and it is meant to be replaced.
- **Page-builder markup is cleaned, not rebuilt.** Elementor / Divi / WPBakery
  wrappers and their runtime attributes are stripped and the inner content is
  kept. A heavy builder page will come through as readable HTML that has lost
  its visual layout — treat those pages as a manual rebuild.
- **Media is not downloaded.** Image URLs stay pointed at the WordPress origin,
  on purpose: silently rewriting them to paths that do not exist in the build
  would turn a working image into a 404. Localizing media is a separate step you
  should do knowingly.
- **Parity is URL parity, not visual or content parity.** The verifier proves a
  URL resolves to a page that was built. It does not compare rendered text,
  images or layout against the old site.
- **Origin URLs are reconstructed from slugs, not read from permalinks.** The
  manifest is derived from `wp:post_name` and the parent chain, which matches
  WordPress's default `/%postname%/` structure. If the old site used a custom
  permalink structure (`/%year%/%postname%/`, category prefixes), the "origin"
  list will not be the URLs WordPress actually served — encode that structure
  as redirect overrides, or the report can PASS against reconstructed URLs.
- **Redirects are verified as a model, not as HTTP.** The check resolves rules
  against the built output. It does not make requests against a deployed host,
  so it cannot catch a hosting layer that ignores your `_redirects` file.
- **Only Yoast SEO postmeta is read.** Rank Math, AIOSEO and friends are not
  parsed; their fields come through as absent, not as errors.
- **WXR only.** Ingestion reads the export file. There is no REST API crawler
  here, so nothing requires the old site to still be online.
- **The fixture is synthetic.** The engine has run production migrations; the
  8-URL Harborline export in this repo is not one of them, and its scale is not
  evidence about behavior on a 20,000-node site.

---

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Dallas Crilley.
