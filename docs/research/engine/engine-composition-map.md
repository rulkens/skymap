# Skymap engine composition model — where an analytic Milky Way plugs in

Scope: `src/services/engine/frame/` (the FRAME program), the layer-lifecycle
shape existing layers follow, the v1 Milky-Way sprite path's full footprint,
accretion sites, and the camera-distance-driven uniform pattern. All paths
relative to repo root; line numbers are current as of this worktree.

---

## 1. FRAME PROGRAM

### The three-layer stack

1. **`frameProgram.ts`** (`src/services/engine/frame/frameProgram.ts:80-153`) —
   `frameProgram(tone, bloomEnabled)` returns a `readonly FrameStep[]`: the
   frame **as data**. A `FrameStep` (`src/@types/engine/frame/FrameStep.d.ts`)
   is one of `'compute'` (name-to-fn lookup), `'render'` (a `(target, slab)`
   pair — every enabled `ContentLayer` matching both fields fires, in
   registry order), `'composite'` (a whole-texture blend between two named
   targets, e.g. `hdr` into `swap`), or `'bloom'` (one opaque sub-pipeline).
   The concrete program today (`frameProgram.ts:81-152`):
   ```
   compute:flow -> compute:atmosphereSkyView
     -> render(volume,COSMO) -> render(hdr,COSMO)
     -> render(star-aggregates,NEAR0) -> render(mw-aggregate,NEAR0)
     -> render(hdr,NEAR0)
     -> render(foreground:0,NEAR0) -> composite(foreground:0 into hdr, tone:null)
     -> [bloom]
     -> composite(hdr into swap, tone)       <- the ONE tone-map
     -> render(swap,COSMO) -> render(swap,NEAR0)
   ```
2. **`passes/index.ts`** — `CONTENT_LAYERS`, the flat ordered `ContentLayer[]`
   registry (30 rows, `passes/index.ts:238-361`). Each row states its own
   `target`/`slab`/`blend`; grouping by `(target, slab)` is a `.filter()` at
   the executor, not a hand-split array.
   A `ContentLayer` (`src/@types/engine/frame/ContentLayer.d.ts`) carries
   `name`, `slab` (index), `target` (a `RenderTargetSpec.id` string),
   `blend`, `enabled()`, `draw()`, and optional `pickEnabled()` / `drawPick()`.
3. **`executeFrame.ts`** — the single imperative walker
   (`src/services/engine/frame/executeFrame.ts:157-264`). One `switch` on
   `step.kind`; a `'render'` step filters `CONTENT_LAYERS` by
   `(target, slab)` + `enabled()` + the DebugPanel's `disabledPasses` map,
   resolves one `SlabView` (`slabViewOf(ctx, step.slab)`), and opens either
   one merged pass (production) or one pass per layer (`?gpuTimings` dev
   path) — see `resolveStrategy.ts`. First-touch bookkeeping (`touched: Set`,
   `executeFrame.ts:167`) flips a target's `loadOp` from `'clear'` to
   `'load'` the first time it's drawn into each frame; a depth-bearing
   target (only `foreground:0` today) gets the matching depth clear.

### runFrame.ts -> renderFrame.ts -> executeFrame.ts

`runFrame.ts` (per-frame CPU body, `src/services/engine/frame/runFrame.ts`)
runs camera-driver resolution, demand re-evaluation, per-frame planners
(disk LOD, Earth tiles, label director, star-cut walk, structure markers),
then calls `renderFrame({ ctx, state, device, context, timingService })`
(`runFrame.ts:742-748`). `renderFrame.ts` writes the shared focus uniform
once, opens the command encoder + acquires the swap view, builds
`frameProgram(tone, bloomEnabled)` from live tonemap/HDR/bloom settings, and
calls `executeFrame` with `CONTENT_LAYERS` + the resolved `RenderStrategy`.
`executeFrame` is the only place `beginRenderPass` is called for content.

### Render targets (src/services/gpu/renderTargets.ts)

`createRenderTargets(device, swapFormat, size, mwAggregateDivisor)` builds a
`RenderTargetSpec[]` table (`renderTargets.ts:191-218`): each row is
`{ id, format, depth, scale }`. `scale` is the downsample **divisor** (not a
multiplier) — `floor(canvasSize / scale)`, min 1px
(`renderTargets.ts:244-250`). One `allocate()` loop handles every offscreen
row uniformly; `reconcile()` re-runs it; `destroy()` clears every map. The
`swap` row has a spec (format, for pipeline-format matching) but no
allocated texture — it resolves from the per-frame acquired swap-chain view
(`executeFrame.ts:97-100`). `clearValue` rides each row in
`renderTargetRows()` (`renderTargets.ts`) — `specOf(target).clearValue` is
read by both `executeFrame`'s `colorAttachment()` and `runBloom`, one source
instead of the old parallel `TARGET_CLEAR_VALUES` table.

Today's rows: `hdr` (rgba16float, scale 1 — the shared additive accumulator),
`volume` (scale 3, the raymarch half-res-cubed offscreen), `star-aggregates`
(scale 2), `mw-aggregate` (scale = **live setting**
`state.settings.milkyWay.aggregateDivisor`, the one non-constant row),
`foreground:0` (scale 1, `depth32float` — the only depth-bearing row),
`bloom0..bloomN` (per-level scale from `bloomConstants.ts`), `swap`.

### Offscreen -> HDR: upsample-as-layer, not composite-as-step

The `volume-upsample`, `star-upsample`, and `milky-way-upsample` layers are
ordinary `ContentLayer` rows (`target: 'hdr'`, additive blend) that live
**inside** the `(hdr, NEAR0)` or `(hdr, COSMO)` render step alongside every
other content layer — they are not `'composite'` `FrameStep`s
(`frameProgram.ts:42-53`). A `'composite'` step exists only for the two
whole-texture merges that need something a layer can't express: depth
(`foreground:0` into `hdr`) or the tone curve (`hdr` into `swap`). The
pattern for "cheap half-res offscreen, bilinear-upsampled back in" is
therefore: **one new render-target row + one producer layer targeting it +
one consumer upsample-layer targeting `hdr`** — no new `FrameStep` kind, no
executor change.

### The bloom exception

Bloom is the one sub-pipeline that reuses targets with different ops across
its ten passes (a ping-pong mip pyramid: downsample clears, upsample loads),
which the `(target, slab)` render-step model cannot express (a reused-target
step would re-fire every matching layer at the wrong moment). It is
therefore a single `'bloom'` `FrameStep` whose body (`runBloom.ts`) opens its
own passes in strict order, outside the `(target, slab)` grouping.

### The "new render target needs a frameProgram step" rule

Concretely, adding an N-th offscreen (e.g. an analytic MW field target)
means:
1. A row in `renderTargets.ts`'s `renderTargetRows()`
   (id/format/depth/scale/clearValue) — the clear colour rides the row,
   not a separate table.
2. A `{ kind: 'render', target: <id>, slab: <COSMO|NEAR0> }` step in
   `frameProgram()`, positioned relative to its producer/consumer neighbours
   (order is load-bearing where blend is multiplicative or where an upsample
   consumer must follow its producer — see the Milky Way's own three-row
   ordering note in `passes/index.ts:171-181`).
3. One or more `ContentLayer` rows in `CONTENT_LAYERS` whose `target`/`slab`
   match the new step (a producer into the new target, optionally a consumer
   upsample-layer back into `hdr`).
4. A renderer whose pipeline's `(format, depth)` match the target row (an
   unenforced convention — see `initGpu.ts`'s "target-to-pipeline invariant"
   comments), constructed in `initGpu.ts` and torn down in `engine.ts`'s
   flat destroy list.
5. If pickable: `drawPick`/`pickEnabled` on the layer, wired into the
   parallel pick program (`pickProgram.ts`) which walks the same registry.

Nothing here is a registry of "target owners" beyond the flat spec array and
the flat layer array — a new row is additive by construction (existing rows
are untouched), but every wiring site above is a **separate hand-edit**,
not one place. Section 4 names the resulting hand-wiring cost explicitly.

---

## 2. LAYER LIFECYCLE — the repeated shape, and where layers deviate

Three representative chains, traced settings -> engine wiring -> renderer
construction -> per-frame update -> pass execution -> wake:

### A. Star catalog (three-stream split)

Files: `passes/starCatalogLayer.ts`, `passes/starAggregatesLayer.ts`,
`passes/starAggregateUpsampleLayer.ts`.

- **Settings**: `settings.starCatalogs` (per-catalog `items[id].enabled` +
  crossfade), read by `starCatalogVisible`.
- **Engine wiring**: `assetWiring.ts` demand-loads each catalog's `.bin` per
  the `GALAXY_CATALOG_SOURCE_REGISTRY` (a per-survey source, not a
  singleton-overlay row).
- **Renderer construction**: `state.gpu.starCatalogRenderer` +
  `state.gpu.starAggregateUpsample` (`createStarAggregateUpsample`, built
  unconditionally in `initGpu.ts`).
- **Per-frame update**: `prepareStarCut(state, ctx)` (`runFrame.ts:723`)
  runs ONE octree walk + LOD-fade advance, memoised on `ctx` so leaf,
  aggregate, and upsample layers share one walk; `childMask === 0`
  partitions leaf vs. aggregate nodes into two draw streams sharing one CPU
  pass.
- **Pass execution**: leaf stream draws full-res into `hdr`
  (`starCatalogLayer`); aggregate stream draws LINEAR into the half-res
  `star-aggregates` offscreen (`starAggregatesLayer`, its own render step);
  `starAggregateUpsampleLayer` composites that back into `hdr`, re-applying
  the hue-preserving knee to the SUMMED field (fixes an LOD-compression
  asymmetry a plain blit would leave).
- **Wake**: `anyNodeFading` (a per-node LOD-fade vote) surfaces from
  `prepareStarCut`'s result and feeds `shouldKeepTicking` explicitly
  (`runFrame.ts:709-713`) — not the only layer family with a dedicated wake
  term any more: the label director's producers/envelope vote (rung 5, #15)
  joined the `anim` bag beside it. Star-cut's stays per-node rather than
  per-layer.

### B. Scalar volume (raymarch + upsample)

Files: `passes/scalarVolumeLayer.ts`, `passes/volumeUpsampleLayer.ts`,
`frame/volumeLiveness.ts`.

- **Settings**: `settings.volumes.items[fieldId]` (per-field enabled,
  intensity, palette), the per-field-volume convention (not singleton).
- **Engine wiring**: `handle.volumes.add` (public API, not asset-slot
  demand) uploads a 3D texture into `volumeFieldRenderer` — through the same
  `uploadVolumeField` the four volume slot commits call (decision #14).
- **Renderer construction**: `state.gpu.volumeFieldRenderer` +
  `state.gpu.volumeUpsample` (`createAdditiveUpsample(device,'rgba16float')`,
  `initGpu.ts:381`), both unconditional at bootstrap.
- **Per-frame update**: `deriveVolumeLiveness(state, ctx)`
  (`volumeLiveness.ts:73-114`) is the ONE derivation both layers gate on:
  master toggle OR fade tail, focus-recession-scaled per-field opacity,
  deep-zoom survey fade — returning `null` or the read closures
  `{settingsOf, fadeOpacityOf}` the raymarch reads.
- **Pass execution**: `scalarVolumeLayer` raymarches at a reduced resolution
  into `volume` (its own render step, `(volume, COSMO)`); `volumeUpsampleLayer`
  bilinearly folds it into `hdr` inside the `(hdr, COSMO)` step.
- **Wake**: no dedicated term — driven by camera motion and settings writes
  only (volumes have no per-frame CPU animation of their own).

### C. Orbit trails (camera-distance per-row fade, hideable overlay)

File: `passes/orbitTrailsLayer.ts`.

- **Settings**: `settings.orbitTrails.enabled`, a `VisibilityLayerKey`
  (`'orbitTrails'`) — clip-scriptable via `hide()`/`show()`, the same
  surface `'milkyWayDisk'` uses (`orbitTrailsLayer.ts:26-37`).
- **Engine wiring**: `FADE_LAYERS` manifest (`wiring/fadeLayers.ts`) bridges
  the toggle to a `{kind:'orbitTrails'}` `FadeRegistry` controller so the
  whole layer dissolves rather than pops; no asset slot (compile-time conic
  table, `ORBITAL_ELEMENTS`).
- **Renderer construction**: `state.gpu.orbitTrailRenderer`, unconditional.
- **Per-frame update**: re-derives every orbit's conic AT THE FRAME INSTANT
  from `ctx.simDays` (no caching) — `keplerianEllipse(propagateElements(...))`
  in double precision, narrowed to single precision only after the
  projective divide.
- **Pass execution**: `(hdr, NEAR0)` render step, additive, gated first by
  `FOREGROUND_MAX_DISTANCE_MPC` (drops the WHOLE step at galaxy zoom — see
  section 5), then per-orbit apparent-diameter cull and fade.
- **Wake**: none dedicated — `selectIsManualPlaying` and camera motion cover
  it; the conic re-derivation is cheap enough to run unconditionally inside
  the gate.

### The repeated shape

`settings.<x>` (or per-item settings) -> a liveness/visibility derivation
function that is the ONE place "is this drawn, at what opacity" is answered
-> a `ContentLayer` (or matched producer/consumer pair) reading that
derivation in both `enabled()` and `draw()` -> a GPU renderer/handle
constructed unconditionally in `initGpu.ts` and torn down by name in
`engine.ts`'s flat destroy list -> wake either falls out for free (camera
motion, or `watchWakeSaga`'s settings-route membership) or is threaded
explicitly through `shouldKeepTicking`'s `anim` parameter when the layer has
its own async or animated state.

The project has a named convention for the simplest case: **singleton
overlay layers** (`docs/superpowers/conventions/singleton-overlay-layers.md`)
— filaments, flow, and Milky Way are the three examples. Four rules: (1) all
user-facing state in `settings.<layer>` — no bespoke `DemandCtx` surface;
(2) `data.<layer>` store is status-only (`{loaded, setLoaded()}`), no GPU
resources, no user knobs; (3) demand reads `settings.<layer>.enabled`
directly; (4) the per-frame pass reads `settings.<layer>` live, commit flips
`loaded`. Milky Way's `enabled`/`labelEnabled` axes follow this.

**Where it deviates**: Milky Way's cloud is GPU-**generated**, not fetched
— there is no asset slot at all for the star/dust buffers (grep
`assetWiring.ts` for `milkyWay`: no demand row exists), so rule 3's demand
row doesn't apply to it; instead `initGpu.ts` builds the cloud
unconditionally at bootstrap and `runFrame.ts` re-generates it in place on a
live setting or tier mismatch (section 3, section 4 item 1). That
generation-vs-fetch split is the deepest deviation from the repeated shape,
not a settings or wiring difference.

---

## 3. THE MILKY WAY TODAY (v1 sprite path) — deletion inventory

### Diagnosis already on record

`docs/research/milky-way/goal-and-history.md` (already in this worktree)
states the plan explicitly: the v1 sprite bag (~150k additive billboards
standing in for ~1e11 stars, one sprite per ~700,000 stars) is measured to
fail below one sprite per pixel wherever the disc covers real screen area,
and is at its fragment ceiling (fill-bound, not vertex-bound). The stated
goal is deletion, not tuning, replaced by `v2/`'s analytic flux-field
mixture (closed-form Gaussian integrals, no marching) plus named feature
terms (dust, star-forming regions, globular clusters) with real catalog
data. `v2/README.md` states: "Only the tool (tools/galaxy-renderer/) drives
this tier today. The runtime has no analytic-field renderer yet." — i.e.
the replacement's data builders exist and are pure (no device handle), but
nothing in `src/services/engine` consumes them; the runtime gap is entirely
on the render and wiring side, not the math side.

### The v1 runtime chain (three frame passes + generator + renderers)

- `src/services/engine/frame/passes/milkyWayLayer.ts` — the DUST pass
  (multiplicative, full-res in `hdr`) plus the pick aspect. `slab: NEAR0`
  (COSMO's fixed 10 kpc near plane clips the disc mid-descent). Carries the
  registry's one deliberately-narrower `pickEnabled` (a hardcoded
  `MILKY_WAY_PICK_MIN_DISTANCE_MPC = 0.0271`, eye-tuned) — flagged by
  `ContentLayer.d.ts`'s own docs as the sole example of that direction.
- `src/services/engine/frame/passes/milkyWayAggregateLayer.ts` — the
  ADDITIVE star pass into the reduced-res `mw-aggregate` offscreen (its own
  render step, `(mw-aggregate, NEAR0)`).
- `src/services/engine/frame/passes/milkyWayUpsampleLayer.ts` — composites
  `mw-aggregate` into `hdr` via a SECOND, independent
  `createAdditiveUpsample` instance (`state.gpu.milkyWayAggregateUpsample`;
  deliberately not shared with the volume's own instance — "sharing one
  would braid two independently-gated subsystems onto a single resource").
- `src/services/engine/frame/milkyWayCloudLiveness.ts` —
  `deriveMilkyWayCloudAlpha`, the ONE shared liveness and opacity
  derivation all three layers above gate on (far-side `milkyWayVisible`
  plus apparent-size fade, near-side `milkyWayApproach` band, registry
  fade opacity).
- `src/services/engine/galaxyGenerator/v1/*` — the generator itself:
  `milkyWayCloud.ts` (GPU compute generation, write-then-encode-then-submit),
  `milkyWayCalibration.ts` (`MILKY_WAY_RADIUS_MPC`, `MILKY_WAY_MODEL_SCALE`,
  `MILKY_WAY_STARS_PER_TIER`, `MILKY_WAY_TUNING_DEFAULTS`,
  `MILKY_WAY_FADE_FULL_PX`/`GONE_PX`), `milkyWayModelMatrix.ts` plus
  `milkyWayModelCached.ts` (world placement, memoised once),
  `milkyWayFadeAlpha.ts` (apparent-size fade curve), plus the
  shared-with-tool carve and pack machinery (`carveStarLayout.ts`,
  `createGenerationPipelines.ts`, `genRecordBytes.ts`,
  `packGenerationUniforms.ts`, `spritePopulationBrightness.ts`,
  `totalStarBudget.ts`). `v1/README.md` (already present) is an explicit
  "scheduled for deletion" module map — read it before touching this tier.
  **Named exception**: `MILKY_WAY_RADIUS_MPC`, `MILKY_WAY_MODEL_SCALE`, and
  the fade thresholds in `milkyWayCalibration.ts` describe WHERE the galaxy
  is, not how it is sampled — the README says explicitly to **promote, not
  delete** these with the rest of the tier.
- `src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer.ts` — the
  two-pass (additive star, multiplicative dust) billboard draw.
- `src/services/gpu/renderers/milkyWay/milkyWayPickRenderer.ts` — the
  invisible pick-only billboard at the galactic centre.
- `src/services/gpu/shaders/milkyWay/sprites/*.wesl` (6 files: generate,
  generateStars, generateDust, stars, dust, io) and
  `src/services/gpu/shaders/milkyWay/pick/*.wesl` (3 files: io, pick,
  vertex) — the only Milky-Way shader directories actually reachable from
  the runtime engine.

### Settings, tuning UI, tier reseed

- `src/@types/settings/MilkyWaySettings.d.ts` = `{ enabled, labelEnabled }`
  intersected with `MilkyWayTuning`. `MilkyWayTuning.d.ts` is the v1
  LOOK-knob shape (`starSizeScale`, `exposure`, `starPxMin`/`Max`,
  `softness`, `lodApparent`, `aggregateDivisor`, `starCount`) — every one of
  these is v1-sprite-specific (sprite size, exposure, LOD), so this type is
  a deletion candidate alongside the generator, not a survivor like
  `enabled`/`labelEnabled`.
- `src/data/milkyWay/milkyWaySliderFields.ts` plus
  `src/@types/data/milkyWay/MilkyWaySliderField.d.ts` and
  `MilkyWaySliderKey.d.ts` — the DebugPanel slider registry for
  `MilkyWayTuning`'s knobs.
- `src/components/DebugPanel/MilkyWayTuningSection.tsx` plus
  `src/components/containers/MilkyWayTuningSectionContainer.tsx` — the panel
  UI, driven by the slider registry above.
- `src/utils/format/formatMilkyWayTuningDefaults.ts` — paste-ready-literal
  formatter for promoting a tuned DebugPanel session to
  `MILKY_WAY_TUNING_DEFAULTS`.
- `src/state/tier/watchTierSaga.ts:45,74` — imports
  `MILKY_WAY_STARS_PER_TIER` from the v1 generator directly and re-seeds
  `settings.milkyWay.starCount` on every confirmed tier change. This is a
  generic per-tier-reload saga with one MW-specific import and dispatch
  hard-wired into it (section 4).
- `src/services/engine/phases/initGpu.ts:327-348` — constructs
  `state.gpu.milkyWayCloud` (`createMilkyWayCloud`, seeded from
  `MILKY_WAY_TUNING_DEFAULTS.starCount`, NOT live settings — deliberate,
  `MilkyWayCloud.reconcile` is the only regenerate path since rung 3) and
  `state.gpu.milkyWayCloudRenderer`; `initGpu.ts:222-226` constructs
  `state.gpu.milkyWayPickRenderer`; `initGpu.ts:389` constructs
  `state.gpu.milkyWayAggregateUpsample`.
- `src/services/engine/engine.ts:846-847,878-881,890-891` — the flat
  teardown lines for all four MW GPU handles (`milkyWayPickRenderer`,
  `milkyWayCloud`, `milkyWayCloudRenderer`, `milkyWayAggregateUpsample`).
- `src/services/gpu/renderTargets.ts:83-92,155-160,199` — the `mw-aggregate`
  spec row (whose `scale` is the ONLY non-constant divisor in the whole
  table — threaded through `createRenderTargets`'s signature as a named
  `mwAggregateDivisor` parameter) and its clear-value entry.
- ~~`src/services/engine/frame/runFrame.ts:211-281` — the two MW-specific
  per-frame mismatch branches (aggregate-divisor to target rebuild;
  starCount to cloud regenerate), both inline in the generic per-frame
  body~~ — **both deleted**: rung 2 folded the divisor rebuild into
  `RenderTargets.reconcile`, rung 3 the starCount compare into
  `MilkyWayCloud.reconcile`. `runFrame` now makes two declarative calls;
  what v1's deletion takes with it is the cloud resource, not a branch
  (decision #13; section 4 item 1).

### The concept layer (survives independent of v1 vs v2)

Milky Way as a selectable, focusable, labelled singleton is threaded
through generic machinery that has nothing to do with the sprite renderer
and would be reused unchanged, or adapted, not deleted, by an analytic
successor: `src/@types/engine/MilkyWayInfo.d.ts`,
`src/data/milkyWay/milkyWayInfo.ts` (the static `FocusableTarget` record),
`src/data/milkyWay/galacticCenter.ts` (Sgr A* offset — physical fact,
outlives v1 per the README note), `src/data/sources/milky-way.ts` plus
`src/@types/data/milkyWay/MilkyWaySourceEntry.d.ts` (SOURCE_REGISTRY row),
`src/services/engine/helpers/milkyWayVisible.ts` (visibility predicate —
logic will move but the gate shape persists),
`src/services/engine/presentation/produceMilkyWayLabel.ts` plus
`milkyWayLabelStyle.ts` and
`src/services/gpu/labelLayout/milkyWayLabelVisibility.ts` (the "You are
here" label), `src/services/url/milkyWayFocusId.ts` (deep-link),
`src/data/bodies/sceneSgrAStar.ts` (Sgr A* as a focus anchor),
`src/components/InfoCard/MilkyWayDetailCard/*` and `CompactMilkyWayCard/*`
(InfoCard panels), plus its entries in the generic selection, focus, and
pick plumbing (`ClickResolver.d.ts`, `FocusableTarget.d.ts`,
`SelectionRow.d.ts`, `buildFocusable.ts`, `extractSelectionRow.ts`,
`resolvePickTable.ts`, `selectionHaloTable.ts`, `clickHandler.ts`,
`focusFraming.ts`, `resolveFocusId.ts`, `urlHashFor.ts`), the
animation/fade manifest (`FadeId.d.ts`, `VisibilityLayerKey.d.ts`,
`fadeRegistry.ts`, `wiring/fadeLayers.ts`, `makeReconcileEffects.ts`,
`makeRunTierTransition.ts`, `watchFadesSaga.ts`), and tour/UI surfacing
(`CommandPalette/*`, `data/animation/tours/**` — MW is a named beat or
focus target in `grandTour/{cosmicFlows,homeAgain,openingTitle,
youAreHere}.ts`, `demoTour.ts`, `webShowcase.ts`, `clips/cosmicFlows.ts`,
`state/tour/{captureSettings,clipFociReady,waitUntil}.ts`).

### v2 / tool-only (not runtime-wired today)

`src/services/engine/galaxyGenerator/v2/{galaxyFieldMixture.ts,
sfEventCatalog.ts,README.md}`, `src/@types/galaxy/{GalaxyDustParams,
GalaxyFieldComponent,GalaxyLegacyParams,GalaxyLightDecomposition}.ts`, and
the two large shader trees `src/services/gpu/shaders/milkyWay/field/*.wesl`
(emission mixture: armRidge, bubblePresent, dustAttenuation, dustDetail,
dustMap, dustNoiseBake, dustPresent, fieldSplat, hiiSplat, io,
starGrainBake, warpNoiseBake) and
`src/services/gpu/shaders/milkyWay/ismMap/*.wesl` (ISM density and forcing
grid: 14 files). Verified by grep: every consumer of these two shader
directories lives under `tools/galaxy-renderer/src/engine/{field,ismMap}/`;
none is imported from `src/services/engine` or `src/services/gpu/renderers`.
`src/data/milkyWay/milkyWayGalaxyParams.ts` (`MILKY_WAY_GALAXY_PARAMS`) is
shared between the tool's reference gallery and v1's generator today, and is
the `GalaxyDescription` source v2's builders also consume — the one file
already common to all three tiers.

### Grep completeness note

`grep -rIl "milkyWay|milky-way|MilkyWay|MILKY_WAY" src` returns 235 files.
Beyond the categories above, the remainder are generic type or plumbing
files where "milkyWay" appears only as one arm of a discriminated union or
one row of a shared table (`SettingsSnapshot.d.ts`, `EnginePickingState.d.ts`,
`EngineGpuHandles.d.ts`, `ContentLayer.d.ts`, `Blend.d.ts`, `Label.d.ts`,
`MarkerLine.d.ts`/`MarkerLineRenderer.d.ts`, `StructureInfo.d.ts`,
`structure/categoryDisplayInfo.ts`, `structure/labelCategories.ts`,
`orientationFrames.ts`, `galaxyType.ts`, `horizonShellFadeAlpha.ts`,
`pickPaddingPx.ts`, plus blend-state/compositor/lib shader files whose
header comments merely explain MW's blend as a worked example) — none of
these need editing to swap the render tier; they need editing only if the
union or table itself changes shape.

---

## 4. ACCRETION SITES

1. ~~**`runFrame.ts:211-281` — two hand-wired MW-specific mismatch branches
   inline in the generic per-frame body.** The aggregate-divisor to
   target-rebuild branch (211-245) and the starCount to cloud-regenerate
   branch (247-281) are explicitly acknowledged by their own comments as
   "the same shape asked about a different input," yet neither is factored
   into a shared "generated-artifact-vs-live-setting mismatch" helper —
   they are two near-identical bespoke `if` blocks sitting in the one
   function every layer's per-frame work funnels through. A distance-driven
   analytic MW field with its own live-tunable buffer size would be a
   natural third copy of this shape unless generalized first.~~
   **SUPERSEDED (rungs 2 and 3, decision #13).** Both branches are gone, and
   the generalization they seemed to ask for was the wrong answer: the
   compare belongs **on the resource**, not in a shared helper.
   `RenderTargets.reconcile` (rung 2) and `MilkyWayCloud.reconcile` (rung 3)
   each own their own, and `runFrame` calls them declaratively. An analytic
   field with a live-tunable buffer size becomes a third `reconcile`, not a
   third `if` block.
2. **`renderTargets.ts`'s `createRenderTargets(device, swapFormat, size,
   mwAggregateDivisor)` signature** (`renderTargets.ts:220-225`) — a
   supposedly generic target-table factory takes ONE named parameter for
   ONE consumer's live tuning knob. Every other row's `scale` is a
   compile-time constant; `mw-aggregate` is the sole exception, threaded by
   name through a function that otherwise knows nothing about individual
   layers. A second live-scale target (again, plausible for an analytic
   field's LOD) has no slot to plug into without widening this signature
   again.
3. **`watchTierSaga.ts:45,74`** — a generic per-tier catalog-reload saga
   directly imports `MILKY_WAY_STARS_PER_TIER` from
   `galaxyGenerator/v1/milkyWayCalibration` and dispatches
   `setMilkyWayTuning` as a one-off side effect of every tier confirm. The
   saga's own header names this as a special case: "`settings.milkyWay.
   starCount` is an absolute count with nothing tying it to the tier
   automatically." This is a settings bridge — a generic mechanism (tier
   transition) reaching directly into one layer's private calibration
   constants.
4. **Five separate `state.gpu.*` handles for one singleton layer**
   (`milkyWayCloud`, `milkyWayCloudRenderer`, `milkyWayPickRenderer`,
   `milkyWayAggregateUpsample`, plus the `mw-aggregate` render-target row) —
   each constructed by name in `initGpu.ts` and torn down by name in
   `engine.ts`'s flat destroy list (no registry, no loop — every renderer in
   the app is wired this way, so this is not MW-specific, but it means a
   swap to an analytic field touches five distinct hand-written
   construction and teardown sites rather than one).
5. **`milkyWayLayer.ts`'s narrower-than-`enabled` `pickEnabled`**
   (`milkyWayLayer.ts:89-99`, `MILKY_WAY_PICK_MIN_DISTANCE_MPC = 0.0271`) —
   the type contract (`ContentLayer.d.ts`) names this as the SOLE row in
   the whole registry where pick is narrower than draw, with a hand-tuned
   magic constant. Not wrong (well-justified in-line), but it is a
   precedent-free special case a reviewer of an analytic-field pick pass
   has nothing else to pattern-match against.
6. **`PASS_GROUP_TITLES`** (`frameProgram.ts:209-224`) — a hand-maintained
   groupKey-to-title map for the DebugPanel; a new `(target, slab)` pair
   that should visually bucket with an existing group (e.g. a new MW
   sub-target joining "Volumes & aggregates") needs its own manual entry or
   silently gets its own fallback group. Degrades safely (never crashes),
   but is a second place — beyond the render-target table and the frame
   program — that has to be told about a new target's identity.
7. **`MilkyWaySettings = { enabled, labelEnabled }` intersected with
   `MilkyWayTuning`** (`MilkyWaySettings.d.ts:21-26`) — the two visibility
   axes that fit the singleton-overlay convention are flattened together
   with 8 v1-sprite-specific look knobs into one settings slice. A v2
   field's tuning knobs, whatever they are, either get grafted onto the
   same flat object (repeating this coupling) or force a settings-shape
   migration — there is no existing seam between "the layer's identity and
   visibility" and "this generation tier's knobs" for a new tier to land in
   cleanly.

---

## 5. Per-frame distance-driven uniform/buffer data flow

The pattern a distance-driven MW field would ride:

Every existing distance- or LOD-driven visual quantity is a pure function
of `ctx.drawCamPos` (or `view.camPos`) recomputed fresh each frame —
nothing is cached across frames as a mutable "current LOD" field. Three
shapes, already used together by the Milky Way's own liveness chain:

- **`fadeBand(band, distanceMpc)` returns a number in [0,1]**
  (`src/utils/math/fadeBand.ts`, consumed via `SCALE_FADE_BANDS`
  (`presentation/scaleFadeBands.ts`)) — a named, tunable `{fullAt, goneAt}`
  style band evaluated fresh each frame against
  `Math.hypot(ctx.drawCamPos[...])`. Used by `milkyWayCloudLiveness.ts`'s
  `milkyWayApproach` band, `volumeLiveness.ts`'s `surveyDeepZoom` band, and
  the star-catalog crossfade's per-source `crossfadePc` band. This is the
  droppable-precision, camera-distance-only lever: cheap, no uniform
  upload, purely a CPU-side scalar multiplied into the draw call's alpha or
  folded into a `fadeOpacityOf(id)` closure.
- **Apparent-size fade** (`milkyWayFadeAlpha.ts`, `volumeLiveness`'s
  implicit analog via `hasActiveFields`) — converts a physical radius plus
  `ctx.fovYRad` and `ctx.canvasSize.height` into on-screen pixel diameter,
  then runs that through a fade band (`MILKY_WAY_FADE_FULL_PX`/`GONE_PX`).
  This is what makes the MW cloud (and the star-catalog octree cut) fade on
  how BIG something looks rather than how far it is — robust to FOV and
  window changes for free.
- **Hard step-function gates, not fades**: `FOREGROUND_MAX_DISTANCE_MPC`
  (`frame/foregroundMaxDistance.ts`) ANDs into every NEAR0 foreground
  layer's `enabled`, so the whole `(foreground:0, NEAR0)` render step (four
  layers) drops out of the program entirely past that camera distance — no
  wasted `beginRenderPass`, no idle timing slot (`executeFrame`'s
  `group.length === 0` early-out). `MILKY_WAY_PICK_MIN_DISTANCE_MPC`
  similarly gates a boolean, not a fade.

For an analytic distance-driven MW field, the shape to ride is: derive a
`deriveXLiveness(state, ctx)` function returning `{...closures} | null`
(the `volumeLiveness.ts` / `milkyWayCloudLiveness.ts` pattern) that
composes a `fadeBand` (or several) against
`Math.hypot(ctx.drawCamPos[...])`, returns `null` for "don't draw" so the
layer's `enabled()` and the executor's empty-group skip compose for free,
and returns live per-parameter read closures (not baked values) so a
DebugPanel or settings write is visible next frame with no imperative
setter. No uniform buffer is written from this layer directly — every
existing renderer's `draw(pass, {..., fadeAlpha, tuning:
state.settings.X})` call packs its own uniform bytes from the `tuning`
object plus the derived `fadeAlpha` scalar at draw time
(`milkyWayCloudRenderer.drawStars`/`drawDust`, `volumeFieldRenderer.draw`),
so "camera distance to uniform" is always CPU-scalar-in,
GPU-pack-at-draw-time, never a separate compute pass writing a
distance-derived buffer. The one wake concern: a pure camera-distance fade
needs no new wake term (`shouldKeepTicking` already fires on
`selectCameraActive`); only a per-frame CPU-animated ramp (like the star
octree's per-node fade) needs a new vote threaded through
`shouldKeepTicking`'s `anim` bag.
