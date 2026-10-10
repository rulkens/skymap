# 01 — Existing web presence and reusable material

Subagent sweep, 2026-09-17, `main` @ `845720549`. Unverified; open the cited file before relying on a claim.

## 1. Project identity (as published)

- **Name:** `skymap` (lowercase in README / og-image; "Skymap" in meta tags / title). No separate product name.
- **Taglines in circulation:**
  - README blurb: _"Fly from Earth's surface to the edge of the observable universe in one true-scale WebGPU scene, built from real survey data."_ (`README.md:3`)
  - `<title>` / og:title: _"Skymap — Interactive 3D Galaxy Catalog Explorer (WebGPU)"_
  - meta description: _"Fly through millions of galaxies in your browser. Interactive WebGPU 3D explorer for the SDSS, GLADE, and 2MRS catalogs with cosmic-web filaments."_
  - og-image overlay (baked into the JPEG): "skymap" / _"From Earth's surface to the edge of the observable universe"_ / _"3M galaxies · 16.8M stars · planets · the cosmic web · skymap.rulkens.com"_ (`tools/site/makeOgImage.ts`)
  - `package.json` description: _"Interactive WebGPU 3D explorer for the SDSS, GLADE, and 2MRS galaxy catalogs."_
- **Production URL:** `https://skymap.rulkens.com`; also `skymap.rulkens.workers.dev`. Data host: `skymap-data.rulkens.com` (R2 custom domain) plus the raw `r2.dev` bucket URL inlined via `wrangler.toml [vars] VITE_DATA_BASE_URL`.
- **Repo:** https://github.com/rulkens/skymap. **Licence:** MIT.
- **Version:** 0.5.0 (`package.json`, `CITATION.cff`, released 2026-08-31).
- **DOI:** concept DOI `10.5281/zenodo.20037028` (always-latest; README badge, `CITATION.cff`, `llms.txt`, JSON-LD `identifier`).
- **Author:** Alexander Rulkens, "Independent researcher" in the JOSS draft; ORCID still a placeholder.

## 2. Deploy topology and where a docs site could live

- **Shell:** Cloudflare Workers Assets, auto-built from every push to `main` by the GitHub integration (`npm run build` → `dist/`). `wrangler.toml`: `main = src/worker.ts`, `[assets] directory="./dist"`, `not_found_handling = "single-page-application"`, no `routes` block (custom domain attached in the dashboard).
- **`src/worker.ts`** is a deliberate pass-through (`env.ASSETS.fetch(request)`); its docblock names it as the entry point for any future edge logic.
- **Data:** ~280 MB in R2, synced manually (`npm run sync-r2-secure`). See `docs/DEPLOY.md`.
- **Multi-page precedent — the key finding.** `vite.config.ts` is single-entry, but `npm run build` chains three extra Vite builds into `dist/` subfolders served at `/galaxy/`, `/mcpm/`, `/flow/`. Registry: `tools/utils/io/toolPages.ts`; each has its own `tools/<name>/vite.config.ts` setting `base`, dropping `publicDir`, pointing `envDir` at the repo root. Documented in `docs/DEPLOY.md` § "Dev-tool pages".
  - A site at a subpath clones this pattern: a fourth `toolPages.ts` entry, a vite config, a line in the `build` script.
  - Subpath is easier than subdomain: same Worker, same `_headers`, same R2 CORS allow-list (which names only `skymap.rulkens.com`, `skymap.rulkens.workers.dev`, `localhost:5173`; a subdomain needs `tools/deploy/r2Cors.json` edited and `npm run r2-cors`).
  - Caveat: the SPA fallback sends any unmatched path to the app's `index.html`, so every docs path needs a real `index.html`.
- **Only non-app page today:** `src/unsupportedPage.ts` — an inline-styled "Skymap needs WebGPU" card swapped into `document.body` before React mounts. No about, marketing or 404 page.
- The app has hash deep-links only (`#focus=`, `#t=`), no path routes.

## 3. `tools/site/` and `ds-bundle/`

- **`tools/site/`** — two one-shot asset generators, not a website. `makeOgImage.ts` crops `docs/screenshots/cosmic-web.jpg` to 1200×630 and composites the headline via sharp (bundled `tools/site/fonts/CormorantGaramond-SemiBold.ttf`) → `public/og-image.jpg`. `makeFavicon.ts` renders `public/favicon.svg` → `public/apple-touch-icon.png`. Neither is wired into `npm run build`.
- **`ds-bundle/`** — an exported design-system package of the real HUD components (InfoCard, SettingsPanelPreview) for external design tooling: `_ds_bundle.css`, `_ds_bundle.js`, previews, screenshots. Its `README.md` is a usable brand guide (token table, "always render over a dark backdrop", font rules). Stale (flag file `_ds_needs_recompile` present) but the token table is accurate.

## 4. Existing marketing assets

- `public/og-image.jpg`, `public/favicon.svg`, `public/apple-touch-icon.png`.
- `docs/screenshots/hero.gif` (7.2 MB) — cosmic web → Earth descent.
- `docs/screenshots/{earth-closeup,solar-system,stars-milky-way,local-volume,cosmic-web}.jpg` — five 16:9 retina stills; captions in `docs/screenshots/README.md`.
- `docs/screenshots/old/` — the previous README set.
- `recordings/` (~10.9 GB, local only): `grand-tour-4k60.mp4` (2 MB, the only web-sized one), 4K grand-tour cuts (35 MB, 330 MB), `earthUniverseLoop` (1.1 GB, 3.7 GB), `cosmicFlows` (~190 MB), smoke-test clips.
- `public/images/famous/` (82), `famous-curated/` (80), `famous-thumb/` (72) — curated galaxy WebPs usable as editorial imagery (mind the three `"license": "unknown"` entries, see 02).
- **Copy:** `README.md` (hero blurb, "The zoom" narrative, 12-bullet Highlights, gallery captions, data-source tables, "How it works", "Direction"); `public/llms.txt` (a 40-line elevator pitch + use-case list — close to a landing-page skeleton); `CONTRIBUTING.md`; `docs/science.md`, `docs/RENDERER.md`, `docs/DATA.md`, `ATTRIBUTIONS.md`.
- **JOSS paper draft:** `docs/superpowers/plans/2026-05-05-outreach-and-promotion/task-3-joss-paper.md` — a complete ~1000-word `paper.md` + inline `paper.bib`. `paper/` was never written out. Stale against v0.5.0 (says 48-byte format and three catalogs; reality is 64-byte SKMP v9 and ~9 sources).
- **Outreach posts** in `.../2026-05-05-outreach-and-promotion/posts-and-emails/`: `hn-show.md` (title + ~250-word origin story — good "why I built this" copy), Bluesky threads, four subreddit drafts, four academic emails.

## 5. Analytics and SEO

- **SEO is thorough.** `index.html` carries description, keywords, canonical, the full OpenGraph set, Twitter `summary_large_image`, and a JSON-LD `SoftwareApplication` block with the DOI as `identifier`. A comment there warns that description / og / twitter / JSON-LD are copies of one pitch that must be edited together.
- `public/robots.txt` — allow-all with explicit opt-ins for the AI crawlers; `Sitemap:` directive.
- `public/sitemap.xml` — single URL, `lastmod 2026-05-05` (**stale**); a docs site needs entries added.
- `public/_headers` — cache rules only, no CSP.
- **Analytics: none in the repo.** The "80–100 visitors/day" figure comes from the Cloudflare dashboard. Fonts load from Google Fonts (an external request, relevant to any privacy claim).
- CI (`.github/workflows/ci.yml`) is the only workflow: typecheck + lint + test. No deploy or docs workflow.

## 6. Prior plans

- **No website / docs-site / landing / about item anywhere** in `docs/BACKLOG.md` or the plans folders. (`2026-09-14-site-rung.md` is a camera-ladder "site" rung, unrelated.)
- Closest prior art: the outreach plan, `docs/superpowers/plans/2026-05-05-outreach-and-promotion/` (README + TODO first). `task-7-product-hunt.md` and `task-8-edtech-blogs.md` hold positioning guidance reusable for the homepage: lead with the grabbiest visual, reveal depth second, state the WebGPU requirement up front.
- **The plan's "Voice" section is the binding brand guideline:** _"Skymap is a personal didactic project that happens to be a useful tool… never 'next-generation cosmology platform'. Astronomers smell hype. The README's existing tone is the right register."_
- Shared blocker across the outreach tasks: a 20–30 s flythrough clip was never recorded.

## 7. Design language to match

- **Fonts:** headlines Cormorant Garamond SemiBold (600), loaded from Google Fonts and matching the in-scene MSDF atlas (`public/fonts/cormorant.*`); UI `ui-monospace, 'SF Mono', Menlo, monospace`.
- **Tokens:** single source `src/styles/global.css` `:root`. bg `#000`; fg `#e8eeff`; accent `#a8d0ff`; surfaces `rgba(8,12,28,.55–.72)`; blur 10–12 px; type scale 8–13 px; one off-token gold `#ffd97a`.
- **Stated look:** "dark glassmorphic blue-tinted panels floating over a black starfield, monospace UI typography, restrained motion." Every surface is translucent and washes out on light backgrounds, so a light-themed site cannot reuse the components as-is. Suggested backdrop from `ds-bundle/README.md`: `radial-gradient(120% 120% at 70% 20%, #0b1022 0%, #04060d 70%)`.
