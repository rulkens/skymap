---
name: add-data-source
description: Use when adding a new data source or featured category to skymap — a new survey catalog feeding the point cloud, or (the common case) a new featured structure category / POI type rendered as marker rings + labels (cluster / supercluster / void / group and the four Milky Way categories are the existing eight). Triggers like "add a data source", "add a new structure category", "add galaxy groups / walls / a new POI layer", "wire up a new survey". Maps the full edit surface so no parallel site is missed.
---

# `/add-data-source` — add a new data source or featured category

## Overview

skymap has two kinds of "data source", with very different edit surfaces:

- **Path A — a new survey catalog** feeding the galaxy point cloud (like SDSS /
  2MRS / GLADE). New parser → `crossMatch` → `.bin`. Mostly file-plumbing; the
  conventions live in **CLAUDE.md → "Adding a new raw data source"**. This skill
  cross-references that and adds the `Source`-enum touchpoints.

- **Path B — a new featured structure category / POI type** rendered as marker
  rings + text labels (the existing eight are `cluster` / `supercluster` /
  `void` / `group` and `open-cluster` / `globular-cluster` / `nebula` /
  `galactic-centre`). This is the common case and the one this skill maps in
  detail. The edit surface is a registry row plus a handful of typed tables;
  the rest derives from the registry.

**The core hazard (read this first).** The `SOURCE_REGISTRY` row is the single
home of a structure category's identity; settings, counts, pick decode, search,
deep links and the marker and label passes derive from it. What remains
hand-edited is a short list: the source code, the row, the style row, the record
arm, the build switch and the seed parser. The first four are
**totality-checked** (`Record<StructureId, …>` tables and exhaustive `switch`es
that **fail to compile** when you add a category), so a red typecheck walks you
to them. The seed parser's per-category rules are **silent**: nothing forces a
new category's fields to be validated, and a miss is a bad seed row reaching the
renderer. If you find yourself adding a second hand-maintained list of
categories, derive it from `STRUCTURE_IDS` or the registry instead.

## When to use

- Adding a new marker-bearing featured category (groups, walls, filaments-as-POIs).
- Adding a new survey catalog to the point cloud (Path A — then mostly CLAUDE.md).

**Not** for: adding one famous galaxy (`/add-famous`); rebuilding existing bins
(`build-tiers`); re-syncing unchanged data.

## First principle: seed real data early

Before wiring the rest, get **real data on screen**. Add the seed/parser and
a handful of real entries **right after the parser**, not as a final task — the
rest of the work (styles, fades, framing, counts) is impossible to judge without
something to look at. This was the single biggest process lesson from the group
work (memory `feedback_seed_data_early`). Order: type union → parser/seed →
**seed real rows** → render path → presentation → UI.

## Path A — a new survey catalog (point cloud)

The common case: **a source row inside the `galaxyCatalog` Layer**
(`src/layers/galaxyCatalog/sources/`), not a new Layer. The nine existing
galaxy-catalog sources (SDSS, 2MRS, GLADE, …) each get their own
`sources/<id>.ts` row file inside the Layer; `sources/galaxyCatalogSourceRows.ts`
lists them in draw/UI order and the Layer composes them into the global
`SOURCE_REGISTRY` (`src/data/sources.ts`, still the single cross-Layer table —
the `Source` code enum stays global, per the layer-composition spec). Adding a
tenth survey is a new row file plus a line in that list, not a new Layer.

A genuinely **new Layer** (a new family with its own renderers/settings/passes,
like the planned `starCatalog` or `structure` Layers) is a much bigger edit —
see `docs/superpowers/specs/2026-09-09-layer-composition-design.md` §9 for the
folder shape, and don't start one for what's really a tenth catalog.

1. Follow **CLAUDE.md → "Adding a new raw data source"** for the file plumbing:
   `data/raw/<catalog>/` subdir, register every file in
   `tools/utils/io/rawDataRegistry.ts`, provenance `README.md` (auto-tracked by
   the `data/raw/**/README.md` glob — no gitignore edit), a fetcher mirroring
   `tools/fetch/fetchHyperLeda.ts`.
2. Write the parser in `tools/parsers/` (consult the VizieR ReadMe for byte
   offsets — they live next to the data file).
3. Add a `Source` enum member + a `sources/<id>.ts` row inside the Layer whose
   family it joins (galaxy catalogs: `src/layers/galaxyCatalog/sources/`; see
   Path B step 2 for a structure-category row — the rule is identical). A
   survey source persists to `.bin`, so its code is **append-only and
   load-bearing forever**.
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
- **Build entry** — `tools/stars/buildStars.ts`, run via `npm run build-stars`, emits the per-tier `public/data/stars-{small,medium,large}.bin`.
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
  exactly: an `enabled` master plus `items: Record<StarCatalogId, StarCatalogItemSettings>`, driven from `StarsSection` the way `galaxyCatalogs`
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
  and an f64 origin seam. `starCatalogPass` (in `frame/passes/`) draws it and
  owns the crossfade to the procedural Milky-Way cloud — whose fade band lives in
  exactly one home, the registry row's `crossfadePc`, evaluated per source. Don't
  reuse the galaxy point renderer or `galaxyCatalogFormat.ts` machinery for star
  data; both the encoding and the draw path diverge (see the Binary format
  bullet above).

## Path B — a new featured structure category

Worked against the four Milky Way categories (`open-cluster`, `globular-cluster`,
`nebula`, `galactic-centre`, 2026-10). Replace `X` with your category. A category
is a registry row plus a few typed tables; most of what used to be hand-listed is
now derived from the registry. Edit in this order and let `npm run typecheck`
walk you to anything missed.

### The edit surface

| #   | Site               | File                                                                                                                                                | What it decides                                                                                 |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Source code        | `src/data/source.ts`                                                                                                                                | The append-only pick code (rules below)                                                         |
| 2   | Registry row       | `src/data/sources/<x>.ts` (new, a `StructureSourceEntry`) + import and line in `src/data/sources.ts`                                                | `id`, `slab`, `galaxyMembers`, the copy fields `detailLabel` / `shortLabel` / `plural`          |
| 3   | Non-survey guard   | `src/utils/math/galaxyType.ts` (`case Source.X`)                                                                                                    | Keeps the `switch` exhaustive; a structure has no galaxy type                                   |
| 4   | Record arm         | `src/@types/data/structure/StructureInfo.d.ts` (`XRecord` + the union)                                                                              | The category's own fields, if any (`nebulaKind`, `lineOfSightAssumed`)                          |
| 5   | Style row          | `src/services/engine/presentation/structureMarkerStyles.ts`                                                                                         | Colours, sizes, `visibleBand`, `labelPlacement`; a `Record<StructureId, …>`, so it fails to compile |
| 6   | Fade band (if new) | `src/services/engine/presentation/scaleFadeBands.ts`                                                                                                | Only when no existing band fits; otherwise point `visibleBand` at one                           |
| 7   | Build switch       | `src/data/structure/buildStaticAnchorStructures.ts` (`SeedEntry` fields + `case 'x'`)                                                               | Maps a seed row to the record arm; the switch is exhaustive over `StructureId`                  |
| 8   | Seed parser        | `tools/parsers/parseStructureSeed.ts`                                                                                                               | Per-category fields: what is required, what is rejected elsewhere                               |
| 9   | Card row (if any)  | `src/components/InfoCard/StructureDetailCard/StructureDetailCard.tsx`; copy beside it in `src/data/structure/` (`nebulaKindLabels.ts`)                       | A per-category fact such as a nebula's Type                                                     |
| 10  | Seed rows          | `data/seeds/structure_anchors.seed.json` (plain `git add`)                                                                                          | The data; fields below                                                                          |
| 11  | Tests              | `tests/data/structureAnchors.test.ts`, `tests/tools/parsers/parseStructureSeed.test.ts`, `tests/data/structure/buildStaticAnchorStructures.test.ts` | Seed sanity, each parser rule, each new arm; a band test in `structureVisibleBands.test.ts` if the band is new |

### Source code (step 1)

- **Append-only, never renumber.** Codes are packed into the pick texture in a
  **6-bit** field, and the all-ones value **63 is the reserved sentinel**
  (`selectionEncoding.ts`). Structure codes are pick-only, never persisted, but
  the discipline is the same. The last code in use is 36
  (`GalacticCentrePlace`); **37..62 are free**. Re-read `source.ts` rather than
  trusting this line, and update the remaining-range note in its docblock.
- The pick decode (`unpackPick`) does not map codes to categories, so there is
  no inverse table to keep in step.

### Registry row (step 2)

- `slab` — which projection slab's marker pass and label director draw the
  category: `'cosmo'` for Mpc-scale structures, `'near0'` for parsec-scale ones
  (COSMO's near plane is 10 kpc, so anything smaller needs NEAR0's adaptive
  planes). `STRUCTURE_IDS_BY_SLAB` is read from it, so the two marker passes and
  the label producers partition the categories the same way.
- `galaxyMembers` — `true` when the category is a region of the extragalactic
  galaxy distribution: the InfoCard counts member galaxies inside it. It does
  **not** decide focus dimming, which applies to every structure; only the count
  is tied to it. Parsec-scale categories say `false`.
- `bearsLabel` and `bearsMarker` are `true` and `labelLayer` is `'structure'`
  for every structure row; copy the neighbour's row.

### Style row (steps 5, 6)

Colour, size and fade fields as for any structure; the two that carry a decision:

- `visibleBand` — the camera-distance band over which the category's rings, halos
  and labels are visible. Cosmic categories use `surveyDeepZoom`, Milky Way ones
  `galacticStructures` (full inside the Galaxy, gone at the foreground gate).
- `labelPlacement` — `'centre'` puts the label on the ring; `'above'` puts it
  just over the ring's top edge with a fixed pixel gap
  (`STRUCTURE_LABEL_ABOVE_GAP_PX`), for categories whose rings stay on screen
  at large sizes. A focused structure's label can leave the screen; that is accepted.

Tuning: a higher `markerMinApparentRadiusPx` makes the marker fade out at a
_nearer_ distance. Focus framing is uniform (`structureFocusDistance.ts`,
`FOCUS_FILL` times the apparent radius); no per-category edit.

### Seed parser and seed rows (steps 8, 10)

- Add the category's own fields to `StructureSeedEntry` and validate them beside
  the existing checks: `nebulaKind` is required on `nebula` and rejected
  elsewhere; `lineOfSightAssumed` is accepted on `galactic-centre` only.
  `SeedEntry` in `buildStaticAnchorStructures.ts` mirrors the fields it reads.
- Every row has `distance`, `physicalRadius` and `apparentRadius` as
  `{ value, unit }` (`pc` / `kpc` / `Mpc`), in the unit the source publishes.
- `source` — the paper, survey or bibcode the numbers came from. **Required for
  every category on the `near0` slab** (derived from the registry, not a list in
  the parser); build-time documentation only, never shipped.
- `wikipedia` — the exact English article title after redirects, for the card's
  link. Optional; verify it, never derive it from the name. A row without one
  shows no link.

### Derived: no edit needed

Everything below reads `STRUCTURE_IDS` or the registry and widens with your row:
the Settings toggles and their counts, `emitCounts`, the pick decode, the
selection row's deep-link claim (`${category}-${seed.id}`, matched by category
prefix; add a test only if your id could collide with another category's
prefix), the search chip and palette rows, default marker and label visibility,
`StructureId`, the marker renderers' buckets, and the marker and label passes
(chosen by `slab`). `BULK_CATALOG_CATEGORIES` in `assetWiring.ts` is the one
list not derived: add the category **only if** it has a bulk `.ccat`, which a
seed-only category does not.

## Verify

- `npm run typecheck` clean (this is what flushes the totality sites).
- `npm test` — add the parser, seed-sanity and build tests from step 11.
- Visual: `/dev` + `/link-data`, then confirm the category renders (rings +
  labels where `labelPlacement` says), the **Settings toggle shows a count**,
  clicking a ring opens the InfoCard, the card's Wikipedia link opens the right
  article, and the selected ring brightens.

## Commit & ship

- **Stage specific paths** — never `git add -A`/`.` (the repo has unrelated
  gitignored build artifacts). Format **only** touched files.
- Branch + PR; commit under the user's git identity with the
  `Co-Authored-By: Claude …` trailer (project rules).
- A seed-only category (like `group` or the Milky Way ones) ships no `.bin` — code + seed only. A new
  survey or a category with a bulk `.ccat` also needs `build-tiers` +
  `sync-r2-secure` **from the main checkout** (worktrees have throwaway
  `public/data/`).
