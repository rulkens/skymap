# Full bloom pass — Sun, planets, stars, Milky Way — plan

> **Spec.** [`docs/superpowers/specs/2026-07-21-sun-full-bloom-pass-design.md`](../specs/2026-07-21-sun-full-bloom-pass-design.md)
> (approved; grill log `docs/grill-sessions/sun-full-bloom-pass-2026-07-21.md`).
> **Ground preparation.** Present (spec §2): six growth touchpoints + one draw-order
> joint that must become a real joint (prep A/B). Prep and feature ride **one PR**, commits
> sequenced prep-first (user call, memory `prep-rides-same-pr-ask`).
> **Style.** Contract code only — signatures, target rows, test names/assertions. No
> implementation bodies; the implementer reads the cited current code and the test names.

## Orientation for the implementer

The frame is **data**: `frameProgram(...)` returns an ordered `FrameStep[]`, and
`executeFrame` is the one loop that walks it (`src/services/engine/frame/frameProgram.ts`,
`executeFrame.ts`). A `'render'` step draws every `ContentLayer` whose `(target, slab)`
matches, in registry order (`passes/index.ts`). A `'composite'` step merges one target
into another through the shared `Compositor`. The executor's per-frame `touched` set
(`executeFrame.ts:42-45,102-112`) makes the **first** pass against a target `loadOp:'clear'`
(with `TARGET_CLEAR_VALUES[target]`, throwing if missing) and every later pass
`loadOp:'load'` — this is what lets the bloom fold-in-place chain re-target `bloom3..bloom0`
with **zero executor changes**.

Three big things the tasks below lean on, read them first:

- **`sceneDepth.wesl` coverage occlusion** — `foregroundLabelsLayer` samples the
  `foreground:0` depth to discard captions behind nearer bodies
  (`foregroundLabelsLayer.ts:578-606`, `shaders/lib/sceneDepth.wesl`,
  `renderers/labels/occlusionDepthGroup.ts`). Prep A extends this same mechanism to three
  COSMO overlay layers. It is a **coverage** test (foreground depth *written* at this pixel
  ⇒ discard), NOT a cross-slab depth compare — COSMO depths are not comparable to NEAR0
  reversed-Z (spec §2).
- **The `volumeUpsample` blit shape** — `passes/volumeUpsample.ts` (pass factory) +
  `passes/volumeUpsampleLayer.ts` (screen-space `ContentLayer` that ignores `SlabView`,
  additive into `hdr`). The bloom fold layer and the bloom pyramid factory mirror this
  shape.
- **The tool's dual-filter bloom** — `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts`
  (pass header lines 8-46, `BLOOM_MIPS = 5` line 124, `buildTargets()` mip pyramid
  370-451, per-level `mipTexelBufs` 396-400, one/one additive upsample pipeline 293-311)
  and `tools/galaxy-renderer/src/engine/shaders/{bloomBright,bloomDownsample,bloomUpsample}.wesl`.
  Ported (adapted, not shared) in Phase 3.

**House rules that bind every task:** each task ends in its own commit (stage specific
paths, never `git add -A`; message trailer `Co-Authored-By: Claude Fable 5
<noreply@anthropic.com>`). `type` aliases never `interface`; one symbol per file in
`utils/` + `@types/`; deep relative imports, no barrels; RTK reducer args named
`settings`/`action`. Any `.wesl` task: load the **wesl-shaders** skill; single quotes in
comments (never backticks); no duplicate `@builtin` declarations; `?static` imports +
literal `package::` paths. Any `src/components/**` task: load the **create-component**
skill first. Do not kill the running dev server — visual checks ask the user to look.

---

## Phase 1 — Prep A: COSMO overlays occlude bodies by coverage, not draw order

**Why behaviour-neutral now.** Today the COSMO overlay swap render (`swap·COSMO`) runs
**before** the `foreground:0` body render, so at that point `foreground:0` is untouched and
the guarded depth view is `undefined` → the occlusion path is **dormant** (the renderers
fall back to their plain pipeline, exactly as `foregroundLabelsLayer.ts:592-594` does when
the body pass hasn't run). Prep A adds the capability; prep B's reorder activates it. So
Prep A must change nothing visually.

### Task 1: labels + marker-lines COSMO coverage occlusion

The COSMO `labelRenderer` / `markerLineRenderer` already support `occludeAgainstDepth`
(the `foreground*` instances use it — `initGpu.ts:530-556`; `MarkerLineRenderer.draw`'s
4th `sceneDepthView` arg + `LabelRenderer` twin; `shaders/labels/fragmentOcclude.wesl`,
`shaders/markerLines/fragmentOcclude.wesl`). This task only opts the **COSMO** instances
in and feeds them the guarded depth view.

**Files:**
- `src/services/engine/phases/initGpu.ts` (modify) — pass `{ occludeAgainstDepth: true }`
  to the COSMO `createLabelRenderer` (line ~215) and `createMarkerLineRenderer` (line ~216),
  matching the foreground instances at 530/554.
- `src/services/engine/frame/passes/labelsLayer.ts` (modify) — pass the guarded
  `foreground:0` depth view as the 4th `draw` arg.
- `src/services/engine/frame/passes/markerLinesLayer.ts` (modify) — same.

**Interfaces**
- Consumes: `LabelRenderer.draw(pass, vp, viewportPx, sceneDepthView?)`,
  `MarkerLineRenderer.draw(pass, vp, viewportPx, sceneDepthView?)`,
  `ctx.renderedTargets: ReadonlySet<string>`, `ctx.renderTargets.depthViewOf('foreground:0')`.
- Produces: no new exports (behaviour of two existing layers).

- [x] In each layer's `draw`, derive the depth view exactly as
      `foregroundLabelsLayer.ts:592-594` does:
      `const depthView = ctx.renderedTargets.has('foreground:0') ? ctx.renderTargets.depthViewOf('foreground:0') : undefined;`
      and pass it as the trailing `draw` arg.
- [x] Flip both COSMO renderer constructions in `initGpu.ts` to `occludeAgainstDepth: true`.
- [x] `npm run typecheck` green. (No unit test: the occlusion is a device-level pipeline
      behaviour, dormant until prep B — verified by the Task 3 visual check.)
- [x] Commit.

### Task 2: selection-ring COSMO coverage occlusion

Unlike labels/marker-lines, the selection-ring renderer family has **no** occlusion
variant yet — add it, mirroring the labels/markerLines occlusion split. The one
`selectionRingRenderer` instance is shared by `selectionRingLayer` (COSMO) and
`near0SelectionRingLayer` (NEAR0); only one draws per frame (partitioned by slab —
`selectionRingLayer.ts:50-59`). Making the shared instance occlusion-**capable** is safe:
`near0SelectionRingLayer` passes no depth view → the plain pipeline (same
depth-view-present-selects-pipeline behaviour the label/markerLine renderers already use).
Only `selectionRingLayer` (COSMO) feeds the guarded depth view.

**Files:**
- `src/services/gpu/shaders/selectionRing/` (create) — add a `fragmentOcclude.wesl`
  sibling that imports `package::lib::sceneDepth::occludedByScene` and discards on
  coverage, mirroring `shaders/labels/fragmentOcclude.wesl`. (Load wesl-shaders skill.)
- `src/services/gpu/renderers/selectionRing/selectionRingRenderer.ts` (modify) — accept an
  optional `{ occludeAgainstDepth: boolean }` init like `createLabelRenderer`; build both
  the plain and the occlude pipeline + the group(1) occlusion bind-group layout
  (`OCCLUSION_DEPTH_LAYOUT_DESC`, `OCCLUSION_DEPTH_GROUP_INDEX`,
  `createOcclusionDepthBindGroup` from `renderers/labels/occlusionDepthGroup.ts`); select
  the occlude pipeline per-draw only when a `sceneDepthView` is supplied.
- `src/@types/rendering/SelectionRingRenderer.d.ts` (modify, if present) — add the optional
  trailing `sceneDepthView?: GPUTextureView` to `draw` and document it verbatim to the
  `MarkerLineRenderer.d.ts:39-44` note.
- `src/services/engine/phases/initGpu.ts` (modify, line ~222) — construct with
  `{ occludeAgainstDepth: true }`.
- `src/services/engine/frame/passes/selectionRingLayer.ts` (modify) — pass the guarded
  `foreground:0` depth view (same guard as Task 1) as a trailing `draw` arg after the
  existing `{ worldPos, ringRadiusPx }`.

**Interfaces**
- Consumes: `occludedByScene(fragXY, fragDepth)` (`shaders/lib/sceneDepth.wesl`),
  `OCCLUSION_DEPTH_GROUP_INDEX`, `OCCLUSION_DEPTH_LAYOUT_DESC`,
  `createOcclusionDepthBindGroup` (`occlusionDepthGroup.ts`).
- Produces: `createSelectionRingRenderer(ctx, format, init?: { occludeAgainstDepth?: boolean })`
  with an occlude pipeline; `draw(pass, vp, viewportPx, ring, sceneDepthView?)`.

- [x] Add the occlude fragment shader (group(1) depth, `discard` when `occludedByScene`).
- [x] Add the dual-pipeline + per-draw selection to the renderer; keep the existing plain
      path byte-identical when no depth view is passed.
- [x] Wire `selectionRingLayer` to feed the guarded depth view; leave
      `near0SelectionRingLayer` unchanged (no depth view → plain pipeline).
- [x] `npm run typecheck` green. (No headless unit test — the pipeline/shader binding is
      device-only, like the caption occlusion; the `occlusionDepthGroup.test.ts` precedent
      pins the descriptor shape, which this reuses unchanged.)
- [x] Commit.

### Task 3: Prep A visual neutrality checkpoint (no commit)

- [x] Ask the user to look at the running dev server: cosmological selection rings, label
      stems, MSDF labels, and marker lines must look **exactly as before** (bodies still
      occlude them by draw order; the new coverage path is dormant because `foreground:0`
      renders after the overlays this phase). Confirm nothing changed before Prep B lands.

---

## Phase 2 — Prep B: one tone-map

### Task 4: compositor derives dst format from the composite `dest`, not from `blend`

`compositor.ts:225-229` hard-wires `over → swapFormat`; the new
`foreground:0 → hdr (over)` composite (Task 5) targets the `rgba16float` hdr format, so the
dst format must come from the **dest target**, not the blend. The executor already knows
each composite's `dest` and can resolve its format from the target table.

**Files:**
- `src/@types/rendering/Compositor.d.ts` (modify) — add a `dstFormat: GPUTextureFormat` arg
  to `draw`.
- `src/services/gpu/passes/compositor.ts` (modify) — take `dstFormat` as a draw arg; drop
  the `dstFormatFor` by-blend map (225-229); key the pipeline/uniform cache on
  `` `${blend}:${dstFormat}` `` from the passed format. `swapFormat`/`hdrFormat` init args
  become unused for format derivation — keep `createCompositor` accepting whatever the
  caller passes but stop deriving format from blend.
- `src/services/engine/frame/executeFrame.ts` (modify, composite case ~216-243) — resolve
  the dest format (`'swap'` → the acquired swap format the ctx carries; else
  `ctx.renderTargets.specs.find(s => s.id === dest)!.format`) and pass it to
  `compositor.draw(pass, srcView, blend, tone, dstFormat)`.

**Interfaces**
- Consumes: `RenderTargets.specs: readonly RenderTargetSpec[]` (each `{ id, format, ... }`).
- Produces: `Compositor.draw(pass, src, blend, tone, dstFormat)`.

- [x] Change the `Compositor` type + `compositor.ts` to take `dstFormat`; the cache key is
      unchanged in shape (`blend:dstFormat`) but now honest for `over→hdr`.
- [x] Thread the dest format from `executeFrame`'s composite case.
- [x] `npm run typecheck` green; `npm test -- compositor` and `npm test -- executeFrame`
      green (the JS-mirror tone tests in `toneMap.test.ts` are unaffected — no math
      changed).
- [x] Commit.

### Task 5: reorder the frame graph → a single tone-map (+ program-shape test)

Move `foreground:0` before the composites; composite it **over `hdr` in linear** with
`tone: null`; delete the second tone-mapped composite (`foreground:0 → swap`). The
remaining `hdr → swap` replace-composite is the frame's only tone-map. Prep A now carries
the overlay occlusion that draw order used to.

**Files:**
- `src/services/engine/frame/frameProgram.ts` (modify `frameProgram` body + the module +
  `frameProgram` docblocks) — new step order (spec §3, tail):

  ```ts
  { kind: 'render', target: 'foreground:0', slab: NEAR0 },
  { kind: 'composite', step: { source: 'foreground:0', dest: 'hdr', blend: 'over', tone: null } },
  { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone } },
  { kind: 'render', target: 'swap', slab: COSMO },
  { kind: 'render', target: 'swap', slab: NEAR0 },
  ```

  Note the COSMO swap overlay render now runs **after** the single tone-map (activating the
  Prep A coverage occlusion). Delete the old `foreground:0 → swap` OVER composite and the
  old shared-`tone`-across-two-composites wording.
- `tests/services/engine/frame/frameProgram.test.ts` (modify) — this file pins the program
  literal and the derived slot lists; update all three describe blocks.

**Interfaces**
- Consumes: `ToneMap` (`tone`), `COSMO`/`NEAR0`, `CompositeStep`.
- Produces: the reordered `frameProgram(tone)` (unchanged signature this task).

- [x] Rewrite the `frameProgram` return literal to the order above.
- [x] Replace the test `emits the eleven-step main program` literal with the new
      (still 11-step: two computes, four cosmo/near renders, the moved foreground render,
      **two** composites — `foreground:0→hdr` over/tone:null and `hdr→swap` replace/tone —
      then the two swap overlay renders).
- [x] Replace `the two composites share one tone instance` with **`exactly one composite is
      tone-mapped`**: filter composites, assert the `foreground:0→hdr` step has `tone: null`
      and the `hdr→swap` step has `tone === TONE`, and assert exactly one composite carries
      a non-null tone.
- [x] Add **`foreground:0→hdr composite precedes hdr→swap composite`**: assert the index of
      the `foreground:0→hdr` step is less than the `hdr→swap` step.
- [x] Update the `timedSlotsOf` expected arrays (both the fake-registry and the real
      `CONTENT_LAYERS` cases) for the reordered composites: `foreground:0→hdr` now precedes
      `hdr→swap`, and the near-field tail no longer emits a `foreground:0→swap` slot. Update
      the `timedSlotGroupsOf` `Composites & pick` rows accordingly.
- [x] `npm test -- frameProgram executeFrame` green; `npm run typecheck` green.
- [x] Commit.

### Task 6: Prep B ratified-look visual checkpoint (no commit)

- [x] Ask the user to look: bodies-over-starlight now tone-maps **once in linear**
      (`tonemap(fg over hdr)`), an imperceptible-to-better change; the Sun's limb over the
      starfield and the COSMO overlays behind bodies must read correctly (the overlays now
      occlude via Prep A coverage, not draw order). This is the ratified look change (spec
      §2). Confirm before the feature commits.

---

## Phase 3 — Feature: the bloom chain

### Task 7: perf BASELINE (measure, no commit)

Baseline **before** any feature commit, on this worktree's dev-server port (read the port
from the running server's `Local:` line — Vite auto-increments past 5173).

- [x] Run `npm run -s perf -- --scenario solar-system --scenario star-field --scenario
      milky-way --url http://localhost:<port> --json` and also without `--json` for the
      human table; quote **MERGED** TOTALs (per-layer numbers carry ~1-3 ms pass overhead
      and must not be quoted as real costs — `tools/perf/README.md`).
- [x] Record the three MERGED TOTAL medians in the **Perf** section at the bottom of this
      plan file (edit this file; that is the only file this task touches). No commit needed;
      it rides the next commit or stands alone if the user prefers.

### Task 8: bloom WESL shaders port

Port the tool's three shaders (adapted, **not** shared — the tool keeps its copy, spec
§1.2) into a new family with its **own** fullscreen-triangle vertex (WESL module-locality
convention — the vertex fn is per-family duplicated, see `shaders/compositor/vertex.wesl:25-37`).

**Files (create; load wesl-shaders skill):**
- `src/services/gpu/shaders/bloom/io.wesl` — the family's `FullscreenOut` struct
  (`@builtin(position) pos`, `@location(0) uv`) + `fullscreenVertex(vi: u32)`, duplicated
  from the compositor vertex (no shared `fullscreenTri` import — the tool's
  `package::lib::fullscreenTri` is the tool's; the main app duplicates per family).
- `src/services/gpu/shaders/bloom/bright.wesl` — soft-knee prefilter, from
  `bloomBright.wesl`: `f = max(0, l - threshold) / max(l, 1e-4)` on max-channel luma +
  firefly clamp `maxB = 2.0`. Uniform `u: vec4<f32>` — `x` = threshold, `y` = knee (spec §4).
- `src/services/gpu/shaders/bloom/downsample.wesl` — 5-tap dual filter, from
  `bloomDownsample.wesl`: Karis `1/(1+maxChannel)` weighting gated on `u.z > 0.5` (level 0
  only); `u.xy` = source texel size.
- `src/services/gpu/shaders/bloom/upsample.wesl` — 8-tap tent, from `bloomUpsample.wesl`;
  additive blend lives in the pipeline, not the shader; `u.xy` = source texel size.

**Interfaces**
- Consumes: nothing (self-contained WGSL).
- Produces: `bloom/{io,bright,downsample,upsample}.wesl` — `vs`/`fs` entry points, one
  `@group(0)` (sampler @0, texture @1, `u: vec4<f32>` uniform @2).

- [x] Port all four files; adapt every `import package::lib::fullscreenTri::…` to
      `import package::bloom::io::…` (or inline the struct/fn per the compositor pattern).
- [x] Verify each links (`?static`) — a WESL/WGSL error is a build-time failure; run
      `npm run build` after and eyeball no shader-compile errors. (Note: unreferenced .wesl
      files aren't linked until T9 imports them; build passes, real link check is T9.)
- [x] Commit.

### Task 9: bloom render targets + `bloomPyramid` pass factory

Five new target rows + a factory owning the three pipelines and, critically, **per-level**
uniform buffers.

**Files:**
- `src/services/gpu/renderTargets.ts` (modify) — five rows in `buildSpecs()` (spec §5):

  ```ts
  { id: 'bloom0', format: 'rgba16float', depth: null, scale: 2 },
  { id: 'bloom1', format: 'rgba16float', depth: null, scale: 4 },
  { id: 'bloom2', format: 'rgba16float', depth: null, scale: 8 },
  { id: 'bloom3', format: 'rgba16float', depth: null, scale: 16 },
  { id: 'bloom4', format: 'rgba16float', depth: null, scale: 32 },
  ```

  plus one `TARGET_CLEAR_VALUES` entry per row: `{ r: 0, g: 0, b: 0, a: 0 }` (additive
  semantics — `executeFrame` throws on a missing entry, spec §5). No test: a missing clear
  is a loud runtime throw, and target-row constants are not unit-tested (testing.md).
- `src/@types/rendering/BloomPyramid.d.ts` (create) — the handle type.
- `src/services/gpu/passes/bloomPyramid.ts` (create) — the factory, mirroring
  `volumeUpsample.ts` (per-draw bind groups because views are recreated on resize) and the
  tool's `mipTexelBufs` (createGalaxyEngine 396-400, 293-311, `BLOOM_MIPS = 5` line 124).

**Interfaces**
- Consumes: `createShaderModuleWithDevLog`, `ADDITIVE_BLEND` (`lib/blendStates`), the four
  `bloom/*.wesl?static` modules, `Vec2`.
- Produces:

  ```ts
  export type BloomPyramid = {
    readonly label: string;
    // Bright prefilter: reads `srcView` (hdr), writes the pyramid's bloom0 pass. Its own
    // single uniform buffer (drawn once per frame).
    bright(pass: GPURenderPassEncoder, srcView: GPUTextureView, threshold: number): void;
    // Downsample level `level` (1..4): reads `srcView` (bloom[level-1]); `srcTexelSize`
    // = 1/source-pixel-size; `karis` true only for level 1 (Karis on the level-0 read).
    downsample(pass: GPURenderPassEncoder, srcView: GPUTextureView, level: number, srcTexelSize: Vec2, karis: boolean): void;
    // Upsample fold stage `level` (3..0): reads `srcView` (the coarser bloom[level+1]);
    // additive one/one into the bound bloom[level] target.
    upsample(pass: GPURenderPassEncoder, srcView: GPUTextureView, level: number, srcTexelSize: Vec2): void;
    destroy(): void;
  };
  export function createBloomPyramid(device: GPUDevice, hdrFormat: GPUTextureFormat): BloomPyramid;
  ```

- [x] **Per-level uniform buffers, NOT one shared buffer.** The downsample pipeline is
      reused for 4 draws and the upsample pipeline for 4 draws in one frame; a single shared
      uniform buffer written 4× then submitted once is the `queue.writeBuffer`/`submit` race
      (CLAUDE.md "things that have bitten us"; the tool's `mipTexelBufs` exists for exactly
      this). Allocate one uniform buffer **per pyramid level** for downsample and one per
      level for upsample; `level` selects the buffer.
- [x] Downsample + upsample pipelines carry the tool's targets: downsample writes opaque
      (`rgba16float`, no blend), upsample uses `ADDITIVE_BLEND` (one/one) so fold-in-place
      accumulates.
- [x] Add the five target rows + clear values.
- [x] `npm run typecheck` green; `npm run build` green (shader link).
- [x] Commit.

### Task 10: `settings.bloom` state

Mirror the `tonemap` group file-for-file (spec §6). One global
`{ enabled, strength, threshold }`.

**Files:**
- `src/@types/settings/EngineSettingsState.d.ts` (modify) — add the cluster after
  `tonemap`:

  ```ts
  /** Screen-space bloom controls. One global knob set; read live by the bloom pass
   *  layers (strength/threshold) and gated by `enabled` at frame-program build. */
  bloom: {
    enabled: boolean;
    strength: number;
    threshold: number;
  };
  ```
- `src/data/defaults.ts` (modify) — `DEFAULT_BLOOM_ENABLED = true`,
  `DEFAULT_BLOOM_STRENGTH = 0.85`, `DEFAULT_BLOOM_THRESHOLD = 7.0` (just under the star-pass
  `KNEE = 8.0` ceiling — `shaders/lib/starKnee.wesl:41` — so only near-saturated cores
  contribute; the exact value is a post-build tuning target, spec §4/§6).
- `src/state/settings/initialState.ts` (modify) — seed the `bloom` cluster from those three
  constants (mirroring the `tonemap` block at lines 100-103).
- `src/state/settings/settingsSlice.ts` (modify) — three reducers under a `── bloom ──`
  header (args named `settings`/`action`): `setBloomEnabled`
  (`PayloadAction<boolean>`), `setBloomStrength` (`PayloadAction<number>`),
  `setBloomThreshold` (`PayloadAction<number>`); export the auto-derived creators.
- `src/state/settings/selectors.ts` (modify) — `selectBloomEnabled`, `selectBloomStrength`,
  `selectBloomThreshold` (primitive reads, no memo — the sibling `selectExposure` shape at
  lines 83-86).
- `src/@types/engine/settings/SettingsSnapshot.d.ts` (modify) — `bloom` is **not** added to
  the `Pick` (so it is excluded from the tour snapshot, spec §1.2); add `bloom` to the
  docblock's "deliberately excluded" list beside `tonemap` (comment only).

**Interfaces**
- Consumes: `RootState`, `PayloadAction`.
- Produces: `settings.bloom`, `setBloom{Enabled,Strength,Threshold}`,
  `selectBloom{Enabled,Strength,Threshold}`, the three `DEFAULT_BLOOM_*` constants.

- [x] Add the type cluster, defaults, seed, reducers, selectors, snapshot-exclusion comment.
- [x] No reducer/selector restatement or default-object equality tests (testing.md — those
      are change-detectors). `npm run typecheck` green; existing settings tests green.
- [x] Commit.

### Task 11: bloom content layers + registry

Ten screen-space layers driving `bloomPyramid`, each targeting a distinct bloom stage,
reading its source target view (the `volumeUpsampleLayer` shape — ignore `SlabView`).
Register them in `CONTENT_LAYERS`. They are not yet referenced by any render step (Task 13
wires the steps), so they never draw this task — the frameProgram slot tests stay green
(an unmatched layer contributes no slot).

**Files (create under `src/services/engine/frame/passes/`):**
- `bloomBrightLayer.ts` — `name: 'bloom-bright'`, `target: 'bloom0'`, reads
  `hdr` view, calls `bloomPyramid.bright(pass, hdrView, threshold)` with
  `threshold` read live from `state.settings.bloom.threshold`.
- `bloomDownsampleLayer.ts` × 4 — OR one parameterised factory emitting four layers
  (`bloom-down-1..4`, targets `bloom1..bloom4`), each reading `bloom[level-1]` and computing
  `srcTexelSize` from `view.viewportPx` ÷ the source target's `scale`. Fold the four into
  one module that exports the array (right-sizing — the bodies are identical but for level).
- `bloomUpsampleLayer.ts` × 4 — one module exporting four fold layers (`bloom-up-3..0`,
  targets `bloom3..bloom0`), each reading the coarser `bloom[level+1]`, additive.
- `bloomFoldLayer.ts` — `name: 'bloom-fold'`, `target: 'hdr'`, `blend: 'additive'`,
  the `volumeUpsampleLayer` shape: reads `bloom0` and additively blits it into `hdr`,
  scaled by `strength` from `state.settings.bloom.strength`. Because strength is a per-draw
  uniform the generic compositor deliberately lacks, this is a dedicated layer/pass — either
  fold the strength multiply into a small `bloomPyramid.fold(pass, bloom0View, strength)`
  method (preferred — keep all bloom pipelines in the one factory) or a sibling of
  `volumeUpsample`. Add the corresponding method to the `BloomPyramid` type + factory if you
  take the former.
- `src/services/engine/frame/passes/index.ts` (modify) — register all ten layers in
  `CONTENT_LAYERS`. Order within a step is irrelevant here (each bloom target has exactly
  one layer), but keep them grouped for readability.

**Interfaces**
- Consumes: `BloomPyramid`, `ContentLayer`, `ctx.renderTargets.viewOf('hdr'|'bloomN')`,
  `state.settings.bloom.{strength,threshold}`, the target `scale` (from
  `ctx.renderTargets.specs`).
- Produces: `bloomBrightLayer`, four downsample layers, four upsample layers,
  `bloomFoldLayer`; all in `CONTENT_LAYERS`.

- [ ] Each layer's `enabled(state)` returns `state.gpu.bloomPyramid !== null` (the handle is
      minted in `initGpu`; add the `state.gpu.bloomPyramid` field + construction there — a
      `createBloomPyramid(device, hdrFormat)` call beside the other pass factories). The
      program-level `settings.bloom.enabled` gate lives in `frameProgram` (Task 13), so the
      layer gate is just the handle-ready check (per the render-wake / opacity-0 conventions
      the program omits the steps entirely when disabled).
- [ ] `srcTexelSize` per level = `[scale / viewportPx.x, scale / viewportPx.y]` where `scale`
      is the **source** target's divisor — derive it from the target row, never hard-code.
- [ ] Wire `state.gpu.bloomPyramid` construction + null-init + teardown in
      `initGpu.ts` (+ the `EngineGpu` type field).
- [ ] `npm run typecheck` green; `npm test -- passes frameProgram` green (the registry gains
      layers but no new slots until Task 13 adds the steps).
- [ ] Commit.

### Task 12: Display panel — Bloom sub-section (UI)

Per the user decision, the controls go in a **Bloom sub-section of the existing Settings →
Display section** (spec §6). Load the **create-component** skill first.

**Files:**
- `src/components/SettingsPanel/DisplaySection.tsx` (modify) — add three props
  (`bloomEnabled: boolean`, `bloomStrength: number`, `bloomThreshold: number`) + three
  change handlers (`onBloomEnabledChange(next: boolean)`,
  `onBloomStrengthChange(next: number)`, `onBloomThresholdChange(next: number)`), rendered
  as a Bloom sub-group: an enabled checkbox, a strength slider, a threshold slider (mirror
  the existing tone-curve row markup + `SettingsPanel.module.css` classes). If the sub-group
  grows past ~120 lines or reads as its own concern, extract a `BloomSubSection` component
  per the skill — otherwise keep it inline in `DisplaySection`.
- `src/components/containers/DisplaySectionContainer.tsx` (modify) — read the three
  selectors (`selectBloomEnabled/Strength/Threshold`), wrap the three dispatches
  (`setBloomEnabled/Strength/Threshold`) in `useCallback([dispatch])`, pass them down.
- Test: `tests/components/SettingsPanel/DisplaySection.test.tsx` (create or extend) —
  targeted behaviour only.

**Interfaces**
- Consumes: `selectBloom{Enabled,Strength,Threshold}`, `setBloom{Enabled,Strength,Threshold}`.
- Produces: the three controls in the Display disclosure.

- [ ] Component test: render `DisplaySection` with plain props (no Provider); assert the
      enabled checkbox toggles via `fireEvent.click` (NOT `fireEvent.change` — controlled
      checkbox, testing.md gotcha) and calls `onBloomEnabledChange` with the toggled value;
      assert a strength `fireEvent.change` calls `onBloomStrengthChange` with the parsed
      number. Type mock callbacks `vi.fn<(v: boolean) => void>()` / `vi.fn<(v: number) =>
      void>()` (never bare `vi.fn()`).
- [ ] `npm test -- DisplaySection` green; `npm run typecheck` green.
- [ ] Commit.

### Task 13: frame-program bloom steps + gating + group titles + `renderFrame` threading + program-shape tests

Emit the bloom render steps between the `foreground:0 → hdr` composite and the single
`hdr → swap` tone-map, gated on `settings.bloom.enabled`; bucket them under one `'Bloom'`
group.

**Files:**
- `src/services/engine/frame/frameProgram.ts` (modify):
  - `frameProgram(tone: ToneMap, bloomEnabled: boolean)` — new second parameter. Only
    `enabled` shapes the program (the render-step list); `strength`/`threshold` are read
    live by the Task 11 layers, so they are **not** threaded here (see the note below —
    this is the precise reading of spec §6's "thread the three values").
  - Insert the bloom steps after `{ composite: foreground:0 → hdr }` and before
    `{ composite: hdr → swap }`, only `if (bloomEnabled)`:

    ```ts
    // bright + 4 downsamples + 4 upsample folds — one render step per stage,
    // each screen-space (slab arbitrary; COSMO, ignored by the bloom layers).
    { kind: 'render', target: 'bloom0', slab: COSMO },   // bright, reads hdr
    { kind: 'render', target: 'bloom1', slab: COSMO },   // downsample
    { kind: 'render', target: 'bloom2', slab: COSMO },
    { kind: 'render', target: 'bloom3', slab: COSMO },
    { kind: 'render', target: 'bloom4', slab: COSMO },
    { kind: 'render', target: 'bloom3', slab: COSMO },   // upsample fold (load, additive)
    { kind: 'render', target: 'bloom2', slab: COSMO },
    { kind: 'render', target: 'bloom1', slab: COSMO },
    { kind: 'render', target: 'bloom0', slab: COSMO },   // final fold into bloom0
    { kind: 'render', target: 'hdr',    slab: COSMO },   // bloomFoldLayer: bloom0 × strength → hdr
    ```

    The re-targeted `bloom3..bloom0` steps rely on the executor's `touched` set (clear on
    first, additive-load after — spec §4). The trailing `hdr` render step draws only
    `bloomFoldLayer` (the other hdr layers already ran in the earlier hdr steps, which are
    already `touched`, so this step loads).
  - **Dedup the merged-timing group-key row** in `timedSlotRowsOf`: today it pushes one
    `{ name: groupKey, groupKey }` row per render step, assuming each `(target, slab)` is
    unique. The bloom fold reuses `bloom0..bloom3`, so push that row **only on the first
    occurrence** of each `groupKey` (track a `Set<string>` of seen keys). This keeps
    `TIMED_SLOTS` unique (the `yields unique names` test) and matches spec §5's "one `Bloom`
    group, N rows one per bloom groupKey" — a reused bloom target contributes exactly one
    merged slot. (Per-layer names stay unique regardless, so `perLayerTimed` per-pass timing
    is exact; the merged group slot for a reused target reflects the first pass — acceptable,
    documented below.)
  - `PASS_GROUP_TITLES` — add `'bloom0·COSMO'..'bloom4·COSMO': 'Bloom'` (five entries),
    placed after `'foreground:0·NEAR0'` so the Bloom group renders between Foreground and
    Overlays.
  - Update the three module consts that call `frameProgram` with placeholders
    (`TIMED_SLOTS`, `TIMED_SLOT_GROUPS`, `PASS_GROUP_KEYS`) to pass `bloomEnabled = true` so
    the timing service allocates the bloom slots (they are simply unused on frames where
    bloom is off, like any empty group).
- `src/services/engine/frame/renderFrame.ts` (modify, ~88-91) — pass
  `state.settings.bloom.enabled` as the second `frameProgram` arg.
- `tests/services/engine/frame/frameProgram.test.ts` (modify) — the program-shape tests
  (spec §8).

**Interfaces**
- Consumes: `state.settings.bloom.enabled`, `COSMO`, the bloom layers (via `CONTENT_LAYERS`).
- Produces: `frameProgram(tone, bloomEnabled)`; bloom render steps; `'Bloom'` group.

- [ ] Add the bloom steps + `bloomEnabled` gate + the `timedSlotRowsOf` dedup +
      `PASS_GROUP_TITLES` entries; thread `renderFrame`.
- [ ] Test **`bloom enabled: foreground→hdr composite precedes the bright pass`** — assert
      the `foreground:0→hdr` composite index < the first `bloom0` render step index.
- [ ] Test **`bloom enabled: the fold precedes the single tone-map composite`** — assert the
      trailing `hdr` bloom-fold render step index < the `hdr→swap` composite index, and that
      exactly **one** composite carries a non-null tone.
- [ ] Test **`bloom disabled: no bloom step is emitted and the program is otherwise
      identical`** — `frameProgram(TONE, false)` deep-equals the Task-5 (post-reorder)
      program with zero `bloomN`/bloom-fold steps; `frameProgram(TONE, true)` contains the
      ten added steps and is otherwise identical.
- [ ] Update `timedSlotsOf` real-`CONTENT_LAYERS` expectation: with bloom enabled the list
      gains `bloom-bright`, the four downsample names, the four upsample names, `bloom-fold`,
      and one `bloom0·COSMO..bloom4·COSMO` merged slot **each** (deduped — `bloom0·COSMO` and
      `bloom3·COSMO` appear once despite two steps); assert `new Set(slots).size ===
      slots.length` still holds.
- [ ] Update `timedSlotGroupsOf` / `TIMED_SLOT_GROUPS` expectation: a `'Bloom'` group appears
      between `'Foreground bodies · depth'` and `'Overlays'` with the bloom rows.
- [ ] `npm test -- frameProgram executeFrame renderFrame` green; `npm run typecheck` green.
- [ ] Commit.

> **Note on "thread the three values" (spec §6).** `frameProgram` takes only
> `bloomEnabled` because only `enabled` shapes the step list; `strength`/`threshold` are
> per-frame uniforms the Task-11 bloom layers read live from `state.settings.bloom` (the
> dominant pattern — `starCatalogs`/`earth` knobs, `volumeUpsampleLayer`), NOT baked into
> `FrameStep` data (the `'render'` kind carries no uniform payload, unlike the `tone` a
> `'composite'` step carries). This is the faithful reading of "threaded exactly as
> tonemap.exposure/curve" — tonemap threads through the composite that consumes it; bloom
> threads through the layers that consume it. *(Surfaced to the user — see the plan report.)*

### Task 14: perf AFTER + confirm fragment-bound (measure, no commit)

- [ ] Re-run the Task 7 command set on the same port; quote MERGED TOTAL deltas per
      scenario. Run `--sweep` on `solar-system` to confirm the chain is fragment-bound
      (resolution-scalable — spec §7). Record the after-numbers + delta in the **Perf**
      section below. Expected ~1-2 ms added at dpr-2 desktop; flag if `solar-system` (already
      ~16.9 ms baseline) regresses more than the ~3-5 ms allowance — that seeds the
      post-build tuning phase (spec §7, user's "tune once built" call). No commit.

### Task 15: entanglement-radar review + Definition-of-Done

- [ ] Run the **entanglement-radar** skill over the full branch diff (all prep + feature
      commits). Land any un-braiding it surfaces as a small follow-up commit, or record why a
      flagged knot is essential.
- [ ] DoD gate before merge: `npm test` green (whole suite), `npm run typecheck` green
      (src + tools), no `TODO`/`TBD`/placeholder left in touched files.
- [ ] **iOS device visual check** (spec §7): the whole bloom chain shares the one frame
      encoder, so an invalid pipeline silently blanks the entire canvas on WebKit — verify on
      a real iOS device that the scene presents with bloom on AND off (`createShaderModuleWithDevLog`
      is the diagnosis path). This is a hard pre-merge gate.
- [ ] Visual pass items for the user (dev server): Sun disc now has a soft stacked glow;
      bright stars + Milky Way ridge gain bloom on top of (not replacing) their sprite glow;
      survey galaxy points stay crisp (below threshold); toggling `settings.bloom.enabled`
      cleanly adds/removes the glow; strength + threshold sliders move the look sensibly.
- [ ] Run **/feature-done** BEFORE merge (it gates the DoD and relocates this plan + the
      spec to `plans/completed/` + `specs/completed/`). Post-merge sequencing is an error.
- [ ] Squash-merge the single PR (prep-first commit order preserved in the squash body).

---

## Perf

_(Task 7 fills the baseline; Task 14 fills after + delta. MERGED TOTAL medians only.)_

Baseline measured 2026-07-21 post-prep (single tone-map), tier medium, 1400×900 @dpr2,
30 frames, port 5174. MERGED TOTAL medians:

| scenario | baseline (ms) | after (ms) | delta |
| --- | --- | --- | --- |
| solar-system | 14.8 (68 fps ✓) | | |
| star-field | 11.7 (86 fps ✓) | | |
| milky-way | 21.0 (48 fps ⚠) | | |

Note: `milky-way` was already over the 16.7 ms budget before bloom (hdr·NEAR0 5.8 ms +
hdr→swap 4.7 + swap·COSMO 4.6 dominate). Bloom adds a 5-mip pyramid + fold; T14 measures the
delta and the `--sweep` classifier, and perf tuning is deferred to post-build (user call).

## Deferred / out of scope (spec §1.2)

Twilight additive glow + Saturn-ring retune (backlog entries stay until visually
confirmed); per-layer bloom strength / aux-channel tagging; sprite-glow retune; sharing the
bloom WESL with the galaxy-renderer tool; bloom in the tour snapshot.
