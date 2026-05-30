# Plan 2 — Cluster/Supercluster Coverage: Runtime + Rendering + Deploy

**Goal:** Render the ~375 catalog-driven structures from Plan 1's
`clusters.ccat` as rings/halos weighted by significance + distance fade,
label only the featured subset (with a light screen-space declutter), and
ship the new artefacts to R2. Preserve today's synchronous Virgo/Coma
deep-links.

**Architecture:** Two POI load timings, mirroring the existing
famous-galaxy pattern. **Featured (sync):** `buildStaticAnchorPois` reads the
bundled `cluster_anchors.seed.json` (Vite JSON import) → `featured: true`,
labeled, deep-linkable, feeds the CF-4 audit. **Bulk (async):** a new asset
slot fetches `clusters.ccat` + `clusters_meta.json` through `dataUrl()`,
decodes via `clusterCatalogFormat`, builds `featured: false` POIs, and
merges them into `poiSubsystem` via the same `rewire`-on-arrival path
`wireSlots` uses for famous POIs. `PointOfInterest` gains `featured` +
`significance`; `produceMarkers` weights ring/halo by `significance`,
`produceLabels` gates on `featured` + runs a light declutter.

**Tech Stack:** TS + WebGPU runtime. Reuses `ClusterMarkerRenderer`,
`clusterMarkersPass`, the label layer, the `AssetSlot` machinery
(`createAssetSlot`, `Fetcher`, `dataUrl`). No new GPU pipelines. Deploy via
`tools/deploy/syncR2.ts` + `public/_headers`.

> **For agentic workers:** Plan 2 depends on Plan 1 being complete
> (`clusterCatalogFormat`, the seed JSON, `parseClusterSeed`). Read the spec
> §6–§10 and `docs/superpowers/conventions/plan-style.md`. Conventions
> (`CLAUDE.md`): `type` not `interface`; `Vec3`/`Vec2` aliases; deep
> relative imports, no barrels; didactic comments; never `git add -A`. Be
> meticulous with the marker/label math — it's visual and easy to get
> subtly wrong; verify in the running dev server (do NOT kill it). Use the
> `superpowers:test-driven-development` skill per task.

---

## Task 1 — `PointOfInterest` gains `featured` + `significance`

**Files:** `src/@types/engine/subsystems/PointOfInterest.d.ts` (modify),
`src/data/buildStaticAnchorPois.ts` (modify),
`src/services/engine/phases/buildPoisFromFamousMeta.ts` (modify),
`tests/**` touching POI construction (update).

Add two readonly fields (didactic comments matching the file's style at
`PointOfInterest.d.ts:48-67`):
```ts
/**
 * Whether this POI is a hand-curated "featured" structure. Gates label
 * rendering (only featured POIs get labels — drawing ~375 labels is noise)
 * and deep-link eligibility (the sync drain can only resolve featured ids).
 * Bulk catalog POIs set false; cluster/SC/void anchors + famous galaxies
 * set true.
 */
readonly featured: boolean;
/**
 * Normalized significance in [0,1] driving ring brightness / size weight.
 * For clusters this is a normalized M500; superclusters a normalized Nm;
 * featured anchors + famous galaxies default to 1 (always full weight).
 * Optional so producers that don't compute it (today: none, once migrated)
 * fall back to full weight at the render site.
 */
readonly significance?: number;
/**
 * Abell/ACO catalog designation where known (e.g. 'A1656' for Coma),
 * surfaced directly so the InfoCard can show it. Set from the seed's
 * `abell` (featured) or the meta sidecar's `abell` (bulk); omitted when
 * the structure has no Abell number (Virgo, superclusters, voids).
 */
readonly abell?: string;
```

- [ ] Set `featured: true` on every POI built by `buildStaticAnchorPois`
  (Task 2 sources them from the seed) and `buildPoisFromFamousMeta`
  (`buildPoisFromFamousMeta.ts:120`). Famous POIs: `significance` omitted
  (→ full weight).
- [ ] Test (extend `tests/data/buildStaticAnchorPois.test.ts`) `every static
  anchor POI is featured` asserting `.every(p => p.featured === true)`.
- [ ] Test (extend the famous-POI test) `famous POIs are featured`.
- [ ] `npm run typecheck` green; `npm test` green. Commit.

---

## Task 2 — `buildStaticAnchorPois` reads the bundled seed JSON

**Files:** `src/data/buildStaticAnchorPois.ts` (modify),
`tests/data/buildStaticAnchorPois.test.ts` (modify).

Plan 1 Task 7 already pointed this at the seed JSON for the interim cutover;
this task locks in the final shape: import the seed JSON at build time (Vite
JSON import — stays synchronous, the load-bearing property for deep-links per
spec §6) and emit `featured: true` POIs with category-prefixed ids matching
today's slugs.

**Before/after (the data source line):**
```
- import { CLUSTER_ANCHORS, SUPERCLUSTER_ANCHORS, VOID_ANCHORS, raDecDistToEqCart } from './clusterAnchors';
+ import clusterSeed from '../../data/cluster_anchors.seed.json';
+ import { raDecDistToEqCart } from '../utils/math/raDecDistToEqCart';
```
(Validate the imported JSON once via `parseClusterSeed` — or, if importing
the tool parser into `src/` is undesirable, inline a lightweight
`src`-side guard. Prefer reusing the tool parser only if it has no
node-only imports; otherwise keep the existing slug+map logic and trust the
build-time-validated JSON.)

**Id rule (unchanged):** `${category}-${slug(commonName ?? names[0] ?? id)}`
so `Virgo (M87)` → `cluster-virgo-m87` still resolves the existing
`#poi=cluster-virgo-m87` deep-links. Carry `physicalRadiusMpc` +
`apparentRadiusMpc` from the seed; `featured: true`; `significance: 1`; and
`abell` from the seed entry when present (omit otherwise).

- [ ] Test `buildStaticAnchorPois produces cluster-virgo-m87 from the seed`
  asserting the id is present (deep-link regression guard).
- [ ] Test `buildStaticAnchorPois carries physical + apparent radius from the seed`.
- [ ] Test `buildStaticAnchorPois categorizes seed entries by their category field`
  (one cluster, one supercluster, one void present).
- [ ] Test `buildStaticAnchorPois is synchronous and returns a fresh array per call`.
- [ ] Implement. The `src/` JSON import works under the existing
  `tsconfig.json` (`resolveJsonModule: true` is already set,
  `tsconfig.json:12`) and Vite resolves JSON imports natively — no config
  change needed. (Note: this is the FIRST `src/`-side JSON import; the famous
  seed is read at tool time only, so there's no prior precedent in `src/`.)
- [ ] `npm run typecheck` + `npm test` green; dev server still draws the
  featured anchors. Commit.

---

## Task 3 — Cluster-catalog fetcher + decode

**Files:** `src/services/loading/fetchers/clusterCatalogFetcher.ts` (new),
`src/@types/loading/ClusterCatalogPayload.d.ts` (new),
`tests/services/loading/fetchers/clusterCatalogFetcher.test.ts` (new).

Mirror `famousMetaFetcher.ts` but fetch BOTH artefacts (binary `.ccat` +
JSON meta) and decode. The payload pairs the decoded numeric catalog with
the string sidecar so the merge (Task 5) has names + descriptions.

**Payload type:**
```ts
import type { ClusterCatalog } from '../data/ClusterCatalog';
export type ClusterMetaEntry = { id: string; names: string[]; abell: string | null; description: string };
export type ClusterCatalogPayload = {
  catalog: ClusterCatalog;
  meta: readonly ClusterMetaEntry[];
};
```

**Request type + signature:** The cluster catalog is a standalone boot-time
asset (like filaments), NOT a galaxy-source companion, so it does not use
`CompanionAssetReq`. Use a void/empty request — mirror the filament slot's
request shape (read `filamentSlot.ts` / its fetcher for the exact `Fetcher`
type arg; if the filament fetcher uses `{ tier: Tier }`, use a tier-agnostic
`Record<string, never>` or whatever empty shape the `Fetcher` generic
expects).
```ts
export function parseClusterMeta(rawJson: string): ClusterMetaEntry[]; // throws on non-array
export const clusterCatalogFetcher: Fetcher<ClusterCatalogPayload, ClusterCatalogReq>;
// where `ClusterCatalogReq` is the empty/void request shape (no tiering).
```
**Behaviour:** `fetch(dataUrl('clusters.ccat'))` + `fetch(dataUrl('clusters_meta.json'))`
(both honoring `signal`); non-2xx → `HttpError`; decode the `.ccat`
ArrayBuffer via `decodeClusterCatalog`; parse the meta; assert
`catalog.count === meta.length` (fail loud — the two are built in lock-step,
a mismatch means a stale artefact).

- [ ] Test `parseClusterMeta rejects a non-array root`.
- [ ] Test `clusterCatalogFetcher decodes the ccat and pairs it with meta`
  (mock both `fetch` responses with a small encoded `.ccat` from
  `encodeClusterCatalog` + matching meta; assert payload `catalog.count` and
  `meta` length).
- [ ] Test `clusterCatalogFetcher throws HttpError on 404`.
- [ ] Test `clusterCatalogFetcher throws on count/meta length mismatch`.
- [ ] Implement. `npm test -- clusterCatalogFetcher` → passes. Commit.

---

## Task 4 — Cluster-catalog asset slot

**Files:** `src/services/loading/slots/clusterCatalogSlot.ts` (new),
`src/@types/engine/state/EngineState.d.ts` (modify — add
`assetSlots.clusterCatalog` + `sources.clusterBulkPois` or similar),
`tests/services/loading/slots/clusterCatalogSlot.test.ts` (new).

Mirror `famousMetaSlot.ts` (`SlotFactory`, no GPU commit — the payload is
CPU-side POI data merged into `poiSubsystem`). On `ready`, write the decoded
payload to engine state and `requestRender()`; on `error`, write empty +
`console.warn` (graceful degradation — bulk clusters simply don't appear, the
featured anchors and the rest of the app keep working).

**Signature:** `export const createClusterCatalogSlot: SlotFactory<ClusterCatalogPayload, …>;`

**State additions:** a place to stash the decoded payload so the merge
function (Task 5) can read it. Add `state.sources.clusterBulk: ClusterCatalogPayload | null`
(default `null`) following the `state.sources.famousMeta` precedent
(`famousMetaSlot.ts:31`).

- [ ] Test `createClusterCatalogSlot writes the payload to state on ready`.
- [ ] Test `createClusterCatalogSlot writes null/empty on error and warns`.
- [ ] Implement slot + state field. `npm test -- clusterCatalogSlot` →
  passes. Commit.

---

## Task 5 — Bulk POI builder + async merge in `wireSlots`

**Files:** `src/services/engine/phases/buildPoisFromClusterCatalog.ts` (new),
`tests/services/engine/phases/buildPoisFromClusterCatalog.test.ts` (new),
`src/services/engine/phases/wireSlots.ts` (modify).

Mirror `buildPoisFromFamousMeta.ts` (pure producer) + the famous async-merge
wiring (`wireSlots.ts:171-193` `rewireFamousPois`).

**Producer signature:**
```ts
export function buildPoisFromClusterCatalog(
  payload: ClusterCatalogPayload,
): PointOfInterest[];
```
**Behaviour:** for each record `i`: `worldPos` from `positions[i*3..]`;
`category` = `'cluster'` (byte 0) / `'supercluster'` (byte 1) — map the
`ClusterCategoryByte`; `physicalRadiusMpc`/`apparentRadiusMpc` from the
arrays; `id = ${category}-bulk-${meta[i].id}` (the `-bulk-` infix keeps bulk
ids from ever colliding with a featured slug — and signals non-deep-linkable
in the id itself); `name = meta[i].names[0]`; `featured: false`; `abell = meta[i].abell ??
undefined` (carry the Abell designation through to the POI for the InfoCard);
`significance` = the **normalized** value in [0,1]. **Normalize
per-category, not across the whole catalog** — clusters carry `M500`
(solar masses) and superclusters carry `Nm` (member count); a single
min-max over the mixed array would make a 30-member supercluster compete
with a 10¹⁴-M☉ cluster on the same scale. Compute one normalization over
the cluster subset and a separate one over the supercluster subset
(log-scaled, since `M500` spans orders of magnitude — document the
choice). Bulk POIs set NO `minApparentSizePx` (the marker fade handles
their visibility; they have no thumbnail path).

**wireSlots wiring:** add a `rewireClusterPois()` analogous to
`rewireFamousPois`. The full merged POI list is now
`[...staticAnchorPois, ...famousPois, ...clusterBulkPois]`. Refactor the
existing single-source `setPois` calls into one `rebuildAllPois()` that
concatenates whichever of the three groups are currently available, so
famous-arrival and cluster-arrival both call the same merge (avoids one
arrival clobbering the other's contribution — today `rewireFamousPois` sets
`[...staticAnchorPois, ...famousPois]`, which would drop bulk clusters).

- [ ] Test `buildPoisFromClusterCatalog maps category bytes to cluster/supercluster`.
- [ ] Test `buildPoisFromClusterCatalog marks every POI not featured`.
- [ ] Test `buildPoisFromClusterCatalog normalizes significance per-category into [0,1]`
  (the max-M500 cluster → 1 and the max-Nm supercluster → 1 independently;
  all values within [0,1]; a mixed fixture proves the two categories don't
  share one scale).
- [ ] Test `buildPoisFromClusterCatalog ids are prefixed bulk and never collide with featured slugs`.
- [ ] Test `buildPoisFromClusterCatalog carries the abell designation from meta`
  (meta entry with `abell: 'A2670'` → `POI.abell === 'A2670'`; `abell: null`
  → `POI.abell` undefined).
- [ ] Implement the producer.
- [ ] Refactor `wireSlots` to a single `rebuildAllPois()` merge; mint +
  `load()` the cluster slot (boot-time, tier-agnostic, like famous-meta);
  subscribe to its `ready` to call `rebuildAllPois()`. Register the slot in
  `allSlots` for the loading-bar aggregator (mirror `famousMetaSlot`
  registration at `wireSlots.ts:237`).
- [ ] Test (wireSlots-level, if a harness exists) or a focused merge test
  `merging famous then bulk clusters keeps both groups present`.
- [ ] `npm test` + `npm run typecheck` green. Commit.

---

## Task 6 — Significance + distance weighting in `produceMarkers`

**Files:** `src/services/engine/subsystems/poiSubsystem.ts` (modify),
`tests/services/engine/subsystems/poiSubsystem.test.ts` (modify).

Rings/halos already draw for all POIs with a radius (`produceMarkers`,
`poiSubsystem.ts:590-711`). Add significance weighting so low-significance
distant clusters stay faint (spec §7 "structure, not fog"). The existing
distance fades (`markerMin/MaxApparentRadiusPx`) are unchanged — this
multiplies an additional significance factor into the baked halo + ring
alpha.

**Change:** at the alpha-bake site (`poiSubsystem.ts:667-699`), multiply
`fadeAlpha` (or the final `haloColor[3]`/`ringColor[3]`) by a significance
weight:
```
sigWeight = SIG_MIN_ALPHA + (1 - SIG_MIN_ALPHA) * (p.significance ?? 1)
```
with `SIG_MIN_ALPHA` a tunable floor (e.g. 0.25) so the faintest bulk
cluster is dim but not invisible. Featured anchors (`significance` omitted →
1) and famous galaxies are unaffected.

- [ ] Test `produceMarkers dims a low-significance POI relative to a high one`
  (two POIs identical except `significance` 0.1 vs 1.0 at the same distance →
  the low one's ringColor alpha is strictly smaller).
- [ ] Test `produceMarkers leaves featured anchors (no significance) at full weight`
  (a POI with `significance` undefined matches the pre-change alpha — guard
  with the existing snapshot/assertion style).
- [ ] Implement the weight. Add `SIG_MIN_ALPHA` constant with a comment.
- [ ] `npm test -- poiSubsystem` → passes. Verify in dev: bulk rings appear
  as a graded field, featured rings unchanged. Commit.

---

## Task 7 — Label gating on `featured` + screen-space declutter

**Files:** `src/services/engine/subsystems/poiSubsystem.ts` (modify),
`tests/services/engine/subsystems/poiSubsystem.test.ts` (modify).

`produceLabels` (`poiSubsystem.ts:380-588`) currently labels every
visible POI with a radius. Gate it on `featured` and add a light
screen-space declutter among the (≤~30) featured labels.

**Changes:**
1. Early-skip non-featured POIs: after the visibility gate
   (`poiSubsystem.ts:403`), `if (!p.featured) continue;` — drawing ~375
   labels is the noise this gate prevents (spec §1, §7).
2. **Declutter:** collect candidate featured labels with their projected
   screen position (the label code already computes `worldPos` + the camera
   has a projection — compute screen XY via the same per-frame matrices the
   label renderer uses, or project `worldPos` through `ctx`). Sort by
   `significance` desc (featured default 1 → ties broken by existing order);
   greedily accept a label only if its screen-space bounding box (approx:
   `pixelSize`-derived box around the projected anchor) does not overlap an
   already-accepted label within a `DECLUTTER_MARGIN_PX`. Because the
   candidate set is tiny, O(n²) greedy is fine (spec §7 "far simpler than
   top-N-of-375"). Voids/SCs/clusters/famous are all subject to the same
   declutter once featured.

   Keep this *light*: it culls only on genuine overlap, not a global
   top-N. Famous galaxies, which already self-gate via `minApparentSizePx`,
   participate but rarely collide.

- [ ] Test `produceLabels emits no label for a non-featured POI`
  (bulk cluster POI with a radius → present in `produceMarkers` output but
  absent from `produceLabels` labels).
- [ ] Test `produceLabels still labels a featured POI`.
- [ ] Test `produceLabels declutters overlapping featured labels keeping the higher significance`
  (two featured POIs projecting to overlapping screen boxes → only the
  higher-significance label survives; place them at known world positions +
  a known camera so projection is deterministic).
- [ ] Test `produceLabels keeps non-overlapping featured labels both` (sanity
  that declutter doesn't over-cull).
- [ ] Implement gate + declutter. Add `DECLUTTER_MARGIN_PX` constant with a
  comment. `npm test -- poiSubsystem` → passes.
- [ ] Verify in dev: ~30 featured labels, no bulk labels, no overlap pile-ups
  in Shapley. Commit.

---

## Task 8 — Deploy: syncR2 ALLOW

**Files:** `tools/deploy/syncR2.ts` (modify),
`tests/tools/deploy/syncR2.test.ts` (modify or create if absent).

Note on `_headers`: the spec §10 mentions `public/_headers`, but `_headers`
governs **Workers Assets** (the static shell — JS/CSS/WGSL/WASM +
`images/famous/*.webp`), NOT the R2-served `/data/*` artefacts. The
`.ccat` + `_meta.json` are R2-served (like `famous.bin`/`famous_meta.json`,
which are also absent from `_headers`); their Cache-Control is set
per-object by `syncR2.ts` (`CACHE_CONTROL = 'public, max-age=86400'`,
`syncR2.ts:84`). So **no `_headers` change is needed** — the syncR2 ALLOW
extension is the whole deploy task. (`public/data/` is already wholesale-
gitignored at `.gitignore:125`, so the artefacts stay out of git as
intended.)

- [ ] Extend the `ALLOW` filter (`syncR2.ts:89-111`) to accept
  `clusters.ccat` and `clusters_meta.json` (two explicit `name === …`
  clauses, mirroring the `famous.bin` / `famous_meta.json` clauses).
- [ ] Test `syncR2 ALLOW accepts clusters.ccat and clusters_meta.json`
  (assert the `ALLOW` predicate returns true for both names) and `ALLOW
  still rejects glade.bin / sdss.bin` (regression — those untiered legacy
  names must stay excluded).
- [ ] Implement. `npm test -- syncR2` → passes. Commit.

---

## Task 9 — Docs + run-order

**Files:** `CLAUDE.md` (modify).

- [ ] Note in the deploy section that a full cluster refresh is
  `build-clusters` → `sync-r2-secure` (the `.ccat` + `clusters_meta.json` ride
  the same R2 sync as the `.bin` files). Add `clusters.ccat` +
  `clusters_meta.json` to the "complete R2 sync must include" list near the
  `famous.bin` mention.
- [ ] No test; `npm test` + `npm run typecheck` green. Commit.

---

## Definition of done (Plan 2)

- The ~375 catalog structures render as rings/halos, weighted by
  significance (faint distant low-mass clusters, bright featured anchors) and
  faded by camera distance.
- Only the ~25–30 featured structures show labels; overlapping featured
  labels declutter by significance.
- A selected cluster carrying an Abell designation shows it in the POI
  InfoCard (`poi.abell`, e.g. "Abell 1656") — the field is plumbed from both
  the seed and the bulk meta; surface it where the InfoCard renders the POI
  name/category.
- `#poi=cluster-virgo-m87` / `#poi=supercluster-coma-sc` /
  `#poi=void-bootes-void` deep-links still resolve synchronously (regression
  test in Task 2).
- `npm run sync-r2-secure` uploads `clusters.ccat` + `clusters_meta.json`.
- `npm test` + `npm run typecheck` green; dev-server visual check confirms
  the populated cosmic web with labeled featured structures.
