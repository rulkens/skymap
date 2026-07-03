# Galaxy Renderer tool — design

**Status:** approved design, awaiting plan
**Date:** 2026-07-02
**Source:** Claude Design spike (`~/Downloads/galaxy-renderer/`, ~1,700 lines of vanilla JS + WGSL)

## Why

The main renderer draws every galaxy as a point billboard (+ thumbnail quad on
approach). The spike proved a far richer representation: a procedural,
parametric Hubble-sequence galaxy — hundreds of thousands of instanced star
sprites with an HDR bloom pipeline — that can be tuned to match real
astrophotography. This effort ports the spike into the repo as a first-class
dev tool at `tools/galaxy-renderer/`, rewritten in TypeScript under all house
conventions, with tests for every pure part. The goal is to get the renderer
*up to par* as an instrument, so a later effort (informed by the
renderer-unification work, PR #385) can slot the proven core into the main app
as a bounded adapter.

**In scope:** core renderer (engine + model + shaders + worker), the
validation/compare panel with descriptor-based auto-fit (the instrument for
judging "up to par"), the multi-galaxy perf test (the instrument for judging
perf at skymap scale), JSON preset export/import.

**Out of scope (non-goals):** main-app integration, pick/selection,
render-on-demand, deploy story, localStorage preset saves, iOS budget. The
spike download's `screenshots/` and `uploads/` are dropped entirely.

## Shape

A sibling dev-tool Vite app, mirroring `tools/flow-workbench/` exactly:

- `tools/galaxy-renderer/{index.html, vite.config.ts, wesl.toml, tsconfig.json, README.md}`
- `vite.config.ts`: `root` = the tool dir, `publicDir` = repo `public/`
  (serves the curated reference images), **port 5400** (clear of 5173 main,
  5200 curator, 5300 flow-workbench), wesl-plugin with **explicit `weslToml`
  path** (the plugin reads `cwd/wesl.toml` otherwise — the flow-workbench
  gotcha).
- npm script: `"galaxy-renderer": "vite --config tools/galaxy-renderer/vite.config.ts"`.

```
tools/galaxy-renderer/
  @types/                    one type per file (.d.ts)
    model/    GalaxyParams, GalaxyCategory, GeneratedGalaxy, GalaxyBuildContext
    engine/   GalaxyEngineHandle, RenderSettings, LodSettings, ViewPose,
              ExtraGalaxySpec, EngineStats
    matcher/  GalaxyDescriptor, FitPlan, FitResult, FitStepInfo
    state/    AppState + one type per slice
  src/
    model/
      generateGalaxy.ts          orchestrator (pure, deterministic)
      classifyHubbleType.ts      'Sb'→'spiral', 'SBc'→'barred', 'E3'→'elliptical', …
      splitStarBudget.ts         per-category star-count allocation table
      starWriter.ts              stride-8 interleaved star buffer writer
      dustWriter.ts              stride-8 interleaved dust buffer writer
      populations/               one builder per file:
                                 bulge, bar, disk, spiralArms, irregularClumps,
                                 halo, globularClusters, armDust, barDust,
                                 lenticularDust, irregularDust
    engine/
      createGalaxyEngine.ts      device, pipelines, targets, frame loop, input
      shaders/                   star.wesl, dust.wesl, bloomBright.wesl,
                                 bloomDownsample.wesl, bloomUpsample.wesl,
                                 composite.wesl, lib/fullscreenTri.wesl
      orbitEye.ts                az/el/dist/target → eye position (pure)
      panAxes.ts                 camera right/up axes for right-drag pan (pure)
      packCameraUniforms.ts      112-byte camera UBO layout (pure)
      bakeExtraTransform.ts      rigid transform baked into interleaved buffer (pure)
      lensShift.ts               panel-inset → projection lens-shift term (pure)
    worker/generateGalaxy.worker.ts   Vite module worker + main-thread fallback
    matcher/
      computeDescriptor.ts       RGBA image → rotation/scale-invariant descriptor
      descriptorLoss.ts          weighted distance between descriptors
      dominantArms.ts            strongest azimuthal harmonic
      elevationFromQ.ts          apparent axis ratio → camera inclination
      fitPlan.ts                 per-category weights + optimisable params
      autoFit.ts                 coordinate-descent hill climb over an engine handle
      loadImageDescriptor.ts     image URL → descriptor (DOM canvas; thin)
    state/
      createStore.ts             RTK store (flow-workbench pattern)
      slices/                    galaxySlice, renderSlice, lodSlice,
                                 compareSlice, extrasSlice, uiSlice
      engineBridge.ts            store → engine imperative boundary
    data/
      referenceGalaxies.ts       ported REFS table
      paramSpec.ts               slider ranges — single source for UI + randomizer
      hubbleStagePatches.ts      type-button param patches (Sa/Sb/Sc stages)
    ui/                          one component per folder (create-component skill)
tests/tools/galaxy-renderer/     mirrors src/
```

## Reuse (search-before-writing-helpers)

- `src/utils/random/mulberry32.ts` — the spike's `makeRng` IS mulberry32;
  import, don't re-write.
- `tools/utils/random/gaussian.ts` — replaces the spike's `makeGaussian`
  closure (same Box–Muller math, per-call signature).
- **New** `src/utils/random/makeValueNoise.ts` — seeded trilinear 3D value
  noise (spike's `makeValueNoise`). Lives in `src/` because the model is
  destined to move there; gets its own focused test.
- **wgpu-matrix** for `perspective`/`lookAt`/`multiply` (dst-arg-last house
  lib) — the spike's hand-rolled `galaxy-math.js` mat4 helpers are deleted,
  ported nowhere.

## Model (CPU generation)

`generateGalaxy(params: GalaxyParams): GeneratedGalaxy` stays a single pure,
deterministic function — same params, byte-identical output, forever. Internally
decomposed:

1. Build a `GalaxyBuildContext`: **four independent seeded streams**
   (`seed`/`asymSeed`/`clumpSeed`/`waveSeed` — independence is what lets the
   UI reroll one noise family without disturbing the rest), scale constants
   (outer radius, disk scale length, bulge radius, disk height, grain scale),
   the warp offset function, the metallicity-driven HII palette.
2. `splitStarBudget(category, params)` — the category dispatch table
   (elliptical / lenticular / irregular / barred / spiral), returning
   bulge/disk/arm/halo counts. Table dispatch, no predicate chain.
3. Run population builders in fixed order, each appending stride-8 records to
   `starWriter`/`dustWriter`. Spiral-arm stars emit dust-lane seed positions
   consumed by the dust builders.

Output contract (unchanged from spike):

```ts
type GeneratedGalaxy = {
  readonly stars: Float32Array;   // [x,y,z, r,g,b, size, brightness] × starCount
  readonly starCount: number;
  readonly dust: Float32Array;    // [x,y,z, size, r,g,b, opacity] × dustCount
  readonly dustCount: number;
};
```

## Engine (GPU)

`createGalaxyEngine(canvas, opts): Promise<GalaxyEngineHandle>` keeps the
spike's public surface **verbatim** — it is the future main-app seam:

```ts
type GalaxyEngineHandle = {
  setParams(p: GalaxyParams): Promise<void>;   // regenerates via worker
  setRender(r: Partial<RenderSettings & LodSettings>): void;
  setView(v: Partial<ViewPose>): void;
  setAutoRotate(on: boolean): void;
  setInsets(left: number, right: number): void; // off-center framing for panels
  setExtras(specs: readonly ExtraGalaxySpec[]): Promise<void>;
  step(now?: number): void;                     // single frame (headless/fit)
  sample(): Promise<{ mean: number; max: number; litPct: number; stars: number }>;
  grab(size?: number): Promise<{ S: number; data: Uint8ClampedArray }>;
  getCamera(): ViewPose;
  dispose(): void;
};
```

Render chain, unchanged: additive star billboards → absorptive dust
(`src=dst, dst=zero` transmittance blend, wavelength-dependent extinction) →
bright-pass with firefly clamp → 5-level dual-filter bloom pyramid (Karis
average on the first downsample) → tonemap composite (ACES / Reinhard /
Reinhard-ext / Uncharted 2 / linear) with saturation + vignette.

Engine internals honour the standing WebGPU rules: `layout:'auto'` bind groups
are built per-pipeline and never shared across pipelines; per-instance data is
baked into vertex buffers, never mutated mid-frame via uniforms.

Deliberate deviation from house ethos: **continuous rAF loop, no
render-on-demand** — the FPS badge under sustained load is the tool's perf
instrument. Camera input (orbit/pan/wheel with damping + idle auto-rotate)
stays engine-internal; only the pure math is extracted.

`sample()` and `grab()` are kept: `grab` feeds the auto-fit loop, `sample` is
the manual headless smoke check.

## Shaders

Seven `.wesl` files, behaviour-identical to the spike's WGSL strings. The
`FS_TRI` string concatenation becomes a WESL import of `lib/fullscreenTri.wesl`.
House WESL discipline: no backticks in comments, `?static` imports resolved by
the build-time linker, tool-local `wesl.toml` passed explicitly in the vite
config.

## State — intent-centric (ADR 0007 at tool scale)

One RTK store, single write path. Slices by concern:

| slice     | holds                                                        | engine effect        |
| --------- | ------------------------------------------------------------ | -------------------- |
| `galaxy`  | full `GalaxyParams` incl. the four seeds                     | regenerate (debounced ~130 ms) |
| `render`  | exposure, bloom, saturation, vignette, sizeScale, starIntensity, tonemap | live `setRender` |
| `lod`     | `lodApparent`, `cullBright`                                  | live `setRender`     |
| `compare` | panel open, active reference id, fit progress/score/note/report | none (drives autoFit runs) |
| `extras`  | multi-galaxy enabled + count                                 | `setExtras` (debounced) |
| `ui`      | collapsible-section map, copy feedback                       | none                 |

The spike complected LOD culling knobs into the same `render` bag as screen
post-processing; the GPU already separates them (camera UBO vs composite UBO),
so the state mirrors that split — `lod` is its own slice.

`engineBridge.ts` is the **one imperative boundary**: it subscribes to the
store, diffs slice-by-slice, and calls the engine handle. Engine feedback
(fps, star/dust counts, fit steps) is dispatched back as plain status actions.
**Camera pose is engine-owned** — per-frame drag never round-trips through the
store (the main app's driver-model carve-out); the store carries only view
*intents* (apply reference view, match view, fit view).

## UI

Every component follows the create-component skill (own folder,
`<Name>.tsx` + `<Name>.module.css`, default export, `.root` class, `cx`,
readonly props). Components: `App`, `Viewport` (canvas + engine lifecycle +
WebGPU-fallback and loading states), `Hud` (fps/star/dust badges),
`ControlsPanel`, `CollapsibleSection`, `ParamSlider` (label, mono value,
seed-reroll die where applicable), `TypePicker` (Hubble-sequence chip rows),
`TonemapSelect`, `MultiGalaxySection`, `PresetsSection` (JSON download /
upload / copy — no browser persistence), `ComparePanel` (reference chips,
reference card with facts grid, auto-fit section with progress + stop, match
report).

`data/paramSpec.ts` ports the spike's `SPEC` table — the single source of
slider ranges/steps that both the sliders and the randomizer read. Which
sliders show for which category is derived from `classifyHubbleType`, as in
the spike. The `galaxy.css` design tokens become the tool's shared CSS
vocabulary module (composed, not `:global`).

## Reference data & images

`referenceGalaxies.ts` ports the REFS table (M100, NGC 6946, M58, M104, M31,
giant elliptical, LMC, Milky Way model) with
`img: '/images/famous-curated/<id>/starless.webp'` — served directly from repo
`public/` via the tool's `publicDir`. **No image copies enter the repo.**
Mappings: `ngc6946 → c12` (Caldwell 12), giant elliptical → `m49` (the spike's
"m50" file was mislabeled — M50 is an open cluster), Milky Way stays
imageless. Fixes a latent spike bug: REFS entries had a duplicate `view` key
(display string silently overwritten by the pose object) — split into
`viewLabel: string` + `view: ViewPose`.

## Matcher

Pure descriptor pipeline, ported as-is: border-median background subtraction,
97th-percentile luminance cap, centroid + second moments → axis ratio `q`,
half-light radius, 15-bin radial flux profile, inner/outer colour, azimuthal
residual harmonics m=1..6, dust-absorption index. `fitPlan` gives per-category
loss weights + optimisable param ranges; `autoFit` runs discrete arm-count
search then 3-pass coordinate descent, driving any `GalaxyEngineHandle`
(`setParams` → `step` → `grab` → descriptor → loss), yielding to the UI
between evaluations and honouring a stop signal.

## Testing (option A — pure parts under vitest, GPU shell visual)

`tests/tools/galaxy-renderer/` mirrors `src/`:

- **model** — determinism (same params → byte-identical arrays), budget-split
  sums ≤ total, per-category invariants (elliptical: zero dust + zero arm
  stars; irregular: no smooth disk; lenticular: no arms), warp offset zero
  inside `warpStart` and S-shaped beyond, writer stride/headroom bounds, HII
  palette endpoints (teal→pink→deep red vs metallicity).
- **engine pure parts** — `packCameraUniforms` byte layout (112 bytes, field
  offsets), `bakeExtraTransform` rigid-transform correctness (rotation
  preserves lengths, size index scaled), `orbitEye`/`panAxes` geometry,
  `lensShift` sign and magnitude.
- **matcher** — `computeDescriptor` on synthetic images (centered round blob →
  q≈1; elongated blob → low q; m-fold azimuthal pattern → dominant harmonic
  m), `descriptorLoss` zero at identity / monotone in each component,
  `fitPlan` shape per category, `autoFit` loss non-increasing + stop-signal
  respected against a scripted fake engine handle.
- **state** — slice reducers; `engineBridge` diffing + debounce against a
  recording fake engine (params change → one debounced `setParams`; render
  change → immediate `setRender`; no spurious calls).
- **utils** — `makeValueNoise` (range [0,1], determinism, smoothness between
  lattice points).

The GPU pipelines and WESL output are verified visually via the dev server —
same policy as the main renderer. No Playwright.

## Later (explicitly deferred)

- Slotting the engine into the main app (bounded adapter behind
  `GalaxyEngineHandle`), after renderer unification (#385) settles.
- Any catalog-driven parameterisation (Hubble type from real catalog data).
- Render-on-demand, pick, mobile budgets.
