---
name: add-data-source
description: Use when adding a new data source or featured category to skymap — a new survey catalog feeding the point cloud, or (the common case) a new featured structure category / POI type rendered as marker rings + labels (cluster / supercluster / void / group are the existing four). Triggers like "add a data source", "add a new structure category", "add galaxy groups / walls / a new POI layer", "wire up a new survey". Maps the full edit surface so no parallel site is missed.
---

# `/add-data-source` — add a new data source or featured category

## Overview

skymap has two kinds of "data source", with very different edit surfaces:

- **Path A — a new survey catalog** feeding the galaxy point cloud (like SDSS /
  2MRS / GLADE). New parser → `crossMatch` → `.bin`. Mostly file-plumbing; the
  conventions live in **CLAUDE.md → "Adding a new raw data source"**. This skill
  cross-references that and adds the `Source`-enum touchpoints.

- **Path B — a new featured structure category / POI type** rendered as marker
  rings + text labels (the existing four are `cluster` / `supercluster` /
  `void` / `group`). This is the common case and the one this skill maps in
  detail, because the edit surface is **wide, parallel, and only partly caught
  by the type system**. The `group` category (PR for nearby-galaxy-groups,
  2026-06-04) touched ~20 sites; this skill is the checklist distilled from it.

**The core hazard (read this first).** A structure category's identity is
re-encoded across many files. Some sites are **totality-checked** —
`Record<StructureCategory, …>` / `Record<PoiCategory, …>` tables that **fail to
compile** when you add a category. Those are your friends: the red typecheck is
a checklist that walks you to each one. But several sites are **silent** — `||`
chains, hand-maintained inverse maps, `Partial<Record>` lookups, runtime
enumeration tests, copy-pasted defaults. Nothing forces those to agree, and a
miss is a runtime bug (wrong ring clicked, no count shown, category invisible).
**Lean on the compiler for the loud sites; use the table below for the silent
ones.** When you find yourself editing a second hand-maintained list, that is
the duplication the `STRUCTURE_CATEGORY_META` backlog item exists to kill — note
it, don't invent a third.

## When to use

- Adding a new marker-bearing featured category (groups, walls, filaments-as-POIs).
- Adding a new survey catalog to the point cloud (Path A — then mostly CLAUDE.md).

**Not** for: adding one famous galaxy (`/add-famous`); rebuilding existing bins
(`build-tiers`); re-syncing unchanged data.

## First principle: seed real data early

Before wiring the 20 sites, get **real data on screen**. Add the seed/parser and
a handful of real entries **right after the parser**, not as a final task — the
rest of the work (styles, fades, framing, counts) is impossible to judge without
something to look at. This was the single biggest process lesson from the group
work (memory `feedback_seed_data_early`). Order: type union → parser/seed →
**seed real rows** → render path → presentation → UI.

## Path A — a new survey catalog (point cloud)

1. Follow **CLAUDE.md → "Adding a new raw data source"** for the file plumbing:
   `data/raw/<catalog>/` subdir, register every file in
   `tools/utils/io/rawDataRegistry.ts`, provenance `README.md` (auto-tracked by
   the `data/raw/**/README.md` glob — no gitignore edit), a fetcher mirroring
   `tools/fetch/fetchHyperLeda.ts`.
2. Write the parser in `tools/parsers/` (consult the VizieR ReadMe for byte
   offsets — they live next to the data file).
3. Add a `Source` enum member + `SOURCE_REGISTRY` row (see Path B step 3 — the
   rule is identical). A survey source persists to `.bin`, so its code is
   **append-only and load-bearing forever**.
4. Wire it into `crossMatch` / `buildAllBins`. If the per-galaxy layout changes,
   that's a format bump (`galaxyCatalogFormat.ts`), and a bump needs the full
   checklist, not just a version constant:
   - regenerate every tier's bins via `npm run build-tiers`,
   - the bins land under the family's new `v<N>` epoch folder
     (`public/data/galaxy-catalog/v<N>/`) — the folder name tracks the format
     module's own `VERSION` export, never hand-typed at a call site (see
     docs/DATA.md → "Data layout: family/epoch folders"),
   - re-sync R2 (`npm run sync-r2-secure`) and purge the CDN so old clients
     stop being served the previous epoch's now-stale bins.

   A **new** binary family (not a bump to an existing one, e.g. a source that
   doesn't fit `galaxyCatalogFormat.ts` at all) gets its own `<family>/v<N>/`
   folder and its own epoch-prefix constant, the same pattern as
   `galaxy-catalog/v9/`. Either way, every runtime-fetched file must be added
   to `allowDataFile` (`tools/deploy/r2/allowDataFile.ts`), or it is never
   hashed, never manifested, and never uploaded — see docs/DATA.md's
   "Content hash + manifest" section.

5. Surveys carry photometry/orientation — mind the per-catalog gotchas in
   CLAUDE.md (2MRS negative cz, GLADE PGC cross-match, SDSS column variance).

### Sidebar: the star-catalog pipeline (Gaia) is a third shape

The Milky-Way star bin (Gaia DR3 + GCNS + Hipparcos-2) is neither a Path A
survey nor a Path B POI category — it's a distinct catalog with its own
binary format family. Treat it as a sibling precedent, not a Path A instance:

- **Raw-data registry** — `gaia.*` keys in `rawDataRegistry.ts` follow the
  same registry pattern (CLAUDE.md → "Adding a new raw data source"), but the
  fetcher is TAP-paged (ADQL queries against the ESA Gaia archive) with an
  on-disk resume cache, not a single-file download. Consumers reach the paged
  directory via `rawDataPath('gaia.dir')` plus per-artifact keys for the
  fixed files (`gaia.gcns`, `gaia.hipparcos`, …).
- **Binary format** — `src/data/starCatalog/` is a _separate_ format module
  from `galaxyCatalogFormat.ts`: cell-quantized + compressed, sized for tens
  of millions of stars rather than millions of galaxies. Don't reuse
  `galaxyCatalogFormat.ts` machinery for star data — the encodings diverge.
- **Build entry** — `tools/stars/buildStars.ts`, run via `npm run
build-stars`, emits the per-tier `public/data/stars-{small,medium,large}.bin`.
- **R2 sync** — a new binary family needs its own entries in
  `tools/deploy/r2/allowDataFile.ts`, same step as adding a new galaxy-catalog
  tier.
- **Attribution** — add an `ATTRIBUTIONS.md` checklist item for the new
  upstream catalog (Gaia DR3 / GCNS / Hipparcos-2); the entries themselves are
  a data-acquisition concern, not this skill's.

### Runtime surface: the `starCatalog` source-type family

The star bin has a full runtime edit surface that runs _parallel_ to the
galaxy-catalog one — a distinct `starCatalog` source-type family, not a
special-case of the survey path. A future star-like source (curated famous
stars, say — Decision A) mirrors these seams rather than inventing new ones.
Walk them in the same registry row → settings cluster → fetcher/slot/wiring →
renderer/layer order the galaxy catalogs use:

- **Registry row + id domain** — a `type: 'starCatalog'` `SOURCE_REGISTRY` row
  (`src/data/sources/gaia-stars.ts` is the template). `StarCatalogId`
  (`@types/data/starCatalog/StarCatalogId`) is the `type: 'starCatalog'`
  narrowing of the source-entry union, and `STAR_CATALOG_IDS`
  (`src/data/starCatalog/starCatalogIds.ts`) its auto-widening runtime list —
  the star-only analogue of the galaxy-catalog id domain. Add the row and both
  widen with no further edit.
- **Settings cluster** — `settings.starCatalogs` mirrors `settings.galaxyCatalogs`
  exactly: an `enabled` master plus `items: Record<StarCatalogId,
StarCatalogItemSettings>`, driven from `StarsSection` the way `galaxyCatalogs`
  drives its survey rows. The two clusters share shape — no divergent per-item
  accessor.
- **Fetcher + slot + wiring** — one source-parameterized `starCatalogFetcher`
  and one `starCatalogSlot` factory serve _every_ `starCatalog` row
  (parameterized by `source`), the same reuse seam the galaxy catalogs use.
  `assetWiring` mints the per-source rows and keys them into
  `state.assetSlots.starCatalogs` — a separate slot map from the galaxy slots in
  the same numeric key space (see `slotFor.ts`), so tier reloads flow through
  the shared machinery.
- **Renderer + layer** — a dedicated per-source `starCatalog/` renderer family
  (`src/services/gpu/renderers/starCatalog/` + `shaders/starCatalog/`):
  vertex-pulling billboards, BP−RP tint, additive HDR, an octree draw-cut walker
  and an f64 origin seam. `starCatalogLayer` (in `frame/passes/`) draws it and
  owns the crossfade to the procedural Milky-Way cloud — whose fade band lives in
  exactly one home, the registry row's `crossfadePc`, evaluated per source. Don't
  reuse the galaxy point renderer or `galaxyCatalogFormat.ts` machinery for star
  data; both the encoding and the draw path diverge (see the Binary format
  bullet above).

## Path B — a new featured structure category

Worked against adding `group`. Replace `X` / `Xs` with your category. Do them
roughly in this order; run `npm run typecheck` after step 1 and let the red
errors guide you to the totality sites.

### The edit-surface checklist

| #   | Site                      | File                                                                                             | Caught by compiler?                      |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 1   | Category union            | `src/@types/engine/data/StructureCategory.d.ts`                                                  | — (the source of truth)                  |
| 2   | Record arm                | `src/@types/engine/data/StructureRecord.d.ts` (`XRecord` + union)                                | ✅ downstream                            |
| 3   | `Source` enum + registry  | `src/data/sources.ts` (append code, registry row)                                                | partial                                  |
| 3b  | Non-survey guard          | `src/utils/math/galaxyType.ts` (`case Source.X`)                                                 | ✅                                       |
| 4   | Pick decode               | `src/data/selectionEncoding.ts` (`PickResult` kind + `unpackPick`)                               | ⚠️ **silent** inverse map                |
| 4b  | WESL pick parity          | `src/services/gpu/shaders/lib/selectionEncoding.wesl` (`SOURCE_CODE_X`)                          | ⚠️ parity test only                      |
| 5   | Click guard               | `src/services/engine/interaction/clickHandler.ts` (`\|\| kind === 'X'`)                          | ⚠️ **silent**                            |
| 6   | Seed parser               | `tools/parsers/parseStructureSeed.ts` (`VALID_CATEGORIES`)                                       | ⚠️ **silent**                            |
| 7   | Marker style row          | `src/services/engine/presentation/structurePoiStyles.ts`                                         | ✅ totality Record                       |
| 8   | Build records             | `src/data/buildStaticAnchorStructures.ts` (`SeedEntry.category` + switch)                        | ✅ switch exhaustiveness                 |
| 9   | Marker renderer           | `src/services/gpu/renderers/structureMarkerRenderer.ts` (**~11 sites**, below)                   | mixed                                    |
| 10  | UI naming                 | `src/data/poiCategoryInfo.ts` (`label` / `shortLabel` / `plural`)                                | ✅ totality Record                       |
| 11  | Settings lists            | `src/components/SettingsPanel/SettingsPanel.tsx` (`STRUCTURE_CATEGORIES`, `LABEL_CATEGORIES`)    | ⚠️ **silent** arrays                     |
| 12  | Bulk-fetch gate           | `src/services/engine/wiring/assetWiring.ts` (`BULK_CATALOG_CATEGORIES`)                          | ⚠️ include **only if** it has a `.ccat`  |
| 13  | Focus predicate           | `src/services/engine/subsystems/structureFocusSubsystem.ts` (`\|\| category === 'X'`)            | ⚠️ **silent**                            |
| 14  | Settings count            | `src/services/engine/wiring/wireStructureProjection.ts` (`emitCounts`)                           | ⚠️ **silent** — no count shown if missed |
| 15  | Visibility defaults       | `useEngineSettings.ts` ×2, `engine.ts` ×2, **+ test fixtures**                                   | ⚠️ **copy-paste ×8**                     |
| 16  | Debug panel               | `src/components/DebugPanel/LabelEffectsSection.tsx` (`CATEGORIES`)                               | ⚠️ **silent**                            |
| 17  | Seed data                 | `data/seeds/structure_anchors.seed.json` (re-included by `!/data/seeds/*.json`; plain `git add`) | —                                        |
| 18  | Runtime enumeration tests | `tests/data/poiCategories.test.ts` (key counts, "N-category" titles)                             | ⚠️ **silent** — assert the new total     |

`structureMarkerRenderer.ts` is the densest — the ~11 sites: `SOURCE_CODE_BY_CATEGORY`,
`POI_CATEGORIES_WITH_MARKERS`, the per-category `Record` literals
(`bucketOffsets` / `bucketCounts` / `sourceBuffers` / `sourceBindGroups` /
`writeCursor`), the `setMarkers` reset / count-guard / write-guard, and the
**bucket-offset ordering** (`bucketOffsets.X = bucketOffsets.<prev> + bucketCounts.<prev>`
— append the new bucket **last**). Decide the halo policy: `void` skips its halo
(`if (cat === 'void') continue` near the halo pass); a normal category does not.

### Source-code rules (steps 3, 4)

- **Append-only, never renumber.** Source codes are packed into the pick texture
  and (for surveys) persisted to `.bin`. Take the next free integer. POI-only
  codes are pick-only (not persisted) but still append-only — code 31 is the
  reserved all-ones sentinel; don't use it. See the docstring in `sources.ts`.
- **`unpackPick` is a hand-maintained inverse** of `SOURCE_CODE_BY_CATEGORY`.
  Nothing makes them agree — get them consistent and trust the
  `selectionEncoding` parity test (TS ⋈ WESL) to catch the WESL half.

### Presentation knobs (step 7)

`structurePoiStyles.ts` carries label/ring/halo colour, the close-approach
fade-out (`markerMaxApparentRadiusPx` + band), and the far-distance fade-out
(`markerMinApparentRadiusPx` + band). Tuning notes from the group work:

- **Far-distance fade** (`markerMinApparentRadiusPx`): higher = fades out at a
  _nearer_ distance. Groups use a high floor (Local Volume feature, read up
  close); clusters a low one (visible far out).
- **Focus framing** auto-frames the structure so its _apparent_ radius lands just
  past the close-approach fade — handled uniformly in `poiFocusDistance.ts`
  (`FOCUS_FILL`), no per-category edit needed.
- Colour: keep a deliberate ramp; alpha < 1 + lower luminance to recede a busy
  near-volume category under the brighter ones.

## Verify

- `npm run typecheck` clean (this is what flushes the totality sites).
- `npm test` — add/extend per-site behavioral tests **and** the runtime
  enumeration test (#18); update any "N categories" count/title.
- Visual: `/dev` + `/link-data`, then confirm the category renders (rings +
  labels in the right place), the **Settings toggle shows a count** (#14), and
  clicking a ring opens the InfoCard (pick path, #4/#9).

## Commit & ship

- **Stage specific paths** — never `git add -A`/`.` (the repo has unrelated
  gitignored build artifacts). Format **only** touched files.
- Branch + PR; commit under the user's git identity with the
  `Co-Authored-By: Claude …` trailer (project rules).
- A seed-only category (like `group`) ships no `.bin` — code + seed only. A new
  survey or a category with a bulk `.ccat` also needs `build-tiers` +
  `sync-r2-secure` **from the main checkout** (worktrees have throwaway
  `public/data/`).

## Known debt this skill should eventually lean on

The parallel-sites problem is tracked in `docs/BACKLOG.md`: a single
`STRUCTURE_CATEGORY_META` registry would _derive_ the source-code maps, the
category lists, and the marker buckets, turning many silent sites into one
table — and the `cluster*` → `structure*` naming holdovers (seed file, parser,
renderer) are the matching rename. If you're adding the _third_ category, promote
those before paying the duplication tax a third time.
