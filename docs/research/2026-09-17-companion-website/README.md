# Companion website — research sweep

**Status:** brainstorm paused 2026-09-17, before the first design decision. Nothing is designed or agreed yet; this folder is the context sweep that the brainstorm will resume from.

**Ask:** a proper website beside the tool — a well-thought-out homepage plus extensive docs covering how the code works and references for algorithms and data.

**Provenance:** five read-only subagent sweeps over `main` at `845720549`. The per-area files are those reports, lightly cleaned. Claims were not individually re-verified — open the cited file before leaning on a specific one. One spot-check was run: no WebXR code exists in `src/` or `tools/`, so the site must not advertise VR.

| File                                                       | Covers                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| [01-web-presence.md](01-web-presence.md)                   | identity, deploy topology, assets, copy, SEO, design language            |
| [02-data.md](02-data.md)                                   | sources, pipeline, binary formats, pipeline algorithms, attribution gaps |
| [03-architecture-features.md](03-architecture-features.md) | engine, Layers, state, user-facing feature inventory, ADRs, tour docs    |
| [04-rendering.md](04-rendering.md)                         | the frame, techniques + references, precision, perf, doc gaps            |
| [05-science-references.md](05-science-references.md)       | bibliography, implemented models, admitted caveats, doc readiness        |

## Headline findings

- **The raw material is far larger than the public docs suggest**: ~124 completed specs, 67 research files, 11 ADRs, 8 tool READMEs, 19 per-source `data/raw/*/README.md`, 34 `shaders/lib/*.wesl` headers that read as prose. The site is mostly curation and editing, plus a handful of pages that must be written new.
- **Hosting precedent exists.** `npm run build` already chains three extra Vite builds into `dist/` subfolders (`/galaxy/`, `/mcpm/`, `/flow/`), registered in `tools/utils/io/toolPages.ts`. A subpath of `skymap.rulkens.com` reuses the Worker, `_headers` and the R2 CORS allow-list; a subdomain needs `tools/deploy/r2Cors.json` edited. `not_found_handling = "single-page-application"` means every docs path needs a real `index.html`.
- **No prior website plan** anywhere in `docs/BACKLOG.md` or the plans folders. The only non-app page today is `src/unsupportedPage.ts`.
- **No user-facing help exists at all.** Keyboard shortcuts are hard-coded in `NavigationPanel`, URL params live only in `src/state/url/hashParamSources.ts`, and nothing explains what the settings toggles do.
- **Voice is already ruled** by the outreach plan: "a personal didactic project that happens to be a useful tool", never hype. A "Known simplifications" page fits that voice — the repo already admits every item (see 05).
- **`tools/utils/io/rawDataRegistry.ts`** (~180 keys with `description` / `upstream` / `fetcher` / `readme`) can generate the data-source table rather than hand-writing it.
- **`docs/powers-of-ten/`** is already a self-contained static page and publishes as-is.

## First-cut site map (a proposal, not agreed)

| Section                                                          | Mostly lifted from                                                                                 | Must be written                                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Home**                                                         | `README.md`, `public/llms.txt`, HN origin-story draft, `docs/screenshots/`                         | a 20–30 s flythrough clip (never recorded)                                        |
| **Guide** (controls, search, time, tours, URL sharing, settings) | —                                                                                                  | all of it                                                                         |
| **Science**                                                      | `docs/science.md`, `docs/research/atmospheres/*`, `docs/research/milky-way/literature.md`          | a consolidated "Known simplifications" page                                       |
| **Data**                                                         | `docs/DATA.md`, `ATTRIBUTIONS.md`, `data/raw/*/README.md`, table from `rawDataRegistry.ts`         | per-format reference pages, a scene-recon page                                    |
| **How it's built**                                               | `docs/RENDERER.md`, completed specs, ADRs, `src/layers/README.md`, `docs/references/orbit-trail-*` | frame walkthrough, scale & precision, state/saga bridge, camera, loading, picking |
| **Behind the tour** · **Powers of Ten**                          | `docs/tour/*`, `docs/powers-of-ten/`                                                               | —                                                                                 |
| **Workbenches**                                                  | links to `/galaxy/`, `/mcpm/`, `/flow/` + their READMEs                                            | —                                                                                 |
| **Cite / Credits / Contribute**                                  | `CITATION.cff`, `ATTRIBUTIONS.md`, `CONTRIBUTING.md`                                               | —                                                                                 |
| **References**                                                   | the collected bibliography (05)                                                                    | one deduplicated bibliography file                                                |

## Proposed decomposition (too large for one spec)

1. Site scaffold + Home.
2. Attribution-hygiene PR (below) — worth doing regardless of the site.
3. The lifted sections: Science, Data, Credits, Tour, Powers of Ten.
4. The newly written pages, in batches.

The brainstorm would run sub-project 1 first.

## Hygiene the site would expose

- **Attribution gaps:** Milliquas has no `ATTRIBUTIONS.md` entry; the Hubble mesh has no attribution section; StarNet2 is credited nowhere; `tools/scene-recon/` is absent from `DATA.md` and `ATTRIBUTIONS.md`; no page credits the Polyphorm lineage.
- **Licence blocker:** three entries in `data/seeds/famous_curated_overrides.json` carry `"license": "unknown"` (c17, c18, c29).
- **Provenance gaps:** `data/seeds/planet_facts.seed.json` numbers, the void and group categories, the Zone of Avoidance shape constants.
- **Stale:** the H₀ comment in `src/utils/math/constants.ts` (predates the Simpson integral), `public/sitemap.xml` (lastmod 2026-05-05), the JOSS draft (48-byte format, three catalogs).
- **Do not publish** `docs/research/2026-05-03-cluster-void-visualization.md` — it carries its own unreliability banner (numbers from model training data).
- **Do not overclaim:** only 2 of 10 Layers are fully formed; the galaxy-field v2 renderer has no app-frame consumer (only `tools/galaxy-renderer`).

## Open questions, in the order to resume

1. **Primary audience** — curious visitors, developers/graphics people, astronomers, or all three layered; and if layered, who wins the hero.
2. Does the attribution-hygiene PR join the plan, and does it go first?
3. Subpath vs subdomain, and static-site tooling (not yet discussed).
