# Renderer Unification Design

**Status:** Draft (brainstorming output, iterating with the user).
Re-verified against `main` on 2026-07-03 (post #394/#396); see the
powers-of-ten architecture review (`docs/audits/2026-07-02-powers-of-ten-architecture-review.md`).
**Date:** 2026-06-29
**Author:** Alexander Rulkens (+ Claude)

## Goal

Unify the "background" (cosmological scene) and "foreground" (near-field bodies)
render paths — plus the pick path — onto **one compositor model**, removing the
accidental duplication that has accreted while keeping the differences that are
essential physics. The end-state is a renderer where adding a new visual element
(a translucent atmosphere, a new overlay, a third depth slab) is a _data_ edit to
a registry, not a new bespoke `encode*` function wired by hand into `renderFrame`.

## Why now

The zoom-to-Earth work (**draft PR #386, branch `feat/zoom-to-earth-true-scale` —
not yet on `main`**) adds a third rendering path (opaque, depth-tested, f64,
near-field bodies) bolted onto a frame loop that has two
(additive HDR scene + premultiplied-OVER UI overlay). That third path is wired by
hand in `renderFrame` via `encodeForegroundPass` + `encodeForegroundOver`, and it
duplicates machinery that already exists:

- A second tone-map pass (`foregroundComposite`) byte-identical to `postProcess`'s,
  kept in sync only by a shared `toneMapDefaults.ts` + `lib/tonemap.wesl` (both
  introduced on that branch — `main` today has exactly one tone-map).
- A second "render to an offscreen, sample it back" pattern, identical in shape to
  `volumeOffscreen` → `volumeUpsamplePass` but reimplemented.

On `main` itself the composite-shaped implementations are `postProcess`'s
HDR→swap tonemap, `volumeUpsamplePass`'s volume→HDR blit, and the dev-only
`drawPickDebugOverlay` pick→swap OVER blit (own encoder, after the main submit)
— already three hand-rolled instances of "merge an offscreen into a target"
before #386 adds its fourth.

A 2-way split (`HDR_PASSES` additive vs `UI_PASSES` over) is going 3-way by hand.
Per the project's "tagged union + table dispatch for a >2-way split" rule, that is
the trigger to introduce a proper model rather than add a fourth bespoke branch
when the atmosphere lands.

## The essential / accidental split

The two paths differ on five axes. **Only some of those differences are essential
— the spec preserves those and erases the rest.**

| Axis                         | Background (scene)                         | Foreground (bodies)                          | Verdict                                                                      |
| ---------------------------- | ------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------- |
| Coordinate frame / precision | world-absolute f32                         | origin-relative f64, narrow-at-upload        | **Essential** — spanning ~30 orders of magnitude forces it                   |
| Projection frustum           | one fixed wide (near 0.01 / far 50000 Mpc) | adaptive (near `dist·1e-4` / far `dist·100`) | **Essential** — one depth buffer can't span the scale                        |
| Accumulation                 | additive, no depth, order-independent      | opaque, depth-tested, occluding              | **Essential** — emissive point clouds vs solid surfaces is different physics |
| Tone-map                     | once, after additive accumulation          | a second pass with the same curve            | **Accidental** — one operator, implemented twice                             |
| Composite into swap          | tone-map blit, then UI over                | tone-map + OVER after the UI overlay         | **Accidental** — both are "merge an offscreen into a target"                 |

**Decomplection thesis.** Today these axes are _braided_: which `Pass[]` array a
renderer lives in implicitly fixes its projection, its precision, its blend, and
its target all at once. The model un-braids them into three independent axes:

- **Slab** — which view-projection + depth range the geometry projects through.
- **Target** — which texture it draws into (`hdr` / `volume` / `foreground:0` / `swap` / a pick target).
- **Blend** — how its fragments combine (`additive` / `opaque` / `over`).

A content layer is one point in this 3-axis space, plus a renderer and an enable
gate. The axes are genuinely independent: a slab can host layers that go to
different targets with different blends (cosmological galaxies additive-into-`hdr`
_and_ cosmological labels over-onto-`swap` are both cosmological-slab).

## Core concepts

### Slab — a scale-separated depth range + its projection

A depth buffer has finite precision (~1 part in 2²³). A perspective projection
crams most of it near the near plane, so the usable near/far ratio before opaque
surfaces z-fight is ~1e5–1e6. Skymap needs `far/near ≈ 5e4 / 1e-12 ≈ 5e16` to put
Earth and distant galaxies in one buffer — impossible. So depth is sliced into
**slabs**, each with its own near/far sized to its slab, each getting the full
depth-buffer precision for its own range. Slabs composite far→near (the nearer
slab's pixels land on top, which _is_ inter-slab occlusion).

**Skymap already has exactly two slabs** — the model names and generalizes them:

```ts
// @types/engine/frame/Slab.d.ts (one type per file)
export type Slab = {
  index: number; // 0 = nearest; higher = farther back. Composite order is high→low.
  nearMpc: number; // near plane for THIS slab
  farMpc: number; // far plane for THIS slab
  vp: Float64Array; // proj·view for this slab (origin-relative for near slabs)
  originRelative: boolean; // true ⇒ geometry deltas are computed as pos − renderOrigin
  precision: 'f32' | 'f64'; // f64 ⇒ MVP composed in double then narrowed (composeBodyMvp path)
};
```

The two slabs this spec instantiates (derived per frame from `cam.distance`):

```ts
const SLABS: Slab[] = [
  {
    index: 0,
    nearMpc: camDist * 1e-4,
    farMpc: camDist * 100,
    vp: foregroundVp,
    originRelative: true,
    precision: 'f64',
  }, // near-field bodies (Sun, Earth)
  { index: 1, nearMpc: 0.01, farMpc: 50000, vp: cosmoVp, originRelative: false, precision: 'f32' }, // cosmological (galaxies, MW, filaments)
];
```

The type is **N-capable**: a third slab is one more entry plus one more
`foreground:k` target. This spec does **not** design slab spawn/retire or adaptive
slab-set selection during a descent — that is explicitly deferred (see Out of scope).

A content layer names its slab by index (no tagged union — the slab table holds
all the per-slab attributes):

```ts
// @types/engine/frame/ContentSpace.d.ts
export type ContentSpace = { slab: number }; // index into the per-frame SLABS list
```

### RenderTarget — an offscreen (or the swap chain)

```ts
// @types/engine/frame/RenderTargetSpec.d.ts
export type RenderTargetSpec = {
  id: string; // 'hdr' | 'volume' | 'foreground:0' | 'swap' | 'pick:cosmo' | 'pick:near0'
  format: GPUTextureFormat; // rgba16float offscreen / swap format / r32uint for pick
  depth: GPUTextureFormat | null; // 'depth32float' opaque slabs, 'depth24plus' pick, null additive/over
  scale: number; // 1 = full res, 3 = volume's downsample divisor
};
```

The concrete table:

| id             | format        | depth        | scale | purpose                                                                        |
| -------------- | ------------- | ------------ | ----- | ------------------------------------------------------------------------------ |
| `hdr`          | rgba16float   | —            | 1     | cosmological additive accumulation                                             |
| `volume`       | rgba16float   | —            | 3     | scalar-volume raymarch (half-ish res)                                          |
| `foreground:0` | rgba16float   | depth32float | 1     | near-field slab 0 opaque bodies                                                |
| `swap`         | (swap format) | —            | 1     | the presented frame                                                            |
| `pick:cosmo`   | r32uint       | depth24plus  | 1     | cosmological pick IDs                                                          |
| `pick:near0`   | r32uint       | depth32float | 1     | near-field slab 0 pick IDs (allocated only when a slab-0 layer has `drawPick`) |

### ContentLayer — the flat registry (replaces `HDR_PASSES` + `UI_PASSES` + foreground)

```ts
// @types/engine/frame/ContentLayer.d.ts
export type ContentLayer = {
  name: string;
  space: ContentSpace; // which slab ⇒ which VP gets threaded into draw
  target: string; // RenderTargetSpec.id it draws into
  blend: Blend; // 'additive' | 'opaque' | 'over'
  enabled(state: EngineState, ctx: ReadyFrameContext): boolean;
  draw(
    pass: GPURenderPassEncoder,
    ctx: ReadyFrameContext,
    state: EngineState,
    deps: PassDeps,
  ): void;
  drawPick?(
    pass: GPURenderPassEncoder,
    ctx: ReadyFrameContext,
    state: EngineState,
    deps: PassDeps,
  ): void;
};
```

`Blend` is its own one-type-per-file alias (`'additive' | 'opaque' | 'over'`).

**Invariant** (the load-bearing constraint): a layer's `target.{format,depth}` +
`blend` must match the _profile_ baked into the renderer pipeline its `draw` calls.
Where they differ, you need a renderer _variant_ — pick is the canonical example
(`r32uint` + `depth24plus` is a second pipeline over the same point geometry, which
is why `drawPick` delegates to `pickRenderer`, not `pointRenderer`).

**Migration of every current pass:**

| Current pass                          | slab                | target       | blend    | drawPick?                                        |
| ------------------------------------- | ------------------- | ------------ | -------- | ------------------------------------------------ |
| pointSpritesPass                      | cosmological        | hdr          | additive | ✓ (pickRenderer)                                 |
| proceduralDisksPass                   | cosmological        | hdr          | additive | ✓ (pickDisks)                                    |
| texturedDisksPass                     | cosmological        | hdr          | additive | —                                                |
| milkyWayPass                          | cosmological        | hdr          | additive | ✓ (milkyWayPickRenderer, cosmological billboard) |
| filamentsPass                         | cosmological        | hdr          | additive | —                                                |
| flowFieldPass                         | cosmological        | hdr          | additive | —                                                |
| horizonShellPass                      | cosmological        | hdr          | additive | —                                                |
| structureMarkersPass                  | cosmological        | hdr          | additive | ✓ (pickRing)                                     |
| (volume raymarch)                     | cosmological        | volume       | additive | —                                                |
| selectionRingPass                     | cosmological        | swap         | over     | —                                                |
| diskRadiusRingPass                    | cosmological        | swap         | over     | —                                                |
| markerLinesPass                       | cosmological        | swap         | over     | —                                                |
| labelsPass                            | cosmological        | swap         | over     | —                                                |
| clipPathDebugPass                     | cosmological        | swap         | over     | — (debug; default-quiet)                         |
| debug bodies (PR #386)                | near-field (slab 0) | foreground:0 | opaque   | — (no pickable body yet)                         |
| captions (PR #386, foreground labels) | near-field (slab 0) | swap         | over     | —                                                |

Note `volumeUpsamplePass` does **not** appear as a content layer — it is a
_composite step_ (`volume → hdr`, additive), see below.

Note `drawPickDebugOverlay` also does not appear: it is a **debug composite
step** (`pick:cosmo → swap`, over, no tone), not a content layer. It keeps its
own encoder + submit _after_ the frame program (today that ordering exists
because it replays the frame's camera from `state.picking.lastFrameUniformBytes`
— see the pick-camera prerequisite under Pick below; once the pick camera is a
value, the post-frame placement remains a debug-latency choice, not a data
dependency).

### Renderers — unchanged GPU-resource owners

Renderers (`pointRenderer`, `debugSphereRenderer`, `milkyWayRenderer`,
`labelRenderer`, …) keep their current role and lifecycle: long-lived owners of
pipelines / vertex buffers / bind groups / shaders, built in `initGpu`, held on
`state.gpu.*`, torn down on `destroy`. They are **slab-ignorant** — the VP arrives
as a uniform, so the same renderer can serve multiple slabs _if_ its pipeline
profile matches the target. A `ContentLayer.draw` threads the right slab VP
(`ctx.vpFor(space.slab)`) into the renderer call. This spec adds **no new renderer
variants** beyond what already exists.

### Compositor — one primitive (replaces three bespoke composites)

```ts
// @types/rendering/Compositor.d.ts
export type ToneMap = { exposure: number; curve: number }; // null ⇒ source already LDR

export type CompositeBlend =
  | 'replace' // overwrite dst       (hdr → swap: swap is cleared)
  | 'over' // Porter-Duff OVER    (foreground → swap)
  | 'additive'; // add into dst        (volume → hdr)

export type Compositor = {
  // Pipelines keyed by (blend, dstFormat); applies the shared lib/tonemap.wesl when `tone` is set.
  draw(
    pass: GPURenderPassEncoder,
    src: GPUTextureView,
    blend: CompositeBlend,
    tone: ToneMap | null,
  ): void;
  destroy(): void;
};
```

This single module replaces: the tone-map half of `postProcess`, the blit in
`volumeUpsamplePass`, the pick→swap blit in `drawPickDebugOverlay`, and (once
PR #386 is in) all of `foregroundComposite`. `lib/tonemap.wesl` stays the single
source of curve truth (with #386's `toneMapDefaults.ts` as its TS-side constants
when that lands).

### CompositeStep + FrameStep — the frame as data

```ts
// @types/engine/frame/CompositeStep.d.ts
export type CompositeStep = {
  source: string;
  dest: string;
  blend: CompositeBlend;
  tone: ToneMap | null;
};

// @types/engine/frame/FrameStep.d.ts
export type FrameStep =
  | { kind: 'compute'; name: string } // pre-frame compute dispatch (flow particles)
  | { kind: 'render'; target: string } // draw all enabled ContentLayers whose target === this, in registry order
  | { kind: 'composite'; step: CompositeStep }; // merge source → dest via the Compositor
```

The concrete program — **byte-equivalent to today's frame**, but now data instead
of imperative code in `renderFrame`:

```ts
const FRAME: FrameStep[] = [
  { kind: 'compute', name: 'flow' }, // particle seed/integrate
  { kind: 'render', target: 'volume' }, // raymarch (cosmological)
  { kind: 'composite', step: { source: 'volume', dest: 'hdr', blend: 'additive', tone: null } },
  { kind: 'render', target: 'hdr' }, // cosmological additive group
  { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: TONE } }, // tonemap → swap
  { kind: 'render', target: 'swap' }, // cosmological OVER group (rings, lines, labels)
  { kind: 'render', target: 'foreground:0' }, // near-field slab 0 opaque (bodies)
  { kind: 'composite', step: { source: 'foreground:0', dest: 'swap', blend: 'over', tone: TONE } },
  // captions are a swap layer ordered AFTER the foreground composite (see decision below)
];
```

The `render target: 'swap'` for the near-field OVER group (captions) comes _after_
the `foreground:0 → swap` composite, so captions land on top of the bodies while
the bodies occlude the cosmological labels drawn in the earlier `render swap` step.
**The "labels occluded by bodies" behaviour is now a visible ordering decision in
`FRAME`, not a buried `encodeForegroundOver`-after-`encodeUiOverlay` convention.**

A `render swap` step appears twice (cosmological-over group, then near-field-over
group). The executor selects layers by `(target, slab-class)` for each step, so the
two `render swap` entries draw disjoint layer sets.

**The program lifts two steps that are nested today.** On `main` the volume
prepass and the flow compute are invoked from _inside both_ HDR encoder branches
(`encodeHdrSingle.ts` / `encodeHdrSplit.ts`, sharing `encodeVolumePrepass` /
`encodeFlowCompute` precisely so the branches can't drift — the helper's header
says as much). `FRAME` models them as top-level steps instead; the phase-2 plan
must include that (behaviour-neutral) hoist, not treat the listing as a
description of the current shape.

**The executor owns the single/split timing fork as an execution strategy.**
The frame has one remaining shape branch: production encodes all of a target's
layers in one merged `beginRenderPass` (tile-local on M1 — the OVER blends need
the coherent `dst.color`), while `?gpuTimings` opens one pass per layer so each
can carry its own `timestampWrites` (WebGPU attaches timestamps at pass
boundaries only). That fork is _essential_, but it is a property of **how a
`render` step executes**, not of the program: the executor takes a strategy
(`merged` | `per-layer-timed`) and applies it uniformly, replacing today's
`encodeHdrSingle` / `encodeHdrSplit` pair. Relatedly, `TIMED_SLOT_NAMES`
(`passes/index.ts`) currently brackets the HDR pass names with four hardcoded
framework slots (`scalar-volume`, `tone-map`, `ui-overlay`, `pick`); once the
frame is a `FrameStep` program, the timing-slot list derives from the program
(one slot per step, per-layer slots under the timed strategy) so a new target or
slab never means editing timing vocabulary by hand.

## Pick — a parallel program over the same registry

Pick is **not** a member of `FRAME`. It is a second consumer of the content
registry, terminating in a readback rather than the swap chain:

- It runs on its **own encoder + submit, off the render frame** — `hoverPickDriver`
  fires it on pointer events, throttled by `mapAsync` readback latency. Unchanged.
- It draws only the **pick aspect** (`drawPick`) of pickable layers, depth-resolved.
- **Space-aware (N=1 now):** one pick target per slab (`pick:cosmo`,
  `pick:near0`). Render `drawPick` of each slab's pickable layers into that slab's
  pick target, depth-resolved within the slab.
- **Resolve across slabs on readback:** read back the single texel under the cursor
  from each slab's pick target, and on the CPU take the **frontmost non-zero in slab
  order** (near → far). This mirrors the visible far→near OVER but as a handful of
  texel reads + a pure-CPU pick — no GPU pick-composite pass.

```ts
// @types/engine/frame/PickProgram (conceptual)
// for each slab S with at least one pickable layer:
//   render drawPick(layers where layer.space.slab === S.index && layer.drawPick) → pick:<S>
// readback texel under cursor from each pick:<S>
// decode = firstNonZero([near…far].map(texel))   // pure CPU, unit-testable
```

At N=1 this is **exactly today's single cosmological pick pass** — the per-slab loop
has one populated iteration (`pick:near0` is unused until a slab-0 layer gains a
`drawPick`, e.g. a selectable body). The Milky Way stays a cosmological-slab pick
(its existing `mwHalfExtentPx` billboard), unchanged.

### Prerequisite: the pick camera becomes a value

Today the pick pass reproduces the frame's camera by replaying an opaque byte
snapshot: `pointSpritesPass` stashes its packed `PointUniforms` bytes onto
`state.picking.lastFrameUniformBytes` just before submit, and `hoverPickDriver`
/ `wireInput` / `drawPickDebugOverlay` upload those bytes verbatim. That braids
three pairs: pick-camera _availability_ × whether the visual points pass drew
(zero catalogs ⇒ no/stale snapshot); the camera _value_ × one renderer's uniform
byte layout (no other slab or renderer can replay it); and the hover/debug
consumers × frame ordering ("stashed just before submit"). The per-slab pick
program is unimplementable against it — a `pick:near0` pass has no camera
source.

Phase 3 therefore starts by making camera-for-pick a **value**: the pick program
takes the slab's `vp` (from the same per-frame slab table the render program
uses, i.e. `ctx.vpFor(slab)`) and builds the pick uniform from it at pick time.
`lastFrameUniformBytes` and its `EnginePickingState` field are deleted. This
composes with — and does not replace — the backlog's picking-GPU-subsystem
migration (resource ownership is that item; camera plumbing is this one).

The frontmost-non-zero resolver is a pure function:

```ts
// utils/picking/frontmostPick.ts  (one function per file)
export function frontmostPick(perSlabRaw: readonly number[]): number; // first non-zero near→far, else 0
```

## Phasing — three shippable PRs, no thrown-away work

Each phase is a clean superset of the previous; each is independently mergeable and
behaviour-neutral (until pick semantics extend in phase 3, which is also
behaviour-neutral at N=1).

**Phase 1 — Compositor primitive (accidental complexity only).**
Introduce `Compositor`; repoint the composite implementations on `main` to it —
`postProcess`'s HDR→swap tonemap, `volumeUpsamplePass`'s blit, and
`drawPickDebugOverlay`'s pick→swap blit — and delete the bespoke versions. No
registry / slab / `renderFrame`-order change. Pure de-duplication; visual
baseline unchanged. **Merge-order with PR #386:** if this phase lands first,
#386 rebases and its `foregroundComposite` dissolves into the `Compositor`
(one `draw(..., 'over', TONE)` call); if #386 lands first, `foregroundComposite`
joins the repoint list here. Either order works; landing the Compositor first is
less total code.

**Phase 2 — Slab table + RenderTarget table + flat ContentLayer registry + FrameStep program.**
Replace `HDR_PASSES` / `UI_PASSES` / the bespoke foreground wiring with one flat
`ContentLayer` registry and the `FRAME` data program executed by a small executor.
Foreground stops being a `renderFrame` special case; captions become a swap layer.
Two slabs, derived per frame as today. `renderFrame` shrinks to "run `FRAME`."
Included here, because the registry's target↔pipeline-profile invariant has
nothing to attach to without it: **every renderer factory declares its target
format explicitly** (a `targetFormat` field, or the `RenderTargetSpec` id).
Today three idioms coexist in `initGpu` — a positional format arg
(`createFilamentRenderer(device, 'rgba16float', …)`,
`createVolumeUpsample(device, 'rgba16float')`), the `GpuContext.format` field
_repurposed_ to mean render-target format
(`createTexturedDiskRenderer({ …, format: 'rgba16float', … })` vs `uiCtx` using
the same field for the swap format), and a ctx-bag-plus-positional-override
hybrid (`createStructureMarkerRenderer(uiCtx, 'rgba16float', …)`). After this
phase `GpuContext.format` means swap-chain format, always. The executor also
absorbs the single/split timing fork and the volume/flow hoist described under
_CompositeStep + FrameStep_ above; `TIMED_SLOT_NAMES` derives from the program.

**Phase 3 — Pick folded in, space-aware (N=1).**
Starts with the pick-camera prerequisite (see _Pick_ above): camera-for-pick
becomes a value from the slab table; `lastFrameUniformBytes` is deleted. Then
add the `drawPick` aspect to pickable content layers; build the pick program as a
parallel registry consumer with per-slab pick targets + the `frontmostPick`
resolver. Cosmological-only in practice (N=1), but the structure supports a
near-field pickable layer with no restructure.

## Testing strategy

The headline win: **frame order becomes data, so it becomes unit-testable** — today
the ordering lives in imperative `renderFrame` code that no test asserts.

- **Phase 1:** the JS-mirror tone-map curve test already covers the shared curve
  math (`tests/services/gpu/passes/toneMap.test.ts`; `Compositor` reuses
  `lib/tonemap.wesl`). Add a test asserting each former call site (`postProcess`
  tonemap, `volumeUpsample` blit, `pickDebugOverlay` blit) maps to the same
  `(blend, tone)` config it used before. Visual-equivalence baseline unchanged.
- **Phase 2:** unit-test the slab table (per-frame `near < far`, descending composite
  order), the `target` ⟷ renderer-profile invariant (a layer's target/blend matches
  its renderer's pipeline), and the `FRAME` program (assert the step sequence — now
  possible because it's data). Per-layer `enabled` gates carry over verbatim.
- **Phase 3:** `frontmostPick` is a pure function → exhaustive unit tests
  (all-zero, single-slab hit, near-occludes-far, far-only). Per-slab pick-pass
  structure mirrors the existing pick test.

## File structure

Follows project conventions: one type per file in `@types/`, one function per file
in `utils/`, `type` aliases never `interface`, deep relative imports, no barrels
(the `frame/passes/index.ts` registry exception applies — the new
`frameProgram.ts` owns the registry decision, not a re-export barrel).

- `@types/engine/frame/`: `Slab.d.ts`, `ContentSpace.d.ts`, `RenderTargetSpec.d.ts`,
  `ContentLayer.d.ts`, `Blend.d.ts`, `CompositeStep.d.ts`, `FrameStep.d.ts`.
- `@types/rendering/Compositor.d.ts`, `@types/rendering/ToneMap.d.ts`,
  `@types/rendering/CompositeBlend.d.ts`.
- `services/gpu/passes/compositor.ts` + `shaders/compositor/{vertex,fragment}.wesl`.
- `services/engine/frame/slabs.ts` — per-frame `SLABS` derivation from `cam.distance`.
- `services/engine/frame/contentLayers.ts` (or keep per-layer files + an index, as
  `passes/` does today) — the flat registry.
- `services/engine/frame/frameProgram.ts` — the `FRAME` data + the executor.
- `services/engine/frame/pickProgram.ts` — the parallel pick program.
- `utils/picking/frontmostPick.ts` + test.

Exact paths and the fate of each existing `*Pass.ts` file are settled at plan time.

## Relationship to existing backlog

Three backlog items landed on `main` (2026-06-29) in this problem space; this spec is
not writing on a blank slate. Where it overlaps each, and where it deliberately
diverges:

- **`docs/backlog/2026-06-29-render-graph-restructure.md`** — "model the frame as a
  graph of passes with declared inputs/outputs; ordering and resource lifetimes fall
  out of dependency edges." This spec is a **partial promotion** that **narrows** it:
  instead of a full dependency DAG with derived ordering, it proposes an explicit
  ordered `FrameStep` program. The trade is deliberate — an explicit, readable,
  unit-testable list (where "labels occluded by bodies" is a visible ordering decision
  in `FRAME`) is simpler than a DAG and sufficient for the current pass count. A DAG
  can be layered on later if dependency edges ever need to drive resource lifetimes
  automatically; this spec does not foreclose it. **Per the backlog-hygiene
  convention, this item's index line + detail file should be removed when this spec is
  accepted** (the spec becomes the source of truth for the frame-order half).

- **`docs/backlog/2026-06-29-picking-gpu-subsystem.md`** — migrate pick GPU resources
  into their own subsystem (the pick texture is per-camera, so the fade pattern doesn't
  transfer; wants its own ADR first). This spec is **orthogonal and complementary**: it
  addresses the _scheduling/registry_ half — pick becomes a parallel program consuming
  the same `ContentLayer` registry via a `drawPick` aspect — but does **not** do the
  GPU-resource-ownership migration that item calls for, and does **not** supersede its
  ADR. The two compose: the `drawPick` model here is agnostic to whether
  `pickRenderer`'s textures later move into a picking subsystem. (Consistent with #362,
  which already lifted pick out of the render frame — the lifecycle half.) This item
  **stays** on the backlog.

- **`docs/backlog/2026-06-29-gpu-handle-nullability.md`** — `EngineGpuHandles` fields
  are all `| null`, and `PassDeps` re-threads renderers purely to launder that null at
  the `renderFrame` boundary; the target is a narrowed non-null "ready GPU" view. This
  spec **advances** that cleanup rather than fighting it: the flat `ContentLayer`
  registry reads renderers from `state.gpu.*` directly (passes already receive
  `state`), which is exactly the end-state that item wants — so `PassDeps` can shed its
  renderer fields as the registry lands. The spec's **new** GPU handles (`Compositor`,
  `foreground:k` / `pick:<slab>` targets, the slab table) must follow the same rule:
  narrow bootstrap-guaranteed handles **once** into the ready view, never add fresh
  ad-hoc `| null` + `PassDeps` threading. The teardown-asymmetry caveat from that item
  (no big-bang ready flag; the 2026-05-08 black-screen incident,
  `feedback_lifecycle_vs_teardown_invariants`) binds any new handle this spec adds.
  This item **stays** on the backlog (the spec depends on its direction but doesn't
  complete it).

## Alternative considered: full frame DAG

The frame-order layer could be a full dependency graph (a Frostbite-style frame graph)
instead of an ordered `FrameStep` list: each node declares the resources it **reads**
and **writes**, edges are derived (`writer(r) → reader(r)`), a topo-sort produces the
order, and resource lifetimes fall out for pooling/aliasing. The three axes
(`slab` / `target` / `blend`), `ContentLayer`, `Compositor`, and the renderers are
unchanged either way — only the program representation differs. Two findings rule it
out for now:

**1. The swap-chain OVER chain can't be ordered from reads/writes alone.** `tonemap`,
`ui-overlay`, `fg-composite`, and `captions` all read _and_ write `swap`, so there is no
acyclic `writer → reader` edge to order them — the part of the frame where "order falls
out of the edges" is exactly where it fails. The standard fix is SSA-style resource
versioning (`swap@1 → swap@2 → swap@3 → swap@4`), but that just re-encodes the ordered
list as data-dependencies: for a linear composite chain the DAG does not _derive_ the
order, you re-author it through version threading, plus a compile step.

**2. The frame is linear — now and in the dynamic-slab future.** `hdr` accumulation is
commutative (additive); the `swap` chain is strictly sequential; the only genuine fan-in
is `fg-composite` (needs `fg0` **and** `swap`). A DAG earns its keep on
branching/parallelism (concurrent passes to schedule, non-trivial lifetime aliasing,
dead-pass culling) — skymap has almost none, and WebGPU inserts barriers/transitions
itself (a Vulkan/D3D12 motivation that does not apply here). Critically, the deferred
dynamic-slab future is _also_ a linear far→near stack (see Out of scope): the dynamism is
only _how many slabs are in the stack this frame_, handled by **generating** the ordered
`FrameStep` list from the active-slab set, not by a graph:

```ts
function buildFrame(slabs: Slab[]): FrameStep[] {
  return [
    ...slabs.map((s) => ({ kind: 'render', target: targetFor(s) })), // populate each slab
    { kind: 'composite', step: { source: 'hdr', dest: 'swap', op: TONEMAP_BLIT } },
    ...slabs
      .filter(isNearfield)
      .reverse()
      .map(
        (
          s, // composite far → near
        ) => ({
          kind: 'composite',
          step: { source: targetFor(s), dest: 'swap', op: TONEMAP_OVER },
        }),
      ),
  ];
}
```

So the program graduates from a constant `FRAME` to a generated function when slabs go
dynamic — still a flat ordered list, no SSA, no topo-sort. A DAG stays available to
layer on later **only if** real parallel/branchy structure ever appears; this spec does
not foreclose it, but does not pay for it speculatively.

## Out of scope (explicitly deferred)

- **Slab spawn/retire & adaptive slab-set.** No `cam.distance → active-slab-set`
  function; no depth handoff between adjacent slabs at a shared boundary. The type is
  N-capable but the spec instantiates the two slabs that exist today. A third slab
  (e.g. an Earth-surface descent slab) is future work.

  When built, _dynamic slabs_ means a **generated** `FrameStep` list driven by **camera
  scale** — at any zoom only ~2 adjacent slabs are active (the one the camera is in, plus
  the backdrop/next-coarser for context), a window that slides down a scale ladder
  (surface ~m → solar-system ~AU → stellar ~pc → cosmological ~Mpc) as the camera dives.
  It stays a linear far→near stack (see _Alternative considered: full frame DAG_), not a
  graph. What makes slabs dynamic is _camera scale_, **not** data loading or texture
  detail — those are an orthogonal **content axis**: loading/unloading a catalog changes
  what _populates_ a scale band (it can drive lazy GPU-target allocation, but not
  topology), and texture LOD (hi-res Earth/planet albedo) is pure texture streaming,
  independent of depth slabs. The concrete motivator for a _third_ slab is a
  **stellar / parsec** slab fed by a star catalog (Gaia): the parsec regime is where
  **f64 becomes load-bearing** (Proxima ~1.3 pc — compose-in-f64-then-narrow beats
  separate-narrow; f32 is adequate only out to ~1 AU). Hi-res _terrain geometry_ (not
  texture) near a surface camera would similarly motivate the surface slab.

- **New renderer pipeline variants.** No opaque-galaxy-in-near-field variant, etc. —
  added only when a concrete feature needs one.
- **Making bodies selectable.** Pick is space-aware, but no near-field `drawPick`
  ships (there is no pickable body yet); `pick:near0` is allocated lazily.
- **The translucent atmosphere itself.** The model is shaped so an atmosphere drops
  in as one more layer/target, but building it is a separate feature.

## Open questions / notes for iteration

- Should the two `render target: 'swap'` steps be disambiguated by an explicit
  `slabClass` field on the step, or is "select layers whose `target === swap` and
  whose slab matches the step's position" too implicit? (Leaning: explicit field.)
- `flow` compute is modelled as a `FrameStep` `compute` kind; confirm that's the
  right home vs. a separate pre-frame compute list.
- Whether `slabs.ts` should expose `vpFor(slab)` on `ReadyFrameContext` or keep the
  VP lookup inside the executor.
