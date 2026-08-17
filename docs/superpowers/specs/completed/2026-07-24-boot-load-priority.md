# Boot load priority

**Status:** approved design, spec'd 2026-07-24. Every decision below was settled in
[`docs/grill-sessions/boot-load-priority-2026-07-24.md`](../../grill-sessions/boot-load-priority-2026-07-24.md)
(20 questions, with the rejected alternatives recorded there). This spec is written against
that transcript and against the code as it stands; it does not re-open settled questions.
Where the code contradicted a claim made during the grill, the correction is recorded in
"Corrections to the grill record" at the end.

## Problem

At default settings (tier `medium`) a cold boot fetches about 101.7 MB: `stars-medium.bin`
30.0, `glade-medium.bin` 26.3, `mcpm-medium.scfd` 19.4, `milliquas-medium.bin` 12.8,
`sdss-medium.bin` 10.1, `2mrs.bin` 2.5, plus sidecars. `evaluateRows`
(`reevaluateDemand.ts:86-119`) walks `ASSET_WIRING` in array order and calls `slot.load(...)`
for every idle row whose `demand(ctx)` is true. Those calls are fire-and-forget, fully
parallel and unbounded, so under HTTP/2 every asset shares one connection and starves every
other. Array order is trigger order, never completion order.

Three consequences:

1. **No ordering.** The star field the Earth boot view actually needs competes on equal terms
   with GLADE, which `surveyDeepZoom` (`scaleFadeBands.ts:66`, `goneAt: 0.002` Mpc) fades to
   zero at solar-system distances.
2. **No bound.** Reordering alone would change nothing: without a concurrency limit all
   requests still fire at once and split the pipe.
3. **Arriving before the texture.** Body textures are proximity-gated on the live camera
   (`assetWiring.ts:200-217`), so a body reached before its texture lands draws through
   `planetRenderer` as a flat albedo sphere.

The loading system was designed when the app had no stars, no textured planets, and a Milky
Way boot framing. Those assumptions no longer hold.

## Decisions

Carried from the grill; the reasoning lives there.

- **The bound is the mechanism, not an optimisation** (Q3). A bounded-concurrency priority
  queue at the `AssetSlot` fetch layer. The galaxy-thumbnail queue is left alone: it governs
  many small streaming fetches during flight, not a handful of big one-shot boot fetches.
- **Priority is a static authored integer, not a computed score** (Q2, Q5, Q8). The axis is
  relevance to the target scale rung, and the demand predicates already gate scale-irrelevant
  assets out of the queue, so the scheduler only ever orders currently-demanded assets. It
  needs no positional input at all: no camera, no focus destination, no re-scoring.
- **Payload size is folded into the authored integer** (Q10). Shortest-job-first is real
  (small assets free their slot fast), but a declared `expectedBytes` would go stale the
  moment a tier shifts. The row count is small enough that a human folds it in and the table
  stays readable.
- **Never preempt** (Q11). `AssetSlot`'s `AbortController` means "demand is gone", a different
  concept from preemption; responses are not resumable; and the fallback atlas removes the
  visual urgency that would motivate it.
- **N = 2** (Q12). Lower N is better for time-to-first-visible under HTTP/2: N=1 idles the
  wire during `.bin` parse, N=4 reintroduces the splitting being removed.
- **A universal low-resolution body-texture set, delivered as one atlas** (Q6, Q7). Rather
  than predicting where the camera is going, every body always has something to show. Hard
  budget of 1 MB.
- **The atlas is a transport format, not a sampling format** (Q17). Tiles are cropped into the
  existing per-body GPU textures at upload. No shader change, no binding change, no uniform
  change, no UV remap, no seam gutters, no iOS shader-validation exposure.
- **The atlas tile is each body's placeholder** (Q17). Not a first-class texture that eviction
  has to reason about.
- **Assumed, not enforced: no coordination with the thumbnail queue** (Q12). At the Earth boot
  view the galaxy point clouds are faded out, so no thumbnails are requested. The thumbnail
  queue is idle exactly when boot contention matters.

## Ground preparation

Ideal-diff pass run 2026-07-24; this section records its checkpoint, approved by the user.

**Growth (seams exist, no prep needed):**

- `priority` on `AssetWiringRow` (`src/@types/loading/AssetWiringRow.d.ts:80-107`). The row is
  already a declarative lifecycle contract carrying `key` / `factory` / `req` / `demand` /
  `release?` / `built?`. One more field.
- `'bodyTextureAtlas'` on `AssetKey` (`src/@types/loading/AssetKey.d.ts:71-81`). The union
  already hosts exactly this singleton-sidecar shape (`famousGalaxiesMeta`, `constellations`, `flow`),
  each a named field on `EngineAssetSlots`; `installSlots.ts` writes any string key straight to
  `state.assetSlots[key]` and `slotFor.ts:68` reads it back, so both seams widen for free.
- `QueueEntry` (`src/@types/loading/QueueEntry.d.ts`) already carries `key` and `priority`.
  The contract matches as-is.
- `partitionBodiesByPresentation` (`partitionBodiesByPresentation.ts:70-108`) already takes
  `isTextureResident` as an injected predicate and is pure, so redefining residency is one
  line in the adapter `sceneBodyPartition.ts`.
- Atlas membership DERIVES from `BODY_TEXTURE_REGISTRY` (`src/data/bodies/bodyTextureRegistry.ts`).
  Explicitly do NOT introduce a hand-maintained parallel list of atlas members: the registry
  docblock states it is deliberately the only enumeration of the textured-body set, and both
  the runtime clamp and the build tier-set already derive from it.

**Bolt-on (missing joints), and the prep that creates each. Each is its own commit, sequenced
before any feature commit.**

- **P1 — per-instance concurrency limit.** `priorityQueue.ts` imports
  `MAX_CONCURRENT_FETCHES` module-globally (`:50`, read at `:120`), so it cannot be 2 for the
  asset queue and 4 for thumbnails. Prep: make the limit a constructor argument defaulting to
  the current value. Its one existing caller is `galaxyAtlasSubsystem.ts:54`, unchanged.
- **P2 — `load()` reports completion.** `AssetSlot.load(req)` returns `void`
  (`AssetSlot.d.ts:9`; impl `AssetSlot.ts:217-225`), so the queue cannot know when a slot
  frees and the concurrency bound would be a lie: it would count fetch *starts*, not
  occupancy. Prep: return `Promise<void>` resolving AFTER commit. This makes an existing fact
  visible rather than adding behaviour, since the work is already async and the slot merely
  declines to say so.
- **P3 — residency is a rendering fact, not a loading fact.** `sceneBodyPartition.ts:49-52`
  infers "this body has a texture" from "the `bodyTextures` slot's `current()` is non-null".
  The atlas makes the two diverge: texture present, slot idle. The naive fix
  (`atlasReady || slotReady`) is a second branch on the same discriminant, two sources of
  truth for one fact. Prep: residency reads the renderer's own texture map.
- **P4 — placeholders become per-(body, kind).** `texturedBodyRenderer.ts` keys
  `placeholderMaps` by KIND only (`:186`), resolved in `buildBindGroup` as
  `res.maps.get(kind) ?? placeholderMaps.get(kind)!` (`:305`). The atlas tile is per-BODY, and
  the naive fix is a third term in that chain. Prep: replace the shared map with a
  per-(body, kind) resolver so the chain stays two-term,
  `res.maps.get(kind) ?? placeholderFor(bodyId, kind)`. This also makes eviction correct BY
  CONSTRUCTION: `clearMap` (`:390-400`) falls back through the resolver to the atlas tile
  rather than 1x1 grey, so the known landmine (a slot reading `ready` while its GPU texture
  has been destroyed) cannot reproduce. The same two-layer shape is what prevents an
  out-of-order atlas commit overwriting an already-landed hi-res map.

**Decided at the checkpoint:**

- **Ring dropped from the atlas (2026-07-24).** The ring source is 2048x125, not a 512x256
  tile, so it forced non-uniform per-tile rects. Its content is its alpha, so it forced a
  WebP-with-alpha container for the whole atlas. Its full-tier texture is only 8,832 bytes, so
  it arrives almost immediately on its own and gains little from a fallback tier. Dropping it
  cuts P4 from four renderer sites to two: `ringRenderer` and `atmosphereShellRenderer` never
  gain atlas-placeholder wiring, because there is no ring tile to seed them with. See "Corrections
  to the grill record" for how this was found.
- P4 lands twice, because `texturedBodyRenderer` and `earthRenderer` each need atlas-placeholder
  wiring for a surface tile. `texturedBodyRenderer` needs the per-(body, kind) resolver above;
  `earthRenderer` needs only the plumbing to accept a placeholder bitmap, since it has no
  `clearMap` and so gets no eviction-correctness benefit from P4, only the out-of-order-arrival
  protection (see "Corrections to the grill record"). Consolidating body-texture storage across
  renderers project-wide was considered and deliberately deferred to the backlog
  (`docs/backlog/2026-07-24-body-texture-store-consolidation.md`): that concern is broader than
  this feature (it covers renderers the atlas never touches) and prep here is scoped to exactly
  the delta this feature needs.
- **PR packaging: everything on one PR.** Prep commits (P1 to P4) land first, then the feature
  commits. Prep, adjacent cleanup, and feature remain three different diffs even though they
  ride one PR. Never conflate them in a single commit.

## Design

### 1. The bounded asset queue

One `PriorityQueue<void>` per engine, owned as
`state.subsystems.assetQueue` (a non-null, constructed-at-createEngineState field, like
`scheduler` and `fades`). `evaluateRows` enqueues instead of calling `slot.load()` directly.

```ts
// src/utils/concurrency/priorityQueue.ts (P1 + the drop edge)
class PriorityQueue<T = ImageBitmap | null> {
  constructor(limit?: number); // defaults to MAX_CONCURRENT_FETCHES
  drop(key: string): void;     // removes a PENDING entry; an in-flight one is untouched
}

// src/utils/concurrency/assetQueueConcurrency.ts
export const ASSET_QUEUE_CONCURRENCY = 2;
```

Three facts about the existing queue that the wiring must respect:

- **`popHighestPriority` pops the LARGEST `priority`** (`priorityQueue.ts:154-167`), while the
  rank table reads lower-is-first. The enqueue site negates: `priority: -row.priority`. Not
  hidden in the queue, which keeps serving thumbnails where larger-on-screen-is-first is the
  natural reading.
- **The dedup key is a string**, and `AssetKey` is a union of numeric `Source` codes and
  string keys. The enqueue key is `String(row.key)`; no string `AssetKey` is a bare numeral,
  so the two spaces cannot collide.
- **Re-enqueue is already safe** (`priorityQueue.ts:78-90`): in-flight is a no-op, pending is
  replaced. So the per-frame `evaluateRows` re-run cannot double-start or storm.

The load edge of `evaluateRows` becomes:

- `idle && demand(ctx)` -> `queue.enqueue({ key: String(row.key), priority: -row.priority, fetcher, onResult: noop })`.
- `idle && !demand(ctx)` -> `queue.drop(String(row.key))`.

The drop edge is a THIRD edge in the loop, not a variant of the existing evict edge, and it
has to be: a queued-but-unstarted slot is still `idle`, so `release()` never fires for it and
the existing `ready`-gated evict branch cannot see it. Without the drop, a body texture queued
as the camera approached would still fetch minutes after the camera left. `release()` on a
`ready` slot reaches the same drop on the next pass, since it returns the slot to `idle` with
demand false.

The enqueued closure is:

```ts
async () => {
  if (slot.state().kind !== 'idle') return;   // see below
  await slot.load(row.req(state.tier));
}
```

Two deliberate properties of that closure:

- **The idle guard is re-evaluated at start time.** `evaluateRows` checks it to decide whether
  to enqueue; the closure checks it again because the queue introduces a gap between decision
  and action, during which a direct `.load()` (a tier transition, a companion load) may have
  claimed the slot. This is one predicate evaluated at two moments, not two copies of a
  policy.
- **`req` is computed at start time too.** `state` is the live engine state, so a tier change
  while an entry sits pending yields the request for the tier in force when it actually runs,
  not the one that was current when it was queued.

`load()` resolving after commit (P2) is what makes the bound honest. It resolves on every
terminal path, including the early returns for `AbortError`, `gave-up`, and a failed
race-check, so an abandoned load frees its slot immediately rather than pinning it.

**Scope boundary, stated rather than hidden:** direct `.load()` call sites bypass the queue.
They are the tier-transition fan-out (`makeRunTierTransition.ts:65,72,84`), companion loads
(`galaxyCatalogSourceRegistry.ts:156`), `forceReload()`, and the DEV synthetic volume
(`maybeLazyLoadDebugVolume.ts:31`). All are mid-session user actions, not boot. Boot goes
entirely through `evaluateRows`. Routing the tier fan-out through the queue is a natural
follow-up and is out of scope here.

### 2. The `priority` field

```ts
// src/@types/loading/AssetWiringRow.d.ts
/** Fetch rank. LOWER is fetched first. Payload size is folded in by the author. */
priority: number;
```

Required, not optional: a new row must state a rank rather than silently inheriting one.

The authored table (from Q15; lower is fetched first):

| Rank | Asset | Size | Rationale |
|---|---|---|---|
| — | fonts (`cormorant.json` + `.webp`) | 297 KB | Outside the queue; blocks `initGpu` today |
| 0 | fallback body atlas | ~0.2 MB | Small; unlocks every body visually |
| 1 | body hi-res textures | varies | Only proximity-demanded ones are queued |
| 2 | `famous.bin` + `famous_galaxies_meta.json` | 55 KB | Near-free; exempt from `surveyDeepZoom` |
| 3 | `structures.ccat`+meta, `constellations.json` | 164 KB | Tiny; visible at Earth when enabled |
| 4 | `2mrs.bin` | 2.5 MB | Smallest real catalog, local-volume structure |
| 5 | `stars-medium.bin` | 30 MB | The sky visible at Earth |
| 6 | `sdss-medium` -> `milliquas-medium` -> `glade-medium` | 10 / 12.8 / 26 MB | Deep shells, small-to-large |
| 7 | `mcpm-medium.scfd` | 19.4 MB | Volume overlay, invisible at boot |
| 8 | filaments, flow, cf4 | off by default | Rarely queued |
| 9 | `pgcAlias` | 1.76 MB | Already lazy on palette open |

Two judgement calls in it, recorded rather than smoothed over:

- **Famous galaxies outrank the star catalog.** The famous catalog is the only exemption from
  `surveyDeepZoom` in the codebase (`pointSpritesLayer.ts:141-143`, mirrored on the pick path),
  so famous objects stay visible at close-in scales where the bulk surveys are gone.
- **2MRS outranks the star catalog** even though at the Earth boot view 2MRS is invisible
  (`surveyDeepZoom` gone) while the stars are fully visible (`starBackdrop` full at solar-system
  distances, `scaleFadeBands.ts:104`). This orders invisible data ahead of visible data. The cost
  is about a second; the payoff is that local structure is resident the moment the camera pulls
  back. Accepted knowingly.

**Concrete integers.** Rank *N* above becomes *N* x 10, so a group whose members must order
internally uses *N* x 10 + *k*:

| `priority` | Row key |
|---|---|
| 0 | `'bodyTextureAtlas'` |
| 5 | `Source.Synthetic` |
| 10 | every `bodyTextureRow` (all `ALL_BODY_TEXTURE_KEYS`) |
| 20 / 21 | `Source.FamousGalaxy` / `'famousGalaxiesMeta'` |
| 30 / 31 | `'structureCatalog'` / `'constellations'` |
| 40 | `Source.TwoMRS` |
| 50 | every `starCatalogRow` |
| 60 / 61 / 62 | `Source.SDSS` / `Source.Milliquas` / `Source.Glade` |
| 63 / 64 / 65 | `Source.DesiDeep` / `Source.DesiSgw` / `Source.DesiWedge` |
| 70 | `'mcpm'` |
| 80 / 81 / 82 | `'filaments'` / `'flow'` / `'cf4Density'` |
| 90 | `'pgcAlias'` |

Distinct integers inside rank 6 are load-bearing: `popHighestPriority` breaks ties by
first-encountered, and `ASSET_WIRING` order is SDSS, 2MRS, GLADE, Milliquas, which would give
the wrong large-before-small order for equal ranks.

Four rows the grill table did not cover:

- **DESI (`DesiDeep` 1.6 MB, `DesiSgw` 2.4 MB, `DesiWedge` 10.3 MB)** are deep survey shells like
  SDSS/GLADE, default-off, so they join rank 6 ordered small-to-large.
- **`Source.Synthetic`** performs no network fetch (`syntheticPointFetcher` generates in
  process). It only arms once every real catalog has settled without data, so the queue is
  near-empty when it fires; its rank only decides how fast the emergency fallback appears.

Nothing about the rank table gets a test. It IS the specification; a test asserting its order
would restate a constant, which `docs/superpowers/conventions/testing.md` forbids.

### 3. The body-texture atlas

**Asset.** One image, `public/data/images/textures/body-atlas.webp`, holding a low-resolution
`surface` tile for each of the 13 bodies in `BODY_TEXTURE_REGISTRY`. No ring tile: dropped at
the checkpoint (2026-07-24); see Ground preparation and the corrections section for why.
Budget: 1 MB. Every tile is the same 512x256 size (all 13 bodies are 2:1 equirectangular), so
the atlas is a uniform 4-column x 4-row grid with 3 cells unused. Derivation: the existing
2048-tier surface set totals about 3.1 MB across those same 13 files, and 512px is one
sixteenth the pixels, so the atlas lands near 3.1 MB / 16 ≈ 194 KB, comfortably inside the 1 MB
budget with headroom to spare (WebP's lossy overhead does not scale perfectly linearly with
pixel count, so treat 194 KB as an estimate, not a promise).

`surface` only. `material` and `normal` are LINEAR (`rgba8unorm`) while `surface` / `night` /
`clouds` are sRGB (`isLinearTextureKind.ts`), so a combined atlas would need two files or a
hand-degamma in WGSL. The linear kinds are data-gated no-ops with flat placeholders, so their
absence during the fallback window is imperceptible.

**Wiring.** A new `AssetKey` member `'bodyTextureAtlas'`, a named
`bodyTextureAtlas: AssetSlot<ImageBitmap, void> | null` on `EngineAssetSlots`, a registry-built
`ASSET_WIRING` row with `demand: () => true` and `priority: 0`, and a `bodyAtlasFetcher`
mirroring `bodyTextureFetcher`'s shape (a `dataUrl(...)` fetch, `createImageBitmap` with the
default managed decode since the atlas is sRGB colour). Not `built: 'external'`: the slot has
no renderer to be co-minted beside, and `installSlots` already routes string keys to their
named field.

**Commit.** The commit fans the one bitmap out to every consumer of a surface texture, reusing
the routing `commitBodyTexture` (`bodyTextureSlotRegistry.ts:88-116`) already performs for the
13 registry bodies:

- `'earth'` -> `earthRenderer`
- the twelve other bodies -> `texturedBodyRenderer`

`commitBodyTexture`'s `'saturn-ring'` routing (`texturedBodyRenderer.setRingTexture`,
`ringRenderer.setTexture`, `atmosphereShellRenderer.setRingTexture`) is untouched by this
feature, because the ring is not one of the atlas's tiles (Ground preparation, ring-drop
decision). Saturn's ring still loads its own hi-res texture through the existing per-body
pipeline; it simply has no low-resolution placeholder to show while that load is in flight,
same as before this feature existed.

It routes into each renderer's PLACEHOLDER layer, never its committed-map layer, which is what
makes an out-of-order arrival harmless: a hi-res map that landed first shadows the tile
automatically, with no slot-state peek in the commit path (that would re-braid the loading
fact into the rendering path P3 just un-braided).

**Crop.** `copyExternalImageToTexture` accepts a source `origin`, so each tile is copied
straight out of the atlas bitmap into the body's own texture at tile size, then given a mip
chain exactly as `setMap` does (`texturedBodyRenderer.ts:342-369`), so the `mipmapFilter:
'linear'` sampler has a real chain. The atlas never becomes a bound texture.

Landmine to verify visually: `setMap` uploads with `flipY: true`, and `origin` plus `flipY`
interact. `origin` is in unflipped source coordinates; a wrong assumption yields a vertically
mirrored planet sampled from the wrong tile row. If the interaction proves awkward, the escape
hatch is `createImageBitmap(atlas, sx, sy, sw, sh)` per tile, which moves the crop up to the
bitmap layer at the cost of 13 short-lived bitmaps.

**Renderer contracts.**

```ts
// src/@types/rendering/TexturedBodyRenderer.d.ts
/** Seed a body's per-(body, kind) fallback from an atlas tile. Shadowed by setMap. */
setPlaceholderMap(bodyId: BodyTextureId, kind: TextureKind, atlas: ImageBitmap, rect: AtlasTileRect): void;
/** True iff this (body, kind) has ANY texture bound other than the shared 1x1. */
hasMap(bodyId: BodyTextureId, kind: TextureKind): boolean;

// src/@types/data/AtlasTileRect.d.ts  (one type per file)
export type AtlasTileRect = { x: number; y: number; w: number; h: number };
```

`hasMap` is what P3's residency predicate reads:

```ts
// sceneBodyPartition.ts
isTextureResident: (id) => state.gpu.texturedBodyRenderer?.hasMap(id as BodyTextureId, 'surface') ?? false,
```

**Cost flagged, to be confirmed not asserted.** With every registry body texture-resident from
boot, resolved bodies draw through `texturedBodiesLayer`'s per-body path rather than
`planetsLayer`'s single instanced batch. Only bodies past `BODY_GLINT_MAX_PX` are affected, so
this is a handful of extra draw calls. Measure with `npm run perf` before and after.

**Build.** Emitted by the existing body-texture build tool, `tools/textures/buildTextures.ts`
(`npm run build-textures`), not a standalone script. Q19 decided this on the drift failure
mode: a forgotten atlas rebuild after re-curating Mars produces a subtly wrong planet with no
error anywhere. Coupling atlas emission to tier emission makes staleness structurally
impossible. The build already iterates `textureBuildEntries()` over
`BODY_TEXTURE_REGISTRY`, so the atlas pass filters that same list to `kind === 'surface'`, all
13 rows; there is no second enumeration to keep in sync, and no ring to append now that it is
not one of the atlas's tiles.

**Layout.** The same build step emits committed codegen,
`src/data/bodies/bodyAtlas.generated.ts`, exporting
`BODY_ATLAS_LAYOUT: Readonly<Record<BodyTextureId, number>>` mapping each body to its tile
index in row-major order, following the `famousStars.generated.ts` precedent (generated-file
header, "regenerate with" line, source-of-truth line). NOT a fetched JSON sidecar: a sidecar
means an extra round trip before the atlas is usable, which is precisely the latency this
feature removes. It is a few dozen bytes and is needed immediately, so it rides the JS bundle.

With the ring gone, every tile is the same 512x256 size, so the layout no longer needs an
explicit `{x, y, w, h}` per tile the way the ring's off-grid rect once forced: a uniform grid
derives the rect from the index alone. A pure helper,
`atlasTileRect(index: number, columns: number, tileSize: { w: number; h: number }):
AtlasTileRect` (`src/utils/gpu/atlasTileRect.ts`, one symbol per file), turns a tile index back
into the `AtlasTileRect` the renderer contracts below already expect, so `setPlaceholderMap`'s
signature is unchanged. Codegen is kept, not dropped, because the grid's row-major order is
still a fact the build (assigning indices while iterating `textureBuildEntries()`) and the
runtime (looking an index up by body id) must agree on; stating it once in a generated file
beats trusting both sides to independently preserve `BODY_TEXTURE_REGISTRY`'s iteration order
forever.

## Testing

Four tests. Each can fail on a real bug no other test or compiler check catches.

1. **The concurrency bound holds.** Enqueue 6 gated tasks on a `PriorityQueue(2)`; assert the
   observed maximum in-flight never exceeds 2. This is the entire mechanism: if it silently
   runs unbounded the feature does nothing while appearing to work.
2. **A dropped entry never starts.** Saturate the queue, enqueue a further entry, `drop` its
   key, release the blockers, and assert its fetcher was never invoked. Silent and easy to
   regress, and it is what stops a body texture fetching minutes after the camera left.
3. **`load()`'s promise resolves after commit, not after fetch.** With a slow async `commit`,
   assert the promise is still pending after the fetch resolves and settles only once commit
   returns. If it resolved early, the queue would free a slot while a GPU upload is still
   running and the bound would be a lie under load.
4. **Priority order is respected when a slot frees.** Saturate the queue, enqueue entries out
   of rank order, release one slot, and assert the higher-priority entry starts first. Tests
   the pop behaviour against a mixed queue, not a constant.

**Repairs, not new tests:**

- `tests/utils/concurrency/priorityQueue.test.ts` constructs `new PriorityQueue()` and asserts
  against the imported `MAX_CONCURRENT_FETCHES`; it keeps working under the defaulted
  constructor arg but should construct explicitly where the limit is the subject.
- `tests/services/engine/wiring/reevaluateDemand.test.ts` asserts `slot.load` was called
  synchronously. Under a bounded queue only the first N entries start synchronously, so cases
  driving more than 2 demanded rows need a `drain()`.
- Any test asserting `AssetSlot.load` returns `undefined`, and any that awaits load completion
  by polling, simplifies to awaiting the returned promise.

**Nothing else earns a test**, per `docs/superpowers/conventions/testing.md`:

- The rank table is a constant restatement. The table IS the spec.
- `ASSET_QUEUE_CONCURRENCY === 2` and the `MAX_CONCURRENT_FETCHES` default are the same
  problem.
- Atlas pixel correctness needs a GPU; it is covered by the visual check.
- `BODY_ATLAS_LAYOUT` covering every registry body is enforced by its `Record<BodyTextureId,
  number>` type, so a test would restate a compiler check. Same for `atlasTileRect`'s
  arithmetic: it is a three-line formula, not logic that can break independently of its inputs.

## Verification

**`npm run perf` will show approximately nothing here, and that null result must not be read
as "no regression".** It is a GPU-timing harness: it measures frame cost, not network
scheduling. Run it only for the one GPU-side question this feature raises, the extra per-body
draw calls from universal texture residency (design §3), and read it for nothing else.

Verification is manual, in Chrome DevTools, with cold-cache discipline. **A warm CDN or disk
cache makes any measurement look good regardless of the change**, so cold-cache discipline
matters more than the instrument.

1. DevTools Network tab, "Disable cache" checked, hard reload, throttled to Fast 3G (and once
   unthrottled for a sanity pass).
2. Before/after on the same branch pair, same throttle profile, same viewport.
3. What to watch: the waterfall shows at most 2 concurrent data requests; `body-atlas.webp`
   completes early; every visible body is textured, never a flat albedo sphere; `stars-medium.bin`
   completes before `glade-medium.bin` starts; the star field appears materially sooner.
4. Also check `#focus=body-saturn` from a cold load: Saturn arrives textured from the atlas and
   upgrades to hi-res on approach.

Instrumenting the structured `[loading] <name> …` events already emitted by `consoleAdapter`
(`consoleAdapter.ts:38-53`), plus `installLoadProgress`, to capture commit timestamps and
compare runs is the noted follow-up (Q18 option C). It measures exactly the quantity of
interest and is cheap. It is not part of this work. A Playwright plus CDP harness (option B)
was resisted as speculative infrastructure: the scale-gating backlog item wants the same
harness, so it is better built once when there are two consumers.

## Out of scope

Each already carries a backlog entry.

- **Scale-gated asset demand**, the larger win. At the Earth boot view glade (26 MB), sdss (10
  MB), milliquas (12.8 MB) and mcpm (19.4 MB) are all invisible per `surveyDeepZoom`, so about
  68 MB downloads to render nothing. This spec reorders what is fetched; that gate reduces what
  is fetched. They compose, and they ship separately.
  -> `docs/backlog/2026-07-24-scale-gated-asset-demand.md`
- **Filaments and flow scale bands.** Neither layer has a `SCALE_FADE_BANDS` row; both gate on
  user intent alone. Flow is about 1000 Mpc across and should fade out below a certain zoom.
  Blocks their participation in scale-gating.
  -> `docs/backlog/2026-07-24-filaments-flow-scale-bands.md`
- **`famous_stars_meta.json` boot fetch** (120 KB, bypasses slot wiring, only needed on star
  InfoCard open). -> `docs/BACKLOG.md`
- **Jupiter/Saturn 404 on the `large` texture tier.** -> `docs/BACKLOG.md`
- **Dead files in `public/data/`.** -> `docs/BACKLOG.md`
- **Non-blocking font atlas.** `cormorant.json` (87 KB) plus `cormorant.webp` (210 KB) load
  inside `initGpu` (`loadFontAtlases.ts:69-83`) and block renderer construction with no retry.
  About 300 KB of serial head-of-line delay on every cold boot, but fixing it means teaching
  the MSDF layer a "no atlas yet" state, a subsystem this feature otherwise does not touch.
  -> `docs/backlog/2026-07-24-font-atlas-blocks-initgpu.md`
- **Routing the tier-transition fan-out through the queue** (design §1). No backlog entry yet.
- **Body-texture store consolidation.** -> `docs/backlog/2026-07-24-body-texture-store-consolidation.md`

## Corrections to the grill record

Verified against the code while writing this spec.

1. **P4 lands at four sites, not three, and the third is not the one named.** The grill and the
   refactor-ground checkpoint named `texturedBodyRenderer.ts`, `earthRenderer.ts` and
   `ringRenderer.ts`. The ring strip actually fans to THREE renderers
   (`bodyTextureSlotRegistry.ts:112-114`): `texturedBodyRenderer.setRingTexture`,
   `ringRenderer.setTexture`, and `atmosphereShellRenderer.setRingTexture`
   (`atmosphereShellRenderer.ts:336-348,540`), each with its own 1x1 transparent placeholder.
   So the atlas placeholder sites were `texturedBodyRenderer`, `earthRenderer`, `ringRenderer`,
   `atmosphereShellRenderer`. `cloudShellRenderer`, listed among the four in the consolidation
   backlog item, was never one of them: it consumes `clouds`, and the atlas is `surface` only.

   Superseded by the ring-drop decision (2026-07-24, see Ground preparation): this finding is
   exactly what motivated dropping the ring tile. With no ring tile in the atlas,
   `ringRenderer` and `atmosphereShellRenderer` need no atlas-placeholder wiring at all. The
   atlas placeholder sites are `texturedBodyRenderer` and `earthRenderer`, back down to the two
   the grill originally assumed, but for a different reason: not because the original count was
   wrong, but because the ring left the atlas.
2. **`earthRenderer` has no `clearMap`.** Its surface is `setMap` / `draw` / `destroy`; Earth's
   texture is never evicted (`bodyTextureSlotRegistry.ts:43-47`). So at that site P4 buys only
   the out-of-order-arrival protection, not eviction correctness. The eviction-correct-by-
   construction property is specific to `texturedBodyRenderer`'s `clearMap`.
3. **The atlas cannot be a JPEG, and the ring tile cannot be 512x256; this is why the ring was
   dropped.** The Saturn ring strip is 2048x125 at the 2048 tier (about a 16:1 aspect) and its
   content IS its alpha channel, which is why `bodyTextureFilename` already forces WebP for the
   ring. Keeping the ring in the atlas would have forced two consequences the grill's "one sRGB
   atlas, 14 tiles of 512x256, about 2048x1024" arithmetic did not account for: the atlas would
   need to ship with alpha (ruling out a plain opaque sRGB container), and tile rects would be
   **not uniform**, forcing `BODY_ATLAS_LAYOUT` to carry an explicit `{x, y, w, h}` per tile
   rather than being a derived grid. A 4x4 grid of 512x256 cells at 2048x1024 would still have
   hosted all 14 tiles; the ring would simply have occupied a 512x31 rect inside its cell.

   This is exactly why the ring was dropped from the atlas at the checkpoint (2026-07-24); see
   Ground preparation. Its full 2048 tier is only 8,832 bytes, small enough to arrive on its own
   with no fallback tier needed, and it is proximity-gated to a moment when the queue is idle
   regardless. Dropping it removes the alpha requirement (the atlas is now plain opaque sRGB,
   choosing WebP purely for its compression, not for alpha support), restores a uniform 512x256
   grid (design §3), and cuts P4 from four sites to two. To be accurate about the record: the
   grill never examined the ring's geometry or argued for keeping it. It scoped the atlas to
   `surface` kinds and the ring carries a `surface` kind, so it was swept in by that rule with
   no separate rationale. The drop is therefore new information applied, not a reversal. What
   Saturn loses is only its low-res placeholder for the few seconds before the hi-res ring
   texture lands, which is exactly the situation every `material` / `normal` map (never atlased
   at all) is already in.
4. **The queue's drop trigger is demand, not `release()`.** Q13 framed it as "drop-by-key on
   release". A queued-but-unstarted slot is still `idle`, so `release()` is never called for it
   and the `ready`-gated evict branch cannot see it. The trigger is the new `idle && !demand`
   edge in `evaluateRows`; a real `release()` reaches the same drop on the following pass. Same
   guarantee, different edge.
5. **`popHighestPriority` pops the largest value.** The rank table reads lower-is-first, so the
   enqueue site negates. Easy to get backwards, and getting it backwards would fetch the
   101.7 MB in exactly reverse order while every test still passed.
6. **Stale line references in the grill baseline, corrected here.** The `cloudLoader` docstring
   line is `engine.ts:31`, not `:32`, and it is indeed stale (no `cloudLoader.ts` and no
   `autoLod.ts` exist; unrelated cleanup). `wireSlots.ts:132`
   and `runFrame.ts:171` are accurate. `assetWiring.ts` is at `:219-343` for `ASSET_WIRING` and
   `:200-217` for `bodyTextureRow`, both accurate. `priorityQueue.ts:50,120` and
   `AssetSlot.ts:217-225` are accurate. `loadFontAtlases.ts` is at `:69-83`, not `:71-75`.
