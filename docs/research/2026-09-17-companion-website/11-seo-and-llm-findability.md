# 11 - SEO and LLM findability

Written 2026-10-05 against `201a16ea7` (branch `site/01-foundation`). Snapshot of a tree another agent was editing; re-check file contents before acting. Tags: [V] verified by fetching the cited page this session, [M] from memory or the repo only, not re-verified (treat as unverified until checked).

## 0. Facts that shape everything else

| Fact | Source | Consequence |
|---|---|---|
| The site is a subpath (`/home/`) of the app's Worker deploy. `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt`, `public/_headers` belong to the app and are shipped at the domain root. | `wrangler.toml`, `public/` | The website cannot own these files until the root swap. All crawl-control at the root today is the app's. |
| `wrangler.toml` sets `not_found_handling = "single-page-application"`. Every unknown path returns `index.html` with status 200. | `wrangler.toml`, `src/worker.ts` | A typo'd docs URL returns the app shell, not a 404. Search engines treat that as soft-404 or duplicate content, and Astro's `404.html` is never served. Must be fixed at the swap (section 3). |
| Astro `site: https://skymap.rulkens.com`, `base: /home/`, `trailingSlash: 'always'`, `format: 'directory'`. | `packages/website/astro.config.mjs` | Canonicals and sitemap URLs derive from `site` + `base`; one switch moves both. |
| Preview flag is `PREVIEW = true` in `packages/website/src/data/preview.ts`, read only by `Base.astro` to emit `<meta name="robots" content="noindex">`. | `src/data/preview.ts`, `src/layouts/Base.astro` | Good start: one value. It does not yet drive the sitemap, base path, robots.txt or headers. |
| `lighthouse` is not in the root or website `package.json` and not in `node_modules/.bin`. | grep this session | Run through `npx` (section 6). |
| Cloudflare Workers Assets serves `_headers` rules; fingerprinted `.js/.css/.wgsl/.wasm` get a one-year immutable rule, `/fonts/*.woff2` one day. | `public/_headers` | Astro's hashed `.woff2` and images under `/home/_astro/` have no rule. Add one. |

## 1. Audit of what exists now

Files below are under `packages/website/` unless noted.

### 1.1 `src/layouts/Base.astro`

| # | Gap | Fix |
|---|---|---|
| 1 | Canonical is built from `Astro.url.pathname`. During preview it points at `/home/...`, correct for now. At the swap `base` changes, so it must keep deriving from `Astro.site` and the pathname (it does). With `noindex` plus a self-canonical that is harmless. | Keep. Add a test that the canonical ends in `/` and has no query string or hash (`Astro.url.pathname` carries neither). |
| 2 | `og:image` is `/og-image.jpg`, the app's 1200x630 card (155 KB, `public/og-image.jpg`), with no width, height, type or alt tags. It shows the app's old "supercluster" framing. | Add `og:image:width=1200`, `og:image:height=630`, `og:image:type`, `og:image:alt` (required prop `imageAlt`, default from facts). Commit a site-specific card later; the default stays valid. |
| 3 | No `twitter:title`, `twitter:description`, `twitter:image`. X falls back to OG tags for most fields, but explicit tags are cheap. [M] | Add all three plus `twitter:image:alt`. |
| 4 | `<html lang="en">` is present. Good. | Add `og:locale` `en_US`. |
| 5 | No `theme-color`, no `apple-touch-icon`, no `<link rel="sitemap">`. `/apple-touch-icon.png` exists at the root. | Add `<meta name="theme-color" content="#000">` (dark theme only), apple-touch-icon link, and (live mode only) `<link rel="sitemap" href="/sitemap-index.xml">` per the Astro sitemap docs [V] https://docs.astro.build/en/guides/integrations-guide/sitemap/. |
| 6 | No JSON-LD. | Add a `jsonLd` prop and slot-less `<script type="application/ld+json" set:html={JSON.stringify(...)} />` (section 2). |
| 7 | Fonts: `@fontsource-variable/jost/wght.css` is imported. That stylesheet declares one `@font-face` per Unicode subset (latin, latin-ext, cyrillic, greek, vietnamese) with `unicode-range`, so only the latin file downloads for English text. [M] Display type is Cormorant Garamond SemiBold (37.6 KB woff2, root `/fonts/`), declared in the shared font faces. Neither is preloaded, so the display font loads late and is the likely LCP delay if the H1 is the LCP element. | Preload the latin Jost file and the Cormorant woff2 with `<link rel="preload" as="font" type="font/woff2" crossorigin>`. Confirm each face has `font-display: swap` (or `optional` for display type to avoid a swap shift). Subset Cormorant to the characters the site uses only if the budget in 6.2 is missed. |
| 8 | No preload or priority hint for the Home poster (Home is still a placeholder). | Home hero poster must be an `<img>` (not a CSS background) with `fetchpriority="high"`, `loading="eager"`, `decoding="async"`, explicit `width`/`height`. See 6.2. |
| 9 | `PREVIEW && noindex` is correct but meta-only. Non-HTML assets (the llms files, PDFs, images) and a crawler that does not parse HTML are not covered. | Also send `X-Robots-Tag: noindex` for `/home/*` from `public/_headers` in preview mode. Do not add a robots.txt `Disallow: /home/`: Google must be able to fetch a page to see its `noindex`, and a disallowed URL can still be indexed from links. [M] https://developers.google.com/search/docs/crawling-indexing/block-indexing |
| 10 | Title is a free prop with no site-name pattern. | Enforce `<title>{page} | skymap</title>` except Home (section 5). Add a length check in the prop type docs, not a runtime throw. |
| 11 | No `<meta name="author">`, no `rel="me"`/`sameAs` links. | Not required for ranking. Put the maker identity in JSON-LD instead. Skip `keywords` (ignored by Google, [M] https://developers.google.com/search/docs/crawling-indexing/special-tags). |

### 1.2 `src/pages/index.astro`

Placeholder: title `skymap`, description "Placeholder until the Home page lands.", one H1 "skymap". Fine while `noindex`, but must not ship to the root. Add a test that fails the live build when any page description contains "Placeholder" or any title equals the bare site name on a non-Home page.

### 1.3 Nav and footer

`src/data/nav.ts` links `/educators/`, `/venues/`, `/science/`, `/docs/` as root-relative strings. Under `base: /home/` Astro does not rewrite plain `href="/educators/"` strings, so verify they go through `sitePath.ts`; a link to `/educators/` without the base lands in the SPA fallback and returns the app with HTTP 200. Add a build test that every internal `href` in `dist/home/**/*.html` resolves to a file in `dist/`. Footer must link GitHub, the DOI, the cite page and credits (crawlable text links, not icons without labels).

### 1.4 Root files that already exist (the app's)

| File | State | Problem |
|---|---|---|
| `public/robots.txt` | `Allow: /` for `*` plus explicit allow blocks for GPTBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, CCBot; one `Sitemap:` line. | Missing `OAI-SearchBot`, `Claude-User`, `Claude-SearchBot`, `Perplexity-User` (section 4.2). `anthropic-ai` is a legacy token. Policy is already "welcome", so these are documentation, not behaviour. |
| `public/sitemap.xml` | One URL, `lastmod` 2026-05-05. | Replace with the Astro sitemap at the swap. |
| `public/llms.txt` | Stale (mismatch list 4 in 09). | Rewrite (section 4.1, 4.4). |
| `index.html` (app) | Title "Skymap - Interactive 3D Galaxy Catalog Explorer (WebGPU)", description names three catalogues, JSON-LD `SoftwareApplication` with DOI, `keywords` meta, `robots index, follow`. | This is what the root ranks for today, and it undersells the product (mismatch 19). At the swap the app moves to `/app/` and its `index.html` canonical, `og:url` and JSON-LD `url` must be rewritten (section 3). |

### 1.5 What would actively hurt, now

1. `public/llms.txt` and `index.html` state "~3.5 million galaxies", "three real catalogs", "SDSS DR18". Answer engines quote these. SDSS in the code is DR17 and there are eight galaxy sources (09, mismatch 4). Fix before the site links to it.
2. SPA fallback returns 200 for every unknown path (section 0).
3. Any docs page that ships with a number not in `facts.ts` creates a second, uncorrected truth that LLMs will copy.
4. The app itself is a canvas SPA: its root HTML has little crawlable body text [M, not re-read this session]. The site is the only real text a crawler sees. Keep the Home page's text in the HTML, never injected by script.

## 2. Implementation checklist (ordered)

Each line: file, change. "P" = do while still in preview, "L" = lands with the live switch.

1. P `packages/website/src/data/site.ts` (rename of `preview.ts`): export `SITE_MODE` (section 3) and derive `PREVIEW`, `BASE`, `INDEXABLE` from it. One value.
2. P `src/layouts/Base.astro`: add props `imageAlt`, `jsonLd?: object | object[]`, `breadcrumbs?: {name,path}[]`, `type?: 'website' | 'article'`. Emit the tags in 1.1 rows 2 to 6.
3. P `src/layouts/Base.astro`: font preloads (row 7), `theme-color`, apple-touch-icon.
4. P `src/utils/pageTitle.ts` (one function per file): `pageTitle(name)` returns `"name | skymap"`; Home passes a full title.
5. P `src/components/JsonLd.astro`: renders `<script type="application/ld+json" set:html={JSON.stringify(data).replace(/</g, '\\u003c')} />`. The escape stops a `</script>` in a string from closing the block.
6. P `src/data/siteIdentity.ts`: single source for the name, URL, DOI, repo, licence, maker, requirements; consumed by JSON-LD, footer and `llms.txt` generation. Numeric claims come only from `facts.ts` ids.
7. P `public/_headers`: add `/home/_astro/*` `Cache-Control: public, max-age=31536000, immutable` (hashed names) and, in preview, `/home/*` `X-Robots-Tag: noindex`. [M] The `_headers` file is generated by the swap step (section 3) so the noindex line disappears with it.
8. L `packages/website/package.json` + `astro.config.mjs`: add `@astrojs/sitemap` (pin the exact version, as the repo pins others) and register it only when `INDEXABLE`:

```js
integrations: [mdx(), ...(INDEXABLE ? [sitemap({
  filter: (url) => !url.includes('/404'),
  serialize: (item) => ({ url: item.url }),   // no changefreq/priority: Google ignores them
})] : [])],
```

   Google ignores `changefreq` and `priority` and uses `lastmod` only when consistently accurate [M] https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap. Set `lastmod` per page from git (`git log -1 --format=%cI -- <file>`) in `serialize`, or omit it.
9. L `packages/website/public/robots.txt` (the website gets its own `public/` at the swap, see section 3):

```
User-agent: *
Allow: /

User-agent: OAI-SearchBot
Allow: /
User-agent: GPTBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: Claude-User
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Perplexity-User
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: CCBot
Allow: /

Sitemap: https://skymap.rulkens.com/sitemap-index.xml
```

   Keep `/app/` allowed too: the app has no text, but deep links with `#` never reach the server anyway. Do not disallow `/data/` on the root (data is on R2 under another host).
10. P `src/pages/404.astro`: noindex, links home and docs. Works only after the Worker change in section 3.
11. P Home page: `WebSite` and `WebApplication` JSON-LD (below). Docs layout: `TechArticle` + `BreadcrumbList`. Data-source pages: `Dataset`.
12. P `tests/website/seo.test.ts` (mirror tree): after build, for every `dist/home/**/index.html` assert one `<h1>`, a `<title>` of 20 to 60 chars, a description of 70 to 155 chars, one canonical, valid JSON in every ld+json block, `lang="en"`, no `<img>` without `alt` (empty `alt=""` allowed for decoration), and `noindex` present iff `SITE_MODE === 'preview'`.

### 2.1 JSON-LD examples

Rules: every property must be visible somewhere on the page too (Google's structured data guidelines [M] https://developers.google.com/search/docs/appearance/structured-data/sd-policies). Dates and numbers below are placeholders; each marked field needs a `facts.ts` row with `source` and `checked`.

**WebSite** (Home only). No `SearchAction`: the site has no search (spec: "not in this effort"). A sitelinks searchbox is deprecated anyway [M].

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://skymap.rulkens.com/#website",
  "url": "https://skymap.rulkens.com/",
  "name": "skymap",
  "description": "A free, open-source map of the measured universe that runs in a browser.",
  "inLanguage": "en",
  "publisher": { "@id": "https://skymap.rulkens.com/#maker" }
}
```

**WebApplication** (Home, and referenced from docs). Google's software-app rich result requires `offers` and either `aggregateRating` or `review` [V] https://developers.google.com/search/docs/appearance/structured-data/software-app. We have no ratings and must not invent any, so this block is for entity understanding only and will not earn a rich result. Do not add a rating to get one.

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": "https://skymap.rulkens.com/#app",
  "name": "skymap",
  "url": "https://skymap.rulkens.com/app/",
  "applicationCategory": "EducationalApplication",
  "applicationSubCategory": "Astronomy visualisation",
  "operatingSystem": "Any, in a WebGPU-capable browser",
  "browserRequirements": "Requires WebGPU (recent Chrome or Edge; see the browser support page).",
  "description": "Renders the measured universe at true scale, from a street on Earth to the cosmic web, from real catalogues including SDSS, 2MRS, GLADE and Gaia.",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "codeRepository": "https://github.com/rulkens/skymap",
  "identifier": "https://doi.org/10.5281/zenodo.20037028",
  "creator": { "@id": "https://skymap.rulkens.com/#maker" },
  "image": "https://skymap.rulkens.com/og-image.jpg"
}
```

Needs a source in `facts.ts`: the browser list (09 mismatch 17 is unresolved: README lists Firefox 141+ and Safari 26+, the app says Chrome or Edge), the catalogue names, the MIT licence (LICENSE file), the DOI (Zenodo record). Use `WebApplication` while the app runs in a page; `SoftwareApplication` also validates.

**Person** (the maker; use `Organization` only if a legal entity exists). Put on `/docs/credits/` and referenced by `@id` elsewhere.

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://skymap.rulkens.com/#maker",
  "name": "Alexander Rulkens",
  "url": "https://skymap.rulkens.com/docs/credits/",
  "sameAs": ["https://github.com/rulkens"]
}
```

Needs the owner's confirmation of every `sameAs` URL; add only profiles the owner names.

**BreadcrumbList** (every docs page, built from the path). Google uses it for the breadcrumb display [M] https://developers.google.com/search/docs/appearance/structured-data/breadcrumb.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Docs", "item": "https://skymap.rulkens.com/docs/" },
    { "@type": "ListItem", "position": 2, "name": "Data sources", "item": "https://skymap.rulkens.com/docs/data/" },
    { "@type": "ListItem", "position": 3, "name": "SDSS" }
  ]
}
```

**TechArticle** (docs guide, reference, rendering, science pages). `dateModified` comes from git, not hand-typed.

```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Moving around",
  "description": "How to travel, orbit, zoom and look around in skymap, with the keyboard, mouse and touch controls.",
  "url": "https://skymap.rulkens.com/docs/guide/moving-around/",
  "inLanguage": "en",
  "datePublished": "2026-10-05",
  "dateModified": "2026-10-05",
  "author": { "@id": "https://skymap.rulkens.com/#maker" },
  "publisher": { "@id": "https://skymap.rulkens.com/#maker" },
  "isPartOf": { "@id": "https://skymap.rulkens.com/#website" },
  "about": { "@id": "https://skymap.rulkens.com/#app" }
}
```

**Dataset** (one per data-source page). Google's dataset result needs `name` and `description` and favours `license`, `creator`, `url`, `sameAs` [M] https://developers.google.com/search/docs/appearance/structured-data/dataset. We describe someone else's dataset and how we use it, so `creator` is the survey, and the page must say "we use a processed copy". Example for SDSS; the numbers are placeholders that must come from `facts.ts` (09 marks galaxy counts per tier unverified).

```json
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "SDSS spectroscopic galaxy catalogue (as used in skymap)",
  "description": "The Sloan Digital Sky Survey spectroscopic galaxy sample, with the selection and processing skymap applies before drawing it.",
  "url": "https://skymap.rulkens.com/docs/data/sdss/",
  "sameAs": "https://www.sdss.org/",
  "creator": { "@type": "Organization", "name": "Sloan Digital Sky Survey collaboration", "url": "https://www.sdss.org/" },
  "license": "<the data release's own licence URL; verify, do not assume>",
  "isBasedOn": "https://www.sdss.org/",
  "citation": "<the survey's own paper, from ATTRIBUTIONS.md>"
}
```

Do not add `variableMeasured`, row counts or `temporalCoverage` unless each is in `facts.ts`.

**FAQPage**: not warranted. Google restricted FAQ rich results to well-known government and health sites in 2023 and has since reduced them further [M, the official announcement URL returned 404 when fetched this session: https://developers.google.com/search/updates/faqpage-rich-results is not a valid URL; search "FAQ rich results restricted August 2023"]. Write FAQ-style headings as plain prose (section 4.3); skip the markup.

## 3. The noindex-to-indexed switch

### 3.1 One value

`packages/website/src/data/site.ts`:

```ts
export type SiteMode = 'preview' | 'live';
export const SITE_MODE: SiteMode = process.env.SKYMAP_SITE_MODE === 'live' ? 'live' : 'preview';
export const INDEXABLE = SITE_MODE === 'live';
export const BASE = INDEXABLE ? '/' : '/home/';
```

`astro.config.mjs` already imports `.ts` from `tools/`, so it can import this file. The env override exists so Lighthouse can audit the live shape (an SEO audit on a `noindex` page fails "is crawlable", so scoring preview mode as-is is meaningless). The committed default stays `preview`; the swap PR changes the default to `live` in this one place. Output folder follows `BASE`: `dist/` root in live mode, `dist/home/` in preview. Today `outDir` comes from `toolPages.website`; the swap changes that registry row, which is the "unify registries" work in the spec.

### 3.2 Everything that flips together

| # | Item | Preview | Live |
|---|---|---|---|
| 1 | Robots meta in `Base.astro` | `noindex` | none (default `index, follow`); never emit `index` explicitly |
| 2 | `X-Robots-Tag` in `_headers` | `/home/*: noindex` | line removed |
| 3 | `robots.txt` | app's, root | website's own (4.2 list), `Sitemap:` line points at `sitemap-index.xml` |
| 4 | Sitemap | none for the site; app's one-URL `sitemap.xml` stays | `@astrojs/sitemap` output at root; delete `public/sitemap.xml` |
| 5 | `site` + `base` | `https://skymap.rulkens.com` + `/home/` | same `site`, `/` |
| 6 | Canonicals, `og:url`, JSON-LD `url` | derive from `site` + `BASE` | same code, no edit |
| 7 | App moves to `/app/` | root `index.html` is the app | app `index.html` canonical, `og:url`, JSON-LD `url`, description and title rewritten; it is a canvas page, give it `<meta name="robots" content="noindex">` or keep it indexable with a distinct title (owner decision; indexable app deep link `/app/` is fine, but its text must not duplicate Home) |
| 8 | `appLink()` base | `/` | `/app/` (already one line per spec) |
| 9 | Old app deep links | `/#focus=...` works | see 3.3 |
| 10 | `llms.txt` and `llms-full.txt` | stale, rewritten in preview or not at all | regenerated from the site, root |
| 11 | 404 handling | SPA fallback returns the app with 200 | see 3.4 |
| 12 | Hashed asset cache rule | `/home/_astro/*` | `/_astro/*` (set `build.assets` to a name the app's Vite output does not use, so a hashed filename can never collide) |
| 13 | `lastmod` | n/a | per-page from git |

A test that reads `SITE_MODE` and asserts rows 1 to 6 on the built output (the `seo.test.ts` in the checklist) is the guard against a half-flip.

### 3.3 Redirects for old app deep links

Existing links to the root look like `https://skymap.rulkens.com/#focus=body-saturn&t=...`, plus query flags `?perf`, `?gpuTimings`, `?tour`. A fragment never reaches the server, so Cloudflare redirect rules cannot see `#focus`. Design:

1. Server side, in `src/worker.ts` (before `env.ASSETS.fetch`): `GET /` with any query string redirects 301 to `/app/` plus the query. Query flags then keep working.
2. Client side, a 10-line inline script at the top of the root Home `<head>` (render-blocking by intent, tiny): if `location.hash` matches the app's hash grammar (`#focus=`, `#t=`, `#pose=`, `#exhibit=`, `#tour=`, `#clip=`, `#orientation=`; list is in `src/state/url/hashParamSources.ts`) then `location.replace('/app/' + location.hash)`. Use the same parser the app uses so the grammar cannot drift.
3. Keep `/galaxy/`, `/mcpm/`, `/flow/` unchanged. Link them from docs (09 open question 14).
4. Any other SPA-style paths the app may serve (the Worker comment mentions `/info/12345`) are unverified; grep `src/` for `pathname` routing before the swap and add redirects for any found.

### 3.4 404 behaviour

Change `not_found_handling` to `"404-page"` [M] https://developers.cloudflare.com/workers/static-assets/routing/ and have `src/worker.ts` serve `/app/index.html` only for misses under `/app/`. Result: the site's `404.html` serves real 404s; the app keeps its SPA fallback under its own prefix. Without this, the `noindex` 404 page never appears and bad URLs stay soft-404.

### 3.5 Owner steps at the swap

See section 8 (Search Console, Bing, address-change not needed because the host does not change).

## 4. LLM findability

### 4.1 `llms.txt`

What is verified: llms.txt is a proposal, not a standard. Format: H1 name, blockquote summary, optional paragraphs, H2 sections of markdown link lists, an "Optional" section for skippable links; also suggests `.md` twins of pages [V] https://llmstxt.org/. What is not verified: that any major answer engine fetches it. Google's crawler documentation does not mention it [V] https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers (the page lists no llms.txt handling). Treat it as cheap insurance and a handy index for agents that a user points at the site. Do not spend design effort on it beyond generation from the same sources as the site.

Generate `llms.txt` at build time (`packages/website/src/pages/llms.txt.ts`, an Astro endpoint) from the docs content collection and `siteIdentity.ts`, so it cannot drift again. Contents:

```
# skymap

> skymap is a free, open-source web app that renders the measured universe at true scale, from a street on Earth to the cosmic web, using real catalogues. It runs in a WebGPU browser; there is nothing to install.

<one paragraph: who made it, licence, DOI, what it is not (not a simulation of unmeasured structure; where we simplify, see Known simplifications)>

## Start here
- [What is skymap](.../docs/): ...
- [Open the app](.../app/): ...
- [Use it in a classroom](.../educators/)
- [Domes and museums](.../venues/)

## Docs
- [Guide](...), [Controls](...), [URL parameters](...), [Object catalogue](...)

## Data and science
- [Data sources and attributions](...)
- [How we render](...)
- [Known simplifications](...)

## Cite
- [How to cite](.../docs/cite/): DOI 10.5281/zenodo.20037028, BibTeX
- [Source code](https://github.com/rulkens/skymap)

## Optional
- [Roadmap](...), [Credits](...), [Developer tools](...)
```

Every sentence in the summary uses wording that appears verbatim in `facts.ts` or the cite page.

### 4.2 `llms-full.txt` and markdown twins

| Option | Worth it? | Reason |
|---|---|---|
| `llms-full.txt` (all docs concatenated) | Yes, cheap | One Astro endpoint concatenating the docs collection. Docs are bounded (tens of pages), so it fits a context window; agents asked to "use the skymap docs" get one fetch. Exclude the roadmap and credits to stay small. |
| Per-page `.md` twins | Yes for `/docs/**` only | If docs are MDX content already, an endpoint `[...slug].md.ts` is a few lines, and a `<link rel="alternate" type="text/markdown" href="...">` per the proposal [V] https://llmstxt.org/ lets agents skip the layout. Not for Home, educators, venues (marketing layout, no value). Strip JSX and component output; test that no `<` tag survives. |
| Both | Treat as low priority | No verified evidence that crawlers use them. Do them after the checklist items above, only if the generation endpoint is under 40 lines. |

### 4.3 Crawler rules by user agent

| Agent | Purpose | Our rule | Source |
|---|---|---|---|
| OAI-SearchBot | Surfaces sites in ChatGPT search | Allow | [V] https://developers.openai.com/api/docs/bots |
| GPTBot | Collects content that may train OpenAI models | Allow (owner policy: "all welcome", open source); the owner may flip this one line | [V] same |
| ChatGPT-User | User-initiated visits; OpenAI says robots.txt may not apply | Allow | [V] same |
| ClaudeBot | Training data collection | Allow | [V] https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler |
| Claude-SearchBot | Search result quality | Allow | [V] same |
| Claude-User | User-initiated fetches | Allow | [V] same |
| anthropic-ai | Legacy token | Keep the existing allow block, harmless | [M] |
| PerplexityBot, Perplexity-User | Perplexity indexing and user fetch | Allow | [M] https://docs.perplexity.ai/guides/bots (not fetched) |
| Google-Extended | Robots token controlling use for Gemini training and grounding; it is not a separate crawler and does not affect Search ranking | Allow | [M] https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers lists it under special tokens in some versions; this session's fetch did not confirm, treat as unverified |
| CCBot | Common Crawl, feeds many training sets | Allow | [M] https://commoncrawl.org/ccbot |
| Bingbot | Bing and Copilot grounding | Covered by `*` | [M] |

All "Allow: /". A crawler absent from the list is covered by `*`, so the named blocks only document intent (as the current file says). If the owner later wants to opt out of training only, the change is `Disallow: /` on GPTBot, ClaudeBot, Google-Extended, CCBot and nothing else.

### 4.4 Writing pages so answer engines quote them correctly

1. Definitional first sentence on every page, subject first, no pronoun: "skymap is a free, open-source web app that ...". Docs pages open with "<Thing> is ...".
2. A citable "What is skymap" paragraph (60 to 90 words) lives in one place, `src/data/siteIdentity.ts` (`whatIs`), rendered on Home (visible, below the fold is fine), in `/docs/`, in `llms.txt`, and in the cite page. One text, four places, so quotes agree.
3. Self-contained sections: each H2 answers one question in 2 to 5 sentences without "as above". Name the subject again at the start of the section.
4. Stable anchors: set explicit `id`s on headings for anything a link may target (`#controls`, `#browser-support`, `#sdss`), and never rename them without a redirect map. Do not rely on auto slugs for key sections.
5. Numbers carry their unit, source link and date in the same sentence. Quote only what is in `facts.ts`.
6. A `/docs/cite/` page: plain-text citation, BibTeX block, the DOI link, the version string, "which version to cite" rule, and the per-survey citations (from `ATTRIBUTIONS.md`). Same content as `CITATION.cff`; generate from it so they cannot disagree. [M] GitHub's "Cite this repository" reads `CITATION.cff`, per the README.
7. Tables and lists for specifications (controls, data sources, browsers), prose for reasons. Avoid text inside images; every diagram gets an `alt` that states its claim.
8. No claims we cannot source. State limits in the same place as the claim ("known simplifications" linked from each rendering page).
9. Put the app's capability statements where a quote will be accurate: "skymap draws the catalogued galaxies, not a simulation of unmeasured ones" belongs next to the data table, not only on the simplifications page.

### 4.5 The 21 mismatches as a fix list

Source: 09, section "Doc/code mismatches". Most touch files outside the website; for each, the owner file and the fix. A mismatch left standing is a quotable falsehood, so items marked * block the swap.

| # | File | Fix |
|---|---|---|
| 1 * | `README.md:35,78` | Remove the CF-4 dark-matter volume text; list MCPM, Polyphorm, MCPM Workbench. |
| 2 | `README.md:31` | Add the 24 moons and 10 spacecraft/models (counts from `facts.ts`). |
| 3 | `README.md:36` | Say timings need `?gpuTimings` or `?perf`. |
| 4 * | `public/llms.txt` | Replace by the generated file (4.1). |
| 5 | `README.md:34` | Widen the search description. |
| 6 | `src/utils/url/hasDeepLink.ts:13`, `src/state/ui/buildInitialUiState.ts:33` | Comments say `#tour=`. |
| 7 | `NavigationPanel.tsx:53-63` | Add missing controls or link to the controls reference. Visitor-facing text. |
| 8 | `exhibitRegistry.ts:2` | "five". |
| 9 | `CommandPalette.tsx:5`, `famous-galaxy.ts:32,37` | 81 seed entries. |
| 10 | `orbitalElements.ts:914`, `s-star.ts:5,20` | 40 S-stars (39 + S301). |
| 11 | `TourDebugPillContainer.tsx:9` | Fix or delete the stale comment. |
| 12 | `tools/record/README.md:42,172` | Hardware encoder at 60 Mbit/s; ten clips. |
| 13 | `tools/flow-workbench/README.md` | `npm run flow-workbench`, `flowfield.scfd`. |
| 14 | `tools/galaxy-renderer/README.md`, `tools/mcpm-workbench/README.md` | Title "Galaxy Explorer"; note they ship on the live site. |
| 15 | `docs/DEPLOY.md:24` | Three pages ship; flow port is 5300. |
| 16 | `03-architecture-features.md:51,64` | 24 moons; seven hash params. Internal doc. |
| 17 * | `README.md:13` vs `unsupportedPage.ts:61`, `Splash.constants.ts:20` | Owner picks one browser list (09 open question 10); JSON-LD `browserRequirements` and the support table follow it. |
| 18 | `defaults.ts:109-119`, `FlowRow.tsx:25-30` | Remove comments about features that do not exist. |
| 19 * | `index.html:15,52`, `public/sitemap.xml` | New title and description (section 5 Home pattern), new sitemap. |
| 20 | `src/data/sources/mesh-body.ts:6-8` | Ten rows. |
| 21 | `ClipTriggersSection.tsx:26-28` | Comment fix. |

## 5. Keyword and intent map

Search volume data is not available to this run, so the "queries" below are what each audience plausibly types, from experience, not measured [M, unverified]. Check them in Search Console once live; replace guesses with the Queries report. Titles are at most 60 characters including " | skymap"; descriptions at most 155. Voice per 08: "we", no hype, no em dashes. Terms to avoid unless sourced are flagged.

| Page | Intent and likely queries | Title | Description | H1 |
|---|---|---|---|---|
| Home `/` | Curious visitor. "interactive 3D map of the universe", "universe scale visualization", "see galaxies in 3D browser", "real galaxy map" | `skymap: the measured universe in 3D, in your browser` (52) | `A free, open-source map of real galaxies, stars and planets at true scale. Fly from a street on Earth to the cosmic web in a browser.` (130) | `The universe, where we measured it` (confirm against 08) |
| `/educators/` | Teachers. "classroom astronomy tools", "teach large scale structure", "interactive universe scale for students", "free astronomy simulation browser" | `Teach with skymap: a free astronomy tool \| skymap` (49) | `We built skymap to show students real measured galaxies at true scale. Free, no install, with deep links you can share in a lesson.` (131) | `Use skymap in a classroom` (matches nav) |
| `/venues/` | Dome operators, museum staff. "planetarium software browser", "fulldome content WebGPU", "museum interactive universe exhibit", "dome show real data" | `Skymap for planetariums, domes and museums \| skymap` (52) | `We run skymap on domes and in galleries, and build custom versions. See what exists, what we can adapt, and how to ask us.` (121) | `Domes and museums` |
| `/science/` | Astronomers. "SDSS galaxy map 3D", "2MRS GLADE visualization", "cosmic web visualization tool", "Cosmicflows density map viewer" | `The science behind skymap: data, methods, limits` (50) | `Where skymap's numbers come from, how we turn catalogues into pixels, and where we simplify. Each claim links to its source.` (123) | `Where the numbers come from` |
| `/docs/` | Orientation. "skymap documentation", "skymap how to use" | `skymap documentation` (21) | `Guides, controls, data sources, rendering notes and citation details for skymap, the free open-source universe map.` (113) | `Documentation` |
| `/docs/guide/**` | How-to. "how to navigate skymap", "skymap keyboard shortcuts", "WebGPU not supported" | `<Topic> \| skymap docs` | One sentence stating what the reader can do after reading, with the main verb first. | The topic phrase, same as the title minus suffix |
| `/docs/reference/controls/` | "skymap controls", "skymap keyboard shortcuts" | `Controls and keyboard shortcuts \| skymap docs` (46) | `Every mouse, touch and keyboard control in skymap, by device.` | `Controls` |
| `/docs/data/` and per source | "SDSS DR17 galaxy catalogue", "GLADE+ catalogue", "2MRS catalogue", "Gaia DR3 visualization", "Milliquas" | `<Survey>: how skymap uses it \| skymap docs` | `What the <Survey> catalogue contains, the licence and citation, and how skymap selects and draws it.` | `<Survey>` |
| `/docs/rendering/**` | Technical readers. "WebGPU galaxy renderer", "render millions of points WebGPU", "logarithmic depth precision" | `<Topic> in skymap's renderer \| skymap docs` | `How skymap draws <topic> with WebGPU, and the limits we accept.` | `<Topic>` |
| `/docs/science/**` | "how are galaxy colours computed", "redshift distance in skymap" | `<Topic>: the method behind skymap \| skymap docs` | `The formulas, units and sources skymap uses for <topic>.` | `<Topic>` |
| `/docs/simplifications/` | Sceptical astronomers. "skymap accuracy", "skymap limitations" | `Known simplifications \| skymap docs` (36) | `Where skymap departs from the measured sky, with the reason for each.` | `Known simplifications` |
| `/docs/cite/` | "cite skymap", "skymap DOI", "skymap BibTeX" | `How to cite skymap \| skymap docs` (31) | `Cite skymap in a paper or talk: DOI 10.5281/zenodo.20037028, BibTeX, and the surveys to credit alongside it.` (111) | `How to cite skymap` |
| `/docs/roadmap/`, `/docs/credits/` | Navigational | `Roadmap \| skymap docs`, `Credits \| skymap docs` | One factual sentence each. | `Roadmap`, `Credits` |

Length check: the educators title as written is 49 characters. Verify each in the SEO test (20 to 60 chars).

Claims to avoid unless sourced in `facts.ts`:

| Term | Why |
|---|---|
| "largest", "most accurate", "most detailed", "only" | Not verifiable. |
| "millions of galaxies", "3.5 million" | Tier totals are unverified in 09. Use the figure from `facts.ts` once built data confirms it. |
| "real-time" | Frame rate depends on the GPU. Say "interactive". |
| "NASA-grade", "research-grade", "scientifically accurate" | Overclaims; 08 forbids hype and "known simplifications" contradicts them. |
| "planetarium-ready", "fulldome-certified" | Only claim dome use we have confirmed: the Wisdome Malmo line is owner-pending (spec, owner actions). |
| "works in all browsers" | WebGPU support varies (09 mismatch 17). |
| "free for education" | Say "free and open source (MIT)"; a classroom promise implies support we do not offer. |
| "used by ..." | No usage evidence in the repo. |

## 6. Lighthouse and Core Web Vitals plan

### 6.1 Targets

Thresholds for field data at the 75th percentile, mobile and desktop separately: LCP at most 2.5 s, INP at most 200 ms, CLS at most 0.1 [V] https://web.dev/articles/vitals. Lighthouse lab cannot measure INP; it reports TBT as the proxy [M].

| Page set | Performance (mobile) | Performance (desktop) | Accessibility | Best Practices | SEO |
|---|---|---|---|---|---|
| Home | 85 or more (stretch 90) | 95 or more | 100 | 100 | 100 in live mode |
| All other pages | 95 or more | 100 | 100 | 100 | 100 in live mode |

Home gets a lower mobile bar because of the video; do not trade the poster-first design for the score. Lab CLS must be 0.00 on all pages; LCP at most 2.5 s on throttled mobile in the lab run.

### 6.2 Home budget

| Item | Budget | Notes |
|---|---|---|
| LCP element | The poster `<img>` | Not the H1. Display type must not be the LCP candidate; if Lighthouse names the H1, the poster is smaller than the headline block or lazy. |
| Poster bytes | At most 120 KB mobile variant, 250 KB desktop | AVIF or WebP through `astro:assets` `<Image>` or `<Picture>` with `widths` and `sizes`; commit the source. [M] https://docs.astro.build/en/guides/images/ (not fetched this session) |
| Fonts | At most 70 KB total, all preloaded and `font-display: swap` | Cormorant SemiBold is 37.6 KB already (`public/fonts/`); Jost latin subset size unverified. Preload only faces used above the fold. |
| CSS | At most 25 KB gzip, inlined or one render-blocking file | Astro inlines small stylesheets by default (`build.inlineStylesheets: 'auto'`) [M]. |
| JavaScript | At most 30 KB gzip on Home; zero for non-interactive pages | Astro ships none unless an island hydrates. Hero scrub script plus venue form are the only scripts. Load the scrub script with `defer`. |
| Video | Zero bytes before `load`; then idle fetch | `<video preload="none" poster muted playsinline>`; assign `src` in a `requestIdleCallback` after `load`, only if not `prefers-reduced-motion`, not `saveData`, and not a small screen (spec). The R2 file sits on another origin: add `<link rel="preconnect">` only at the moment the script decides to load. |
| Requests before LCP | Under 10 | HTML, CSS, poster, 2 fonts, favicon. |

### 6.3 Likely failures for this design and the fix

| Cause | Symptom | Fix |
|---|---|---|
| Pinned scroll-scrub section | CLS if the sticky stage's height is set by script; "avoid large layout shifts" | Set the scroll track height in CSS (`height: calc(100vh * N)`, `100svh` on mobile) and the stage's `aspect-ratio` up front. No height assigned from JS after load. |
| Scroll handler | Long tasks, TBT, INP | `passive` listener, one `requestAnimationFrame` per frame, write `video.currentTime` only when it changed by more than a frame; or drive CSS from `animation-timeline: scroll()` where supported. Seeking is expensive unless the clip is encoded all-intra (a keyframe on every frame); engineering judgement, verify with a profile [M]. |
| Poster not discoverable early | LCP resource discovery late | Real `<img>` in HTML, `fetchpriority="high"`; never a CSS `background-image` or a JS-created element. |
| Video steals bandwidth from the poster | LCP late on slow 4G | Defer `src` until `load`. |
| Large display type | LCP candidate is text; font swap shifts layout | Preload; give the H1 a `size-adjust`/fallback metric-matched face or `font-display: optional` for Cormorant. |
| Self-hosted fonts at one-day cache | Repeat visits revalidate; weak "efficient cache policy" audit | `/home/_astro/*` immutable; for `/fonts/*.woff2` the one-day rule is intentional (the atlas beside it is re-baked); hash the woff2 names if the audit complains. |
| Shared font and token CSS includes unused faces | Extra requests | Only `@font-face` rules reachable from site CSS ship; the faces are declared by the split `tokens`/font-face files; check the built CSS contains only what the site uses. |
| Text contrast on video | Accessibility audit | Overlay scrim so text passes 4.5:1 against the worst frame, not the average. |
| Autoplay or motion | Not scored, but a11y | Visible pause control (spec); reduced-motion gets the poster. |
| Third-party scripts | None planned | Keep it that way; analytics is out of scope. |
| Images with no dimensions | CLS | `astro:assets` writes width and height; require them in the SEO test. |

### 6.4 Reproducible commands

`lighthouse` is not installed. Run it via `npx` without touching `package.json`. The built site references root files (`/fonts/`, `/og-image.jpg`, `/favicon.svg`) that only exist in `dist/` after the full app build, so `site:build` alone gives broken font and image URLs. Use the full build for audits.

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/companion-website
OUT=.superpowers/sdd/2026-10-05-companion-website/lighthouse
mkdir -p "$OUT"

# 1. Build the live shape (SEO audit is meaningless under noindex).
SKYMAP_SITE_MODE=live npm run build

# 2. Serve dist/ statically on a free port (leave any dev server alone).
npx vite preview --port 4190 --strictPort &      # or: npx --yes serve dist -l 4190
PREVIEW_PID=$!
sleep 3
curl -sI http://localhost:4190/home/ | head -1   # expect 200

# 3. Mobile (Lighthouse default: Moto G Power emulation, simulated slow 4G).
npx --yes lighthouse http://localhost:4190/home/ \
  --output=json --output=html --output-path="$OUT/home-mobile" \
  --chrome-flags="--headless=new --no-sandbox"

# 4. Desktop.
npx --yes lighthouse http://localhost:4190/home/ --preset=desktop \
  --output=json --output=html --output-path="$OUT/home-desktop" \
  --chrome-flags="--headless=new --no-sandbox"

kill $PREVIEW_PID
```

Repeat 3 and 4 for each page in a loop over `/home/`, `/home/educators/`, `/home/venues/`, `/home/science/`, `/home/docs/`. In live mode the folder is `dist/` root and the URLs lose `/home`. Run each audit three times and keep the median; a single Lighthouse run varies by several points [M]. Read scores with `node -e` or `jq '.categories | map_values(.score)' "$OUT/home-mobile.report.json"`. The first `npx --yes lighthouse` run downloads the package: say so before running; record the version it prints in `$OUT/VERSION.txt` so later runs compare like with like. `vite preview` serving of `/home/` directory index and a missing-file fallback to the app's `index.html` are unverified; if `/home/` returns the app, use `serve`. Lab runs are local, uncompressed and CDN-free, so treat them as a regression gate, not a prediction of field CWV.

Also record the field data once live: the CrUX report in Search Console's Core Web Vitals page and PageSpeed Insights (owner action, section 8).

## 7. Per-slice review checklist

Run after each slice. Pass means every row passes; fail items go back to the slice's author.

| Slice | Check | Pass criterion |
|---|---|---|
| Foundation | Head tags | Each page has one `<title>` of 20 to 60 chars, one description of 70 to 155, one canonical with absolute `https://skymap.rulkens.com` URL ending in `/`, OG and Twitter title, description, image with width, height, alt. |
| Foundation | Mode switch | `SITE_MODE=preview`: `noindex` meta on every page and no sitemap. `=live`: no `noindex`, sitemap present, canonicals without `/home/`. Both asserted by test. |
| Foundation | Headers and fonts | Font preloads present; `_headers` has the `_astro` immutable rule; no layout shift when fonts load. |
| Foundation | Internal links | Every `href` in built HTML resolves to a built file (no link falls into the SPA fallback). |
| Landing pages | Titles and H1 | Match section 5; exactly one `<h1>` per page, no skipped heading levels. |
| Landing pages | Images and video | Every `<img>` has `alt` (or `alt=""` with `role="presentation"` for decoration) and dimensions; poster is the LCP; the video does not load before `load`. |
| Landing pages | Forms | Venue form has labelled fields, honest error text, no `noindex`-only content hidden behind JS. |
| Landing pages | Claims | Every number or superlative on the page maps to a `facts.ts` id; no term from the 5 "avoid" list. |
| Docs guide | Structure | First sentence defines the page's subject; each H2 self-contained; explicit heading ids on linkable sections; `TechArticle` and `BreadcrumbList` valid (Rich Results Test or schema validator, [M] https://validator.schema.org/). |
| Docs guide | Controls | The controls table matches `keyboardShortcuts.ts` (also fixes 09 mismatch 7). |
| Data | Per-source page | Licence, citation (from `ATTRIBUTIONS.md`), version, selection, what we do not show; `Dataset` JSON-LD valid; every count in `facts.ts`. |
| Data | Attribution | The page names the survey as creator and says that skymap uses a processed copy. |
| Rendering and science | Sourcing | Each formula or constant links a primary source; "known simplifications" linked from the page; no "accurate" claim without the limit beside it. |
| Cross-links | Graph | Every page reachable in at most three clicks from Home; no orphan; every docs page links up to its section and sideways to at least one sibling; the app is linked from Home, educators, venues and each guide page via `appLink()`. |
| Cross-links | Machine files | `llms.txt` lists every docs page; `llms-full.txt` (if built) builds without JSX residue; no 21-list item marked * left open. |
| Each slice | Lighthouse | Section 6 targets met on the changed pages; reports saved under `.superpowers/sdd/2026-10-05-companion-website/lighthouse/`. |

## 8. Owner actions

1. Decide the browser support wording (README vs in-app message) so JSON-LD and the support table can state it.
2. Confirm which profile URLs may appear as `sameAs` for the maker, and whether an `Organization` exists.
3. Decide GPTBot, ClaudeBot, Google-Extended and CCBot policy (default in this doc: allow all).
4. Decide whether the app at `/app/` is indexable or `noindex` (section 3.2 row 7).
5. At the root swap, in Google Search Console: add a Domain property for `rulkens.com` (DNS TXT) or a URL-prefix property for `https://skymap.rulkens.com/`; submit `https://skymap.rulkens.com/sitemap-index.xml`; use URL Inspection on Home and `/docs/` and click "Request indexing". [M] https://support.google.com/webmasters/answer/9008080
6. Bing Webmaster Tools: import the site from Search Console, submit the same sitemap; enable IndexNow only if wanted (not required). [M] https://www.bing.com/webmasters
7. Cloudflare: confirm the zone setting that `skymap.rulkens.com` has "Always Use HTTPS", and that no bot-fight or WAF rule challenges the crawlers listed in 4.3 (a challenge page reads as an empty page to a crawler). [M]
8. Cloudflare Workers config: approve the `not_found_handling` change and the Worker redirect for `/` with a query string (section 3.3, 3.4).
9. Check the Search Console Coverage ("Pages") report a week after the swap for "Soft 404" and "Duplicate, Google chose different canonical" and send those URLs to the next agent.
10. Re-run PageSpeed Insights on the live Home (mobile and desktop) and record the scores next to the Lighthouse reports. https://pagespeed.web.dev/
11. Directory and community listings, where relevant and free (check each one's current submission rules before posting; none verified this session): Wikipedia's "List of planetarium software" and "List of space simulation software" are edited by the public and need a neutral, sourced entry, so propose it only with independent coverage; the Zenodo record (already exists) gets the website URL in its related identifiers; the GitHub repository sets its homepage field to the site and adds topics (`astronomy`, `webgpu`, `cosmology`, `planetarium`, `data-visualization`); astronomy-education listings such as the AAS or the Astronomy Education Review's resources, IMERSA (fulldome community), the Digital Planetarium Society and Dome Users Group, and the Astrophysics Source Code Library (ASCL, https://ascl.net/, accepts open research software with a citation). Each one line, each the owner's submission. [M for all names; confirm the URLs and acceptance criteria]
12. Provision the venue form's email sending and Turnstile before the venues page is indexed, so the contact route works at first crawl.
