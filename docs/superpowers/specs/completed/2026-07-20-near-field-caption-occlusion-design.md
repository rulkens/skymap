# Near-field caption occlusion behind planet bodies

**Status:** design · 2026-07-20
**Branch:** `worktree-labels-occlude-behind-planets`

## Problem

At solar-system zoom the near-field scene-body captions (Sun / Earth / Moon /
planets / local star map — the `foregroundLabelsLayer` set) and their leader
lines are drawn as a **depthless post-tone-map overlay**. A caption for a body
that is geometrically **behind** a nearer body draws **in front of** it: e.g. a
planet's name floats over the disk of a nearer planet occluding it. The captions
never depth-test against the bodies, so there is no occlusion at all — a distant
label always wins.

### Why this is near-field-only by construction

The bodies' depth buffer (`foreground:0` depth) is written by the **NEAR0** slab,
whose near/far track the camera's orbit distance. The COSMO galaxy/structure
labels (`labelsLayer`) project through the **COSMO** slab (fixed 10 kpc near
plane). A depth value is `clip.z / clip.w` *within a projection's frustum*, so a
COSMO label's depth and a NEAR0 body's depth are encoded against different
near/far planes and are **not comparable numbers**. COSMO labels therefore get
their planet-occlusion the only way that works across slabs — draw-order
**silhouette** occlusion (they are painted into `swap` before the opaque bodies
composite over them). That is a cross-slab necessity, not a bug, and is **out of
scope**.

The near-field captions are the tractable case precisely because they share the
**NEAR0 slab with the bodies**: their `clip.z` is directly comparable to the
`foreground:0` depth buffer. This fix is, by construction, near-field-caption
only.

## Goal

Near-field captions and their leader lines are **occluded per-pixel** wherever a
nearer body covers them, while remaining a crisp post-tone-map overlay with no
change to their colour, sizing, fade, declutter, or frame ordering.

Non-goals: COSMO label occlusion (see above); the selection ring (a UI halo that
should stay on top); any change to the body renderers or the tone curve.

## Invariants this fix relies on

- **Captions always sit above their body** on a leader line
  (`liftedLabelPlacement`) — the glyph block hangs in clear sky above the body,
  the connector ending a gap above the top rim. So a body's *own* caption never
  overlaps its own disk; the only thing that should hide a caption is a
  *different, nearer* body intruding into the sky region where the caption draws.
- The caption vertex shader **already emits the anchor's true clip-space depth**
  for in-frustum anchors (`labels/vertex.wesl`: `clampedClipZ =
  min(clip.z, clip.w·(1-ε))`). In-frustum planet captions keep their true depth;
  only beyond-far captions (the star-map-from-inside set) get clamped to the far
  plane — where being occluded by any overlapping body is acceptable.
- `foreground:0` and `swap` both render at `scale: 1` (full resolution), so a
  fragment's `@builtin(position).xy` in the swap pass indexes the `foreground:0`
  depth texel 1:1 — no scale factor in the sample.

## Approach — depth-aware overlay (sample + discard)

Keep `foregroundLabelsLayer` exactly where it is (post-tone-map overlay in the
`(swap, NEAR0)` pass). Make the `foreground:0` depth texture **sampleable**, and
in the *foreground* label + leader-line fragment shaders sample the scene depth
at each fragment and `discard` where the caption's own depth is behind it.

This was chosen over the two alternatives because:

- **vs. draw-order silhouette (reorder before the body composite):** would
  require splitting the captions out of the `(swap, NEAR0)` pass they share with
  `near0-selection-ring` (the halo must stay on top) — a frame-model change — and
  is silhouette-not-Z (a caption overlapping a *farther* body would be wrongly
  hidden).
- **vs. a shared depth *attachment* on the swap pass (native depth-test):** a
  WebGPU pass with a depth attachment forbids depthless pipelines, so it would
  force `near0-selection-ring` (and every future NEAR0 overlay) to declare a
  depth state forever — a pass-wide constraint. Sampling keeps the pass
  unconstrained; only the renderers that opt in read depth.

### Occlusion test

Body depth uses `depthCompare: 'less'`, cleared to `1.0` (far). A caption
fragment at window-space depth `d_cap` is occluded when a nearer body covers its
pixel, i.e. `sceneDepth < d_cap`:

```wgsl
// shaders/lib/sceneDepth.wesl
@group(1) @binding(0) var sceneDepthTex: texture_depth_2d;

fn occludedByScene(fragXY: vec2f, fragDepth: f32) -> bool {
    // textureLoad — no sampler; depth textures are unfilterable.
    return textureLoad(sceneDepthTex, vec2i(fragXY), 0) < fragDepth;
}
```

At a caption's pixels the scene depth is usually `1.0` (empty sky above the body)
→ kept. Where a nearer body intrudes, `sceneDepth < d_cap` → discarded. A
beyond-far caption clamped to `~far` is kept over empty sky and discarded behind
any overlapping body — the desired behaviour.

## Architecture — the ideal diff (growth on existing seams)

No registry / `.bin` format / store change. This is a renderer-capability
addition riding seams that already exist (the upsample layers already sample an
earlier offscreen target's texture in a later pass, and `volumeUpsample` already
builds its bind group per-frame from a draw-arg view).

1. **`renderTargets.ts` — foreground depth becomes sampleable.** The depth
   texture usage gains `TEXTURE_BINDING` (currently `RENDER_ATTACHMENT` only).
   This is a deliberate relaxation of the module's stated "never `TEXTURE_BINDING`"
   constraint (docblock ~`:69-80`, allocate `:207`) — update the docblock to say
   the foreground depth is now sampled by the caption occlusion pass. Only one
   depth row exists, so this is one flag, no new branch.

2. **Shared occlusion joint (new, consumed by both foreground renderers).**
   - `shaders/lib/sceneDepth.wesl` — the `texture_depth_2d` binding at
     `@group(1) @binding(0)` + `occludedByScene(...)` (above).
   - `renderers/labels/occlusionDepthGroup.ts` — the group(1) bind-group-layout
     entry + a per-frame bind-group builder from a `GPUTextureView`. Mirrors
     `volumeUpsample.ts:92-97`, which builds its bind group per-frame from the
     draw-arg view (so there is no resize-coordination between the long-lived
     renderer and the per-resize depth texture).

3. **`labelRenderer` + `markerLineRenderer` factories — optional occlusion
   capability** behind a construction flag:
   ```ts
   createLabelRenderer(ctx, format, atlases, { occludeAgainstDepth: true })  // foreground
   createLabelRenderer(ctx, format, atlases)                                 // COSMO — unchanged
   ```
   When enabled the factory: (a) adds the group(1) depth BGL from
   `occlusionDepthGroup.ts`; (b) uses the occlusion **fragment variant** that
   runs `if (occludedByScene(pos.xy, pos.z)) { discard; }`; (c) accepts an
   optional `sceneDepthView` on `draw(...)` and builds the group(1) bind group
   per-frame from it. The COSMO path compiles and binds none of this.

   **Shader-variant guardrail:** the variant comes from the shared
   `sceneDepth.wesl` snippet gated by a WESL feature flag — **not** a forked
   near-duplicate fragment file. The exact `?static` / feature-flag mechanism is
   a wesl-shaders-skill detail for the plan; the constraint is one shared snippet,
   two consumers.

4. **`foregroundLabelsLayer.draw` — thread the depth view** through the existing
   `ctx.renderTargets` seam:
   ```ts
   const depthView = ctx.renderTargets.depthViewOf('foreground:0');
   lineRenderer.draw(pass, rebasedVpF32, viewportPx, depthView);
   renderer.draw(pass, rebasedVpF32, viewportPx, depthView);
   ```

5. **`initGpu.ts` (~`:489-514`)** — construct the two *foreground* instances with
   `{ occludeAgainstDepth: true }`; the COSMO instances (`:213-214`) are
   unchanged.

### Draw signature

The shared `LabelRenderer` / `MarkerLineRenderer` `draw` gains an **optional 4th
`sceneDepthView?: GPUTextureView`** arg — backward-compatible; only the
occlusion-enabled foreground instances receive it, and only they build/use the
group(1) bind group. A non-null view arriving at a non-occlusion instance is a
wiring bug and may be ignored or asserted.

## Ground preparation

**None needed — the feature is growth on existing seams.** Every touchpoint above
is an addition at a seam that already exists: the "later pass samples an earlier
offscreen target" seam (`volumeUpsampleLayer` / `starAggregateUpsampleLayer`),
the "per-frame bind group from a draw-arg view" seam (`volumeUpsample.ts`), the
`ctx.renderTargets.depthViewOf(...)` accessor, and the factory construction-flag
seam. The one deliberate change (foreground depth → sampleable) is a one-line
usage relaxation, not structural prep. The shared `sceneDepth.wesl` +
`occlusionDepthGroup.ts` are the consolidation that keeps the two consumers
(glyphs + leader lines) one joint rather than two parallel bolt-ons. No separable
prep PR; no adjacent knot warranting a backlog file. (refactor-ground checkpoint
signed off 2026-07-20.)

## Performance

Effectively free. This is the depthless caption overlay — one of the cheapest
passes — not a fill-bound one.

- **Per-fragment:** one `textureLoad` + compare + `discard` over the caption +
  leader-line footprint (a couple dozen short labels + thin lines, a few thousand
  pixels). Negligible against the fill-bound passes (points, star aggregates,
  volume raymarch move millions of fragments/frame).
- **`discard`:** normally forfeits early-Z, but this overlay has no depth
  test/write, so there is no early-Z to lose — no pipeline-wide penalty.
- **Per-frame bind group:** two tiny group(1) creations/frame (glyphs + lines),
  one texture entry each — the same per-frame pattern `volumeUpsample.ts` already
  uses. Trivial CPU.
- **Depth store traffic:** **none added** — `foreground:0` depth is already
  `depthStoreOp: 'store'` (`executeFrame.ts:136`); this fix only *reads* what is
  already written.
- **`TEXTURE_BINDING` on the depth texture:** on tiled GPUs (iOS/Metal) a
  sampleable depth attachment can lose lossless depth compression, marginally
  raising store bandwidth. Bounded small — `foreground:0` holds only a handful of
  body spheres, so its depth footprint is tiny. The only hardware-level cost; the
  iOS pass ([V6]) covers it.
- **Passes / draws / wakeups:** zero added — same pass, same draw count, no
  reorder, no render-on-demand change. The `swap·NEAR0` timing slot should be
  unchanged (confirmable via the GPU-timing harness).

## Testing

Per `testing.md` — test what can break on a real bug no compiler/other test
catches.

- **`occludedByScene` decision boundary is pure and worth a unit test** if
  extracted to a testable TS twin, but it is one-line WGSL; prefer instead a test
  on the **layer-side wiring**: `foregroundLabelsLayer.draw` calls both renderer
  draws with the `foreground:0` depth view (guards the thread-through that a
  refactor could silently drop, turning occlusion back off with no type error).
- **`occlusionDepthGroup` bind-group builder** — assert it produces a layout
  whose single entry is a `sampleType: 'depth'` texture at group(1)/binding0 (a
  mismatch here is a pipeline-creation validation error that only surfaces on a
  real device; a cheap CPU test catches the layout drift).
- **No test for:** the discard itself (GPU behaviour, verified visually), the
  clip-z the vertex already emits (unchanged), or constant/registry restatements.

### Visual verification (real device — the load-bearing check)

Occlusion is a per-fragment GPU effect; the primary verification is visual on the
running dev server (`:5175`, real data linked):

- **[V1]** At solar-system zoom with two planets roughly in line, the farther
  planet's caption + leader line are hidden where the nearer planet's disk covers
  them, and poke out where they clear its silhouette.
- **[V2]** A body's **own** caption is never clipped by its own disk (lifted above
  it; sky depth `1.0`).
- **[V3]** The `near0-selection-ring` halo still draws **on top** of bodies
  (unaffected — it does not opt into occlusion).
- **[V4]** COSMO galaxy/structure labels are visually unchanged (silhouette
  occlusion as before).
- **[V5]** Beyond-far star-map captions (viewed from inside the neighbourhood)
  are not spuriously clipped over empty sky.
- **[V6] iOS pass** — the depth-sample fragment variant compiles and runs on
  WebKit (stricter than Chrome's Tint; a bad shader silently drops the whole
  frame — see CLAUDE.md). Confirm via `createShaderModuleWithDevLog`.
```
