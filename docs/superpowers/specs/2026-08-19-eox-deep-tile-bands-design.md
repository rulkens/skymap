# EOX deep tile bands — design

> **Status.** Drafted, awaiting user review; not yet built.
> **Date.** 2026-08-19.
> **Relationship to prior work.** Extends the
> [Earth surface virtual texture](completed/2026-07-28-earth-surface-virtual-texture.md)
> (shipped; `docs/superpowers/plans/completed/2026-07-29-earth-surface-virtual-texture-a-to-d.md`),
> which built the BMNG-only z3–z7 pyramid, planner, atlas and page table this
> spec reshapes to carry a second, regional, deeper source.

## 1. What we're building

Earth's virtual-texture pyramid currently has one source (BMNG, z3–z7,
whole globe) and one planner that clamps against one scalar level range.
This feature adds **EOX s2cloudless** imagery at z8–z13 over a small
regional patch — Copenhagen centre — so flying down over that one city
resolves Sentinel-2 detail (9.55 m/px at z13) instead of stopping at BMNG
z7's ~611 m/texel floor.

It ships as **one pyramid, two sources**: BMNG stays the global shallow
band, EOX becomes a second, deeper, geographically-bounded band in the same
`surface` kind. The architecture is built to take more EOX regions, or a
wider harvest, as pure data — new manifest entries and new bake
invocations, no code change.

### Goals

- Copenhagen resolves EOX detail at z8–z13, on the existing atlas/page-table
  machinery, in production.
- The manifest tells the planner what's baked, so it never requests outside
  coverage (no reliance on 404 as the coverage signal).
- Adding the next region is a harvest + a bake invocation + a manifest
  entry — not a new source axis, not new planner code.

### Non-goals

- The full EOX dataset, wider harvests, or a self-hosted mirror (tracked as
  a follow-up, §9).
- A texture-kind axis (`normal` tiling) — stays out of scope;
  `docs/backlog/2026-07-30-earth-tile-kind-singularity.md` stays open.
- Runtime attribution/credits UI — pre-existing gap (no Splash credits
  surface reads `EarthImagerySource.attribution` today either), not
  addressed here.
- Resolving the BMNG-2004/Sentinel-2016 look seam algorithmically. It's
  judged visually (§7) with a named fallback if it reads as a defect rather
  than an expected imagery-generation jump.

## 2. Ground preparation

**Verdict: growth, not bolt-on — the manifest, source contract and planner
all reshape from "one scalar range" to "a band list," with BMNG becoming
the first (and, until this feature, only) entry.** A second source bolted
onto the current scalar `{min, max}` shape would need an `if (kind ===
'eox-patch')` branch somewhere in the planner or the subsystem — the thing
`docs/superpowers/conventions/simplicity.md` flags as a discriminant that
should be data, not a branch.

Prep (leading commits on the feature PR, each its own diff, BMNG as the
sole band — no behavior change):

1. **`EarthTileManifest` reshape** (§3) — `levels[kind]` becomes a band
   list; `builtFrom` folds into each band entry.
2. **`EarthImagerySource.coverage` required** (§3) — BMNG's quadrant and
   equirect sources both declare the world explicitly.
3. **`LonLatBox` → `LonLatBounds`, relocated to `src/@types/scene/`.**
   `tools/textures/LonLatBox.d.ts` already has the manifest's exact
   four-field shape (`west`/`south`/`east`/`north`, same `west < east`
   invariant) and `buildEarthTiles.ts` already imports type-only from
   `src/@types` — nothing stops the build tool importing a runtime type.
   Two structurally identical box types in two layers would drift the
   moment one gains a field the other needs; one type read by both the
   manifest schema and the build-time source protocol is the box shape,
   period. Move via `npm run move-files -- tools/textures/LonLatBox.d.ts
   src/@types/scene/LonLatBounds.d.ts` (imports auto-rewritten), then
   `npm run refactor -- rename` the exported symbol; the importers touched
   are `EarthImagerySource.d.ts`, `bmngQuadrantSource.ts`,
   `buildEarthTiles.ts`, and `tests/tools/textures/bmngQuadrantSource.test.ts`.
4. **`buildEarthTiles.bakeAll` band-list reshape** (§4).
5. **Planner band-list reshape** (§5).

**Verification that prep changed nothing observable:** re-run `npm run
build-earth-tiles -- --dev`; tile bytes and `index.txt` are byte-identical
to the pre-prep bake (same source, same levels, only the manifest's shape
differs); existing `planEarthTiles` tests pass unmodified — a single
world-spanning band collapses `earthTileBandsAllow`'s overlap test to "every
tile overlaps," which is exactly today's scalar `min`/`max` clamp.

**Greenfield cross-check.** A fresh-context derivation from the "final data
shapes" requirements (independent of this document) agreed with all
load-bearing shapes here — same band-list reshape, same required
`coverage`, same per-band `EarthTileProvenance`. One divergence it caught
and this spec adopted: the inherited shape had `builtFrom` as a single
formatted string per kind (`` `${id} — ${attribution}` ``,
`buildEarthTiles.ts:256`); the cross-check flagged that as unstructured
data forced into prose, and the spec instead carries `EarthTileProvenance`
as three separate fields per band. Two divergences were kept, with reasons:
**one `LonLatBounds` per band entry** rather than an array-of-boxes per
entry (keeps the planner's overlap test a flat scan over entries, and makes
antimeridian splitting fall out for free — a region crossing 180° is just
two entries, not a box type that itself wraps); and **`EarthTileKind` stays
the `Record` key** rather than becoming a field inside each band entry
(it's the only access pattern the planner and subsystem have — look up
"the bands for kind X" — and the kind axis is explicitly out of scope this
feature, so there's no second axis to justify a flatter list).

## 3. Data shapes

### `EarthTileManifest` (breaking; `earth-tiles/v2`)

```ts
// src/@types/scene/LonLatBounds.d.ts (moved + renamed from tools/textures/LonLatBox.d.ts)
export type LonLatBounds = {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}; // degrees; west < east, south < north — no entry crosses the antimeridian

// src/@types/scene/EarthTileProvenance.d.ts
export type EarthTileProvenance = {
  readonly sourceId: string;
  readonly attribution: string;
  readonly vintage: string;
};

// src/@types/scene/EarthTileManifest.d.ts
export type EarthTileManifest = {
  readonly prefix: string;
  readonly tilePx: number;
  readonly levels: Partial<
    Record<
      EarthTileKind,
      ReadonlyArray<{
        readonly bounds: LonLatBounds;
        readonly min: number; // shallowest baked level in this band
        readonly max: number; // deepest baked level in this band
        readonly builtFrom: EarthTileProvenance;
      }>
    >
  >;
  // top-level `builtFrom` DELETED — provenance now lives per band entry
};
```

The `builtFrom` field this deletes was a top-level `Partial<Record<EarthTileKind,
string>>` (`EarthTileManifest.d.ts:25`, one formatted string per kind); it
had nowhere to hold a second source's provenance once the world entry and
the Copenhagen entry disagree on `sourceId`/`vintage`.

Shipped v2 content: `surface` = `[{ bounds: world, min: 3, max: 7, builtFrom:
BMNG }, { bounds: copenhagenBbox, min: 8, max: 13, builtFrom: EOX }]`, with
`copenhagenBbox` ≈ `{ west: 12.4, south: 55.5, east: 12.9, north: 55.8 }`.
"World" is the entry whose `bounds` covers the whole globe (`{ west: -180,
south: -90, east: 180, north: 90 }`) — there is no separate "is this the
global band" flag; a consumer that needs to distinguish it tests the bounds.

### `EarthImagerySource` — `coverage` becomes required

```ts
// tools/textures/EarthImagerySource.d.ts
export type EarthImagerySource = {
  readonly id: string;
  readonly attribution: string;
  readonly maxLevel: number;
  /** Where this source has real pixels. BMNG declares the world explicitly
   *  — no more absent-means-global convention, so a bake writes manifest
   *  entries mechanically from the source's own claim rather than the
   *  caller's assumption about it. */
  readonly coverage: ReadonlyArray<LonLatBounds>;
  readBox(box: LonLatBounds, widthPx: number, heightPx: number): Promise<Uint8Array | null>;
};
```

`bmngQuadrantSource` and `equirectFileSource` both return `coverage: [{
west: -180, south: -90, east: 180, north: 90 }]` — a one-line addition to
each, not new behavior (§2 prep, item 2).

### `buildEarthTiles` — band-list `bakeAll`

```ts
// tools/textures/buildEarthTiles.ts
export async function bakeAll(
  bands: ReadonlyArray<{ readonly source: EarthImagerySource; readonly minLevel: number }>,
  outDir: string,
): Promise<void>;
```

Band `max` is `source.maxLevel` (unchanged from today's single-source
`buildEarthTiles`, which this function replaces as the tool's public
entry point). Per band: `bakeDeepestLevel` bakes `source.maxLevel` straight
from `source.readBox`, then `bakeCoarserLevel` derives every level down to
`minLevel` by the existing 2×2 disk-to-disk average — both functions are
unchanged; only the level-range/manifest bookkeeping around them moves from
one source to a loop over bands. One invocation writes one `index.txt` (all
bands' tiles) and one `manifest.json` (one `levels.surface` array, one
entry per band, built mechanically from each band's `source.coverage` +
`source.id`/`attribution` — no hand-typed bbox literal in the tool).
`TILE_PREFIX` bumps `earth-tiles/v1` → `earth-tiles/v2`
(`buildEarthTiles.ts:81`) per the module's own versioning rule: tiles serve
`immutable`, so a shape change needs new keys, not a mutated manifest
against old bytes.

Copenhagen's invocation: `bakeAll([{ source: await deepSource(), minLevel:
BAKE_MIN_LEVEL }, { source: await eoxTileSource({ coverageDir:
rawDataPath('eox.dir') }), minLevel: 8 }], outDir)`. EOX's `minLevel: 8` is
explicit, not derived — the "one level finer than the coarsest whole-globe
base" rule that sizes `BAKE_MIN_LEVEL` for the *global* band doesn't apply
to a regional band, whose floor is instead "one level deeper than the
global band's own max" (7 + 1 = 8), so BMNG's z7 is the last global level
and EOX picks up exactly where it stops.

### Planner — band-list `derivePlannerParams` + per-node predicates

```ts
// src/@types/scene/EarthTilePlannerParams.d.ts
export type EarthTileBand = {
  readonly uBounds: readonly [number, number]; // bounds.west/east, converted once
  readonly vBounds: readonly [number, number]; // bounds.south/north, converted once
  readonly min: number;
  readonly max: number;
};

export type EarthTilePlannerParams = {
  readonly kind: EarthTileKind;
  readonly tilePx: number;
  readonly baseLevel: number;
  readonly bands: readonly EarthTileBand[]; // replaces minTileLevel/maxTileLevel
  readonly windowSide: number;
  readonly lodBias: number;
};
```

`derivePlannerParams` (`earthTileSubsystem.ts:110`) converts each band's
`LonLatBounds` to u/v once, outside the per-frame walk — `planEarthTiles`
never touches degrees. Two predicates replace the two scalar comparisons in
`planEarthTiles.ts`:

```ts
// src/utils/scene/earthTileBandsAllow.ts (new; one function per file)
export function earthTileBandRefineAllowed(
  bands: readonly EarthTileBand[],
  z: number,
  uv: { readonly u0: number; readonly u1: number; readonly v0: number; readonly v1: number },
): boolean; // "does any overlapping band permit deeper than z?"

export function earthTileBandRequestAllowed(
  bands: readonly EarthTileBand[],
  z: number,
  uv: { readonly u0: number; readonly u1: number; readonly v0: number; readonly v1: number },
): boolean; // "does any overlapping band contain z?"
```

`planEarthTiles.ts:170` (`if (required > z && z < maxTileLevel)`) and `:184`
(`if (z < minTileLevel) continue`) become calls to these two predicates
instead of the scalar `maxTileLevel`/`minTileLevel` comparisons.
`EarthTilePlan`'s output type, the page table, atlas, uniforms, shader and
deploy collectors are all untouched — the band list only changes which
tiles get proposed, not the shape of what a frame does with them.

With one world-spanning band, both predicates degenerate to the current
scalar test exactly (§2's verification claim): every tile overlaps the
world band, so "any overlapping band" is just "the one band," and its
`min`/`max` are today's `minTileLevel`/`maxTileLevel`.

## 4. New tools

### `tools/fetch/fetchEoxTiles.ts`

Harvests EOX WMTS **z13 tiles only** — coarser levels are derived at bake
time by the existing 2×2 average, exactly as BMNG's deepest level is today.

- **URL:** `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84/{z}/{row}/{col}.jpg`
  — **`TileRow` before `TileCol`** in the path. 256 px tiles. WGS84 TMS is a
  clean power-of-two grid (z0 = 2×1, doubling per level) that lines up
  exactly with skymap's own `512 << z` ladder (`earthTileParams.ts:6-8`'s
  "matches the WGS84/EOX ladder verbatim" — z13 in both systems addresses
  the same patch of ground, no re-numbering).
- **Layer: `s2cloudless`, the 2016 layer.** The only CC BY 4.0 one; 2018+ is
  CC BY-NC-SA (ShareAlike would contaminate the JOSS-bound repo — rejected
  outright, not a tradeoff); 2017 is broken upstream.
- **CLI:** lon/lat bbox + optional `--level` (default 13).
- **Throttle:** ~2 req/s, exponential backoff on retryable failures — same
  backoff shape as `fetchDesi.ts`'s `fetchChunkWithRetry`
  (`fetchDesi.ts:180-197`, `isRetryable` at `:167-171`), adapted from
  range-chunk retries to whole-tile-fetch retries (EOX's 256 px JPEGs need
  no `Range:`/resume-by-byte machinery, just resume-by-file-existence).
- **Resume:** a tile file already on disk is skipped — no separate
  chunk-state sidecar needed at this granularity.
- **Non-image response aborts loudly.** A throttled EOX response is an HTML
  redirect, not a 4xx/5xx — `res.headers.get('content-type')` not starting
  with `image/` must throw and stop the run, mirroring
  `fetchEarthTileBitmap.ts:36-38`'s runtime check but inverted: the runtime
  treats a non-image response as a silent miss (§ existing code), the
  *fetcher* must not, or a throttled harvest silently writes HTML bytes
  with a `.jpg` extension into the tile tree.
- **Output:** `data/raw/eox/`, registered in `tools/utils/io/rawDataRegistry.ts`
  as `'eox.dir'` (`kind: 'directory'`, `source: 'gitignored'`, `fetcher:
  'tools/fetch/fetchEoxTiles.ts'`), consumers `join()` the rest per the
  registry's dynamic-output convention (`rawDataRegistry.ts` header,
  `docs/DATA.md`'s "Adding a new raw data source" step 2). Provenance
  README at `data/raw/eox/README.md` (upstream URL, tile-index convention,
  fetch date, licence) per `docs/DATA.md` step 5. Copenhagen patch ≈ 276
  tiles.

### `tools/textures/eoxTileSource.ts`

```ts
export async function eoxTileSource(opts: {
  readonly coverageDir: string; // rawDataPath('eox.dir')
}): Promise<EarthImagerySource>; // id/attribution are the source's own facts, not caller inputs
```

`readBox` composites the four 256 px EOX z13 tiles under one 512 px bake
tile — 2×2 at the **same** z (EOX's ladder already equals skymap's, §
above), the same per-child-shrink-then-composite pipeline
`bakeCoarserLevel` uses and for the identical libvips reason
(`buildEarthTiles.ts:150-160`): compositing before resizing is a
correctness requirement, not style. `coverage` is the harvest's own bbox
(read from what's on disk under `coverageDir`, not hand-typed — a harvest
that doesn't reach the requested bbox edge should shrink the manifest
entry, not silently claim ground it doesn't have). `maxLevel` is `13`.
Returns `null` for any box outside the harvested tiles — same contract as
every other source, letting `bakeDeepestLevel`'s existing "a decline emits
no tile" branch (`buildEarthTiles.ts:118-119,134`) do the sparse-pyramid
work unmodified.

Attribution string (verbatim, per EOX's licence text), split into
`EarthTileProvenance`:

```ts
{
  sourceId: 'eox-s2cloudless-2016',
  attribution:
    'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH ' +
    '(Contains modified Copernicus Sentinel data 2016) released under ' +
    'Creative Commons Attribution 4.0 International License.',
  vintage: '2016',
}
```

### `ATTRIBUTIONS.md`

New subsection under "NASA — Earth & Moon imagery" (`ATTRIBUTIONS.md:330`),
alongside the existing Blue Marble entries: **EOX IT Services — EOxCloudless
(Sentinel-2)**, carrying the attribution string above and noting CC BY 4.0.
There is no runtime credits UI to wire this into — a pre-existing gap
(`EarthImagerySource.attribution` is read by nothing today either),
explicitly out of scope here.

## 5. Deploy

Deploy collectors (`tools/deploy/r2/collectEarthTiles.ts`,
`collectEarthTileManifest.ts`) read `index.txt` and `manifest.json` off
disk by path — both are **prefix-agnostic**, so the `v1` → `v2` bump needs
no collector change. The manifest's `prefix` field is the atomic cutover:
until it flips, the runtime keeps requesting `v1` tile URLs against
whatever the CDN already has cached; once `manifest.json` is overwritten
with the `v2` prefix, every subsequent fetch addresses `v2` keys. v2
re-uploads ~110 MB of BMNG tiles (immutable, new keys, since `v1`'s BMNG
keys are byte-identical but versioned) plus a few MB for the Copenhagen
patch. Sync via `npm run sync-r2-secure`, from the **main worktree only**,
post-merge (`docs/DATA.md`'s data-refresh re-run order; worktrees don't own
`data/`, memory `project_worktree_data_isolation`).

**Cache-skew during rollout is accepted, not adapted for.** The manifest is
served with a short (1-day) cache header while the JS bundle that reads it
is content-hashed and effectively instant. For up to a day after deploy, a
client can hold a stale `v1` manifest against a fresh bundle — this is
already true today for every manifest field, not a new risk this feature
introduces, and it degrades to base-only (no `levels.surface` entry the
client understands, or a 404 on a stale-prefixed tile) rather than
corrupting anything. No transitional shape adapter — reading both `v1` and
`v2` manifest shapes in one client build would be the kind of "must
remember to handle both" braid `docs/superpowers/conventions/simplicity.md`
flags; the existing null-collapse (`fetchEarthTileManifest.ts:22-26`,
`derivePlannerParams`'s `if (!levels) return null`) already turns "shape I
don't recognize" into "base-only," which is the correct transient behavior
for free.

## 6. The BMNG/Sentinel look seam

BMNG is August 2004 topography+bathymetry; EOX s2cloudless is 2016
Sentinel-2. At the z7→z8 boundary around Copenhagen, colour grading and
imaging date both jump. This is an **accepted risk**, judged during the
visual pass (§7), not designed away — no colour-matching pass, no
cross-fade. **Fallback if the seam reads as jarring rather than as an
expected "you've zoomed into a sharper source" transition:** bake the
Copenhagen region's z3–z7 from EOX too, trading the global seam at z7→z8
for a smaller regional seam at the Copenhagen bbox edge (z3–z7 BMNG outside
the patch meeting z3–z7 EOX inside it). That fallback is a second manifest
entry with a shallower `min` and the same source, not a code change — the
band-list architecture already carries it.

## 7. Verification plan

**Unit** (judged by `docs/superpowers/conventions/testing.md`'s "will it
ever fail on a real bug no other test catches?"):

- `earthTileBandRefineAllowed`/`earthTileBandRequestAllowed`: overlap
  against a single band, overlap against two disjoint bands (Copenhagen
  case), an antimeridian-split pair (two entries, a query box straddling
  180°), and the degenerate single-world-band case reproducing today's
  scalar `minTileLevel`/`maxTileLevel` behavior bit-for-bit.
- `bakeAll`: two bands in one invocation write one merged `index.txt`/
  `manifest.json` with two `levels.surface` entries in band order.
- Manifest fetch/parse: a v1-shaped (or otherwise unrecognized) manifest
  collapses to `null`, not a throw.

**Visual** (dev server, user's eyes — the only judge of §6):

- Fly to Copenhagen; EOX detail resolves at z8–z13 with no seam artifacts
  worse than the accepted BMNG/Sentinel jump.
- `EARTH_TILE_LOD_BIAS` still reads sane at the new depth (no obvious
  over/under-refinement at z12–z13).
- Atlas/page-table pressure unaffected outside the patch (BMNG-only regions
  behave exactly as before — nothing here touches their code path).

**Then:** `npm run sync-r2-secure` from the main worktree, verify the CDN
serves `v2` tiles and the flipped manifest.

## 8. File inventory

New:

```
tools/fetch/fetchEoxTiles.ts
tools/textures/eoxTileSource.ts
src/@types/scene/LonLatBounds.d.ts        (moved + renamed from tools/textures/LonLatBox.d.ts)
src/@types/scene/EarthTileProvenance.d.ts
src/utils/scene/earthTileBandsAllow.ts    (or two files, one predicate each — implementer's call)
data/raw/eox/README.md
tests/** mirroring the above
```

Modified:

```
src/@types/scene/EarthTileManifest.d.ts       (band-list levels, builtFrom deleted)
src/@types/scene/EarthTilePlannerParams.d.ts  (bands: readonly EarthTileBand[])
tools/textures/EarthImagerySource.d.ts        (coverage required)
tools/textures/bmngQuadrantSource.ts          (coverage: world)
tools/textures/equirectFileSource.ts          (coverage: world)
tools/textures/buildEarthTiles.ts             (bakeAll band-list, TILE_PREFIX v2)
src/utils/scene/planEarthTiles.ts             (band predicates replace scalar clamps)
src/services/engine/subsystems/earthTileSubsystem.ts  (derivePlannerParams → bands)
tools/utils/io/rawDataRegistry.ts             ('eox.dir' entry)
ATTRIBUTIONS.md                               (EOX section)
tests/tools/textures/bmngQuadrantSource.test.ts (LonLatBounds import)
```

Untouched (explicitly, per §5's contract): page-table builder, atlas, GPU
uniforms, shaders, deploy collectors.

## 9. Open follow-ups (not this feature)

- EOX bulk-access email before any wide harvest beyond hand-picked patches
  (courtesy/ToS, per the 2026-07-28 EOX research).
- More regions means more `fetchEoxTiles` invocations and more manifest
  band entries — each is a data change against this architecture, not a
  design change.
- A self-hosted EOX mirror, if bulk access or rate limits make live-fetch
  harvesting impractical at wider scale.

## References

- [Earth surface virtual texture — design](completed/2026-07-28-earth-surface-virtual-texture.md) — the pyramid, planner and subsystem this spec reshapes
- [Earth surface virtual texture — plan A–D](../plans/completed/2026-07-29-earth-surface-virtual-texture-a-to-d.md) — as-built file map and Design-N rationale cited inline above
- [`docs/backlog/2026-07-30-earth-tile-kind-singularity.md`](../../backlog/2026-07-30-earth-tile-kind-singularity.md) — the kind-axis work this spec explicitly does not touch
- [`docs/DATA.md`](../../DATA.md) — raw-data registry conventions, data-refresh re-run order
- [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md), [`simplicity.md`](../conventions/simplicity.md)
- `tools/fetch/fetchDesi.ts` — throttle/backoff/resume reference pattern for `fetchEoxTiles.ts`
- Memory facts: 2026-07-28 EOX research session (curl-verified WMTS URL shape, row/col order, licence terms per layer year)
