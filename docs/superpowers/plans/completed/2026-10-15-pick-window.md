# Pick through a one-pixel window: implementation plan

**Goal:** `pickProgram.pick()` renders every pickable slab into a 1×1 target through a projection cropped to the cursor's pixel, and gives the same answer as today; the canvas-sized pick textures (25 MB at 1080p, 100 MB at 4K) go.

**Architecture:** a `PickWindow` (canvas-px rectangle) rides on every `SlabView`. Prep (Group A) makes the view the one place a pick draw learns where it rasterises: labels and the zone of avoidance stop reading the canvas size for that, while every window is still the whole canvas, so nothing changes. The feature (Group B) adds the f64 crop and hands `pick()`'s draws a view windowed to the cursor pixel.

**Spec:** `docs/superpowers/specs/completed/2026-10-14-pick-window-design.md` (rulings 2026-10-15: prep rides this PR as its first commits; ZoA jitter edge differences accepted; parity checked once by hand, no committed script).

## Global Constraints

- **Group A is behaviour-neutral.** Every window is the whole canvas until Task 5. If a Group A task cannot be done without a visible or pickable change, STOP and report it.
- Never add `Co-Authored-By` (or any attribution trailer). One commit per task, stage by path (never `git add -A`), `npx prettier --write <files you touched>` (never `npm run format`). Never rebase, force-push or merge.
- Files in `src/services/engine/frame/` (incl. `passes/`) export only their one symbol (`tests/services/engine/frame/frameFilePurity.test.ts`). One symbol per file in `utils/` and `@types/`, filename = symbol, `type` never `interface`, no barrels, no inline types in implementation files.
- Comments explain why, never what; module header ≤ 10 lines; comment lines ≤ half the code lines.
- Task 3 touches `.wesl`: invoke the `wesl-shaders` skill first, read `docs/RENDERER.md`, write no backtick in a `.wesl` file (quote identifiers in `'single quotes'`), and keep the io.wesl byte table and the TS writer in lockstep.
- Matrices are column-major, the `wgpu-matrix` `mat4d` layout (`src/utils/camera/composeBodySlabMvp.ts` is the pattern). Narrow f64 → f32 only with `src/utils/math/narrowMat4.ts`.
- Pixel space: every `PickWindow` is in canvas **device** px (`canvas.width/height`), the same space as `ctx.canvasSize` in a pick frame (`pickFrameContext.ts:52`) and the label quads.
- `pxPerRad` and every CPU gate stay canvas-based. A window changes what is rasterised, never what is pickable.
- Verify with `npm run typecheck:fast` plus the targeted tests; Tasks 1 and 5 also run the full `npm test` (Task 1 sweeps test literals, Task 5 changes `pick()`).

## Review Focus

1. **Centre-based culls.** A billboard whose centre lies outside the 1×1 window but whose quad covers the cursor must still pick. A pick vertex stage or CPU pick path that drops a primitive because its projected *centre* is outside clip [−1, 1] (with a margin sized for the canvas) would now drop it. Task 5's audit step greps for these; any hit is a STOP.
2. **A pick draw projecting outside its view.** Any `drawPick` other than the two label passes and ZoA that builds its projection or viewport from `ctx` (`ctx.canvasSize`, `ctx.slabs[i].vp`, `mainViewSpec`, a label projection) would rasterise canvas-sized geometry into the 1×1 target and hit the wrong place. Task 5's audit step greps for these; any hit is a STOP.
3. **Gates read the canvas view.** `pickEnabled`/`enabled` take the view; one reading `viewportPx` or `vp` on a windowed view would change what is pickable. Pinned in Task 5 by `pick() gates passes on the whole-canvas view`.
4. **Cursor at the canvas edge and during resize.** DPR-scaled cursor coords can land outside the canvas; the window must be clamped inside it (today's clamp, `pickProgram.ts:380-383`). Pinned in Task 5 by `pick() clamps the cursor window inside the canvas`.
5. **The visual ZoA band is never cropped.** `draw` and `drawPick` share one uniform buffer; the visual `draw` must write the identity rect every call. Pinned in Task 3 by `draw writes the whole-canvas NDC rect`.

## Dispatch groups

Two grouped dispatches, one commit per task, one whole-branch review at the end, CI as the gate. Mid-branch reviews for the `review: yes` tasks run once per group, at the group's end.

| Group | Tasks | Theme | Model |
|---|---|---|---|
| A | 1, 2, 3 | Prep: the window on the view; labels and ZoA read it | Opus (`review: yes` on 3) |
| B | 4, 5, 6 | Feature: the crop, `pick()` through a 1×1 window, docs | Opus (`review: yes` on 4, 5) |

## Group A: ground preparation (behaviour-neutral)

### Task 1: `PickWindow` on `SlabView`, and its canvas-NDC rectangle

**Files:**
- Create: `src/@types/engine/frame/PickWindow.d.ts`, `src/@types/engine/frame/PickWindowNdc.d.ts`, `src/utils/gpu/pickWindowNdc.ts`, `tests/utils/gpu/pickWindowNdc.test.ts`
- Modify: `src/@types/engine/frame/SlabView.d.ts`, `src/services/engine/frame/slabs.ts` (`slabViewOf`, `:389-400`)
- Modify (sweep): every `SlabView` object literal in `src/` and `tests/` (about 24 test files; find them with `grep -rlE "camPos:" src tests | xargs grep -l viewportPx`)

**Contract:**

```ts
// PickWindow.d.ts
export type PickWindow = {
  /** Top-left corner, canvas device px. */
  readonly originPx: Readonly<Vec2>;
  /** Window size in device px; also the pick target's size. */
  readonly sizePx: Readonly<Vec2>;
};

// PickWindowNdc.d.ts — the window as a canvas-NDC rectangle, y up
export type PickWindowNdc = {
  readonly centre: Vec2;
  readonly halfExtent: Vec2;
};

// SlabView.d.ts — one new required field
/** The canvas rectangle this view rasterises; the whole canvas outside pick(). */
readonly window: PickWindow;

// pickWindowNdc.ts
export function pickWindowNdc(window: PickWindow, canvasPx: Readonly<Vec2>): PickWindowNdc;
```

`centre = ((ox + sx/2) / W · 2 − 1, 1 − (oy + sy/2) / H · 2)`, `halfExtent = (sx / W, sy / H)`. `slabViewOf` sets `window` to `{ originPx: [0, 0], sizePx: [canvas w, canvas h] }`, the same values as its `viewportPx`. Test literals get the same whole-canvas window from their own `viewportPx`.

- [x] Test `pickWindowNdc of the whole canvas is centre 0, half-extent 1`.
- [x] Test `pickWindowNdc flips y: a 1×1 window at the top-left pixel` — 100×50 canvas, window `(0,0)` size `(1,1)` → centre `(−0.99, 0.98)`, halfExtent `(0.01, 0.02)`.
- [x] Implement the types, the field, `slabViewOf`, the util; sweep the literals. No other new test: the field is plumbing until Task 5, whose `renderForDebug` test pins the whole-canvas value.
- [x] `npm run typecheck:fast`, `npm test` → green. Commit.

### Task 2: Label pick quads rasterise through `view.window`

**Files:**
- Modify: `src/@types/rendering/LabelPickRenderer.d.ts`, `src/services/gpu/renderers/labels/labelPickRenderer.ts` (`draw`, `:95-137`), `src/services/engine/frame/passes/labelsCosmoPass.ts` (`drawPick`, `:84-96`), `src/services/engine/frame/passes/labelsNearPass.ts` (`drawPick`, `:69-81`)
- Test: `tests/services/gpu/renderers/labels/labelPickRenderer.test.ts` (create if absent, using the repo's mock-device pattern)

**Contract:** `draw(pass: GPURenderPassEncoder, quads: readonly LabelPickQuad[], window: PickWindow): void` replaces the `viewportPx` parameter. Each rect is written to the instance buffer translated by `−window.originPx`; the `viewportPx` uniform (`LabelPickUniforms`, unchanged layout) gets `window.sizePx`. Both passes pass `view.window` (rename `_view` → `view`) instead of `projection.viewportPx`. Quads keep being built from the label projections: the declutter layout is canvas-based. `labels/pick.wesl` does not change.

- [x] Test `draw translates every rect by the window origin` — window origin `(10, 20)`, rect `(5, 15, 15, 25)` → instance floats `(−5, −5, 5, 5)`.
- [x] Test `draw writes the window size as the viewport uniform` — size `(1, 1)` → uniform floats `[1, 1]`.
- [x] Implement. `npm run typecheck:fast`, `npm test -- labelPick labelsCosmoPass labelsNearPass` → green. Commit.

### Task 3: The zone-of-avoidance pick rasterises through `view.window`

review: yes

**Files:**
- Modify: `src/services/gpu/shaders/zoneOfAvoidance/io.wesl` (byte table + `Uniforms`), `src/services/gpu/shaders/zoneOfAvoidance/vertex.wesl`, `src/layers/zoneOfAvoidance/render/zoneOfAvoidanceRenderer.ts` (`ZONE_OF_AVOIDANCE_UNIFORM_BUFFER_SIZE`, `writeUniforms`, `draw`, `drawPick`, `:32`, `:142-235`), `src/@types/rendering/ZoneOfAvoidanceRenderer.d.ts`, `src/layers/zoneOfAvoidance/passes/zoneOfAvoidancePass.ts` (`drawPick`, `:45-56`)
- Test: the renderer's existing test under `tests/layers/zoneOfAvoidance/` (create `render/zoneOfAvoidanceRenderer.test.ts` if absent)

**The idea:** the quad keeps covering its target in clip space (`clipPos = corner`), but the `ndc` varying the fragment builds its ray from becomes the canvas-NDC point that target corner stands for: `ndc = windowNdcCentre + corner · windowNdcHalf`. The whole-canvas rect `(0, 0) + corner · (1, 1)` is today's `ndc = corner`. The jitter keeps hashing `@builtin(position)`, now the window's fragcoord (ruled: edge differences accepted).

**Uniform layout (112 → 128 bytes):**

| offset | field | type |
|---|---|---|
| 0–111 | unchanged (`io.wesl:14-20`) | |
| 112 | `windowNdcCentre` | `vec2<f32>` |
| 120 | `windowNdcHalf` | `vec2<f32>` |

**Contract:**

```ts
draw(pass, cam: OrbitCamera, viewport: Vec2, tuning, shell, fadeAlpha): void;      // unchanged; writes the identity rect
drawPick(pass, cam: OrbitCamera, canvasPx: Vec2, window: PickWindow, tuning, shell, fadeAlpha): void;
```

`aspect` and `tanHalfFovY` keep coming from the canvas (`canvasPx`), never the window. `drawPick` writes `pickWindowNdc(window, canvasPx)` at 112–127. The pass calls `drawPick(pass, ctx.cam, [ctx.canvasSize.width, ctx.canvasSize.height], view.window, …)` (rename `_view` → `view`).

- [x] Test `drawPick writes the window's canvas-NDC rect at bytes 112–127` — canvas 100×50, window `(0,0)` size `(1,1)` → `(−0.99, 0.98, 0.01, 0.02)`.
- [x] Test `draw writes the whole-canvas NDC rect` — `(0, 0, 1, 1)`, also after a preceding `drawPick` with a 1×1 window (Review Focus 5).
- [x] Implement shader + writer together. `npm run typecheck:fast`, targeted tests → green.
- [x] Shot pair, main vs branch, at `#focus=body-sun` zoomed out until the band shows: identical. Commit.

## Group B: the window

### Task 4: `pickWindowCrop` and `windowedSlabView`

review: yes

**Files:**
- Create: `src/utils/gpu/pickWindowCrop.ts`, `src/services/engine/frame/windowedSlabView.ts`, `tests/utils/gpu/pickWindowCrop.test.ts`, `tests/services/engine/frame/windowedSlabView.test.ts`

**Contract:**

```ts
// C as a column-major 4×4, f64: x' = s.x·(x − c.x·w), y' = s.y·(y − c.y·w); z, w untouched
export function pickWindowCrop(window: PickWindow, canvasPx: Readonly<Vec2>): Float64Array;

// The one place a window is applied
export function windowedSlabView(view: SlabView, window: PickWindow, canvasPx: Readonly<Vec2>): SlabView;
```

`c` and `s = 1 / halfExtent` come from `pickWindowNdc`. `windowedSlabView` returns `slab: { ...view.slab, vp: C · view.slab.vp }` (f64, `mat4d.multiply`), `vp: narrowMat4(slab.vp)`, `viewportPx: [...window.sizePx]`, `window`, and keeps `camPos` and `sampledDepth`. It never touches the f32 `view.vp`: at 4K, `s` reaches 3840, and the `x − c.x·w` cancellation must happen in f64.

- [x] Test `pickWindowCrop maps the window centre to clip (0, 0)`.
- [x] Test `pickWindowCrop maps the window corners to (±w, ±w)` with `w ≠ 1`.
- [x] Test `a point k canvas px from the window centre lands k target px from it` (the billboard invariant: target px = target NDC · sizePx / 2).
- [x] Test `pickWindowCrop of the whole canvas is the identity`.
- [x] Test `windowedSlabView sets viewportPx and window to the window`.
- [x] Test `windowedSlabView narrows vp from the f64 product` — a `slab.vp` with a large translation (e.g. `1e7` in column 3) where cropping the f32 `view.vp` gives a different f32 result; assert `vp` equals `narrowMat4(C · slab.vp)` exactly.
- [x] Test `windowedSlabView keeps camPos and every other slab field`.
- [x] Implement. Targeted tests → green. Commit.

### Task 5: `pick()` renders through the cursor's 1×1 window

review: yes

**Files:**
- Modify: `src/services/engine/frame/pickProgram.ts` (`ensureSharedTarget` `:182-198`, `recordSlabPass` `:250-291`, `pick` `:369-435`), `tests/services/engine/frame/pickProgram.test.ts`

**Change:** `pick()` builds `cursorWindow = { originPx: [px, py], sizePx: [1, 1] }` from today's clamped cursor (`:380-383`) and `canvasPx = [canvas.width, canvas.height]`. Each group's view becomes `windowedSlabView(group.view, cursorWindow, canvasPx)` **after** `pickablesBySlab` has gated on the whole-canvas view. Shared targets are allocated at the window size (1×1); the copy reads origin `(0, 0)`. The scissor and `recordSlabPass`'s `cursor` parameter go. `renderForDebug` is unchanged: whole-canvas views, its own full-size targets.

- [x] **Audit first** (Review Focus 1 and 2). From the worktree root, every hit outside the label passes, `zoneOfAvoidancePass.ts`, and comments is a STOP: report it, don't work around it.
  ```bash
  # drawPick bodies projecting from ctx instead of the view
  grep -rnE "ctx\.(canvasSize|slabs\[|vp\b)|mainViewSpec|LabelProjection\(" $(grep -rlE "drawPick" src --include='*.ts' | grep -v '@types')
  # centre-based offscreen culls in shaders a pick pipeline compiles
  grep -rnE "abs\([^)]*\)\s*>\s*1\.|> *1\.0 *\+|< *-1\.0 *-" src/services/gpu/shaders src/layers --include='*.wesl'
  ```
  For each shader hit, check whether a pick pipeline uses it; for each CPU frustum test on `view.vp` in a pick path, check it tests the primitive's extent, not its centre.
- [x] Replace `pick() scissors every pass to the cursor texel` with `pick() allocates only 1×1 pick textures and sets no scissor`.
- [x] Test `pick() copies texel (0, 0) of every pass`.
- [x] Test `pick() hands every drawPick a view windowed to the cursor pixel` — cursor `(10.7, 20.2)` → `window { originPx: [10, 20], sizePx: [1, 1] }`, `viewportPx [1, 1]`, overlay group included.
- [x] Test `pick() gates passes on the whole-canvas view` — a `pickEnabled` mock records the view it gets: `window.sizePx` is the canvas size.
- [x] Test `pick() clamps the cursor window inside the canvas` — cursor `(w + 5, −3)` → origin `(w − 1, 0)`.
- [x] Test `renderForDebug hands whole-canvas views` — `window.sizePx` equals the canvas size.
- [x] Implement. `npm run typecheck:fast`, `npm test` → green. Commit.

### Task 6: Docs

**Files:**
- Modify: `docs/research/engine/gpu-memory-audit-2026-10-13.md` (finding 2: pick targets now 1×1), `docs/RENDERER.md` (only if it describes canvas-sized pick targets or the cursor scissor: `grep -n "scissor\|pick target\|pick-target" docs/RENDERER.md`)

- [x] Update both to the shipped state, timeless voice. No test. Commit.

## Definition of Done

**Deliverables**
- `PickWindow`, `PickWindowNdc` types; `SlabView.window`; `pickWindowNdc`, `pickWindowCrop`, `windowedSlabView`.
- `pick()` allocates 1×1 colour and depth targets only; no scissor.
- Label pick and ZoA pick read their raster rectangle from `view.window`.

**Smoke (WebGPU device), each with a `#focus=…` deep link to the worktree server in the PR body**
- Debug panel `d` → Memory: `pick-target`, `pick-depth-depth24plus`, `pick-depth-depth32float` are a few bytes each, not MB; `gc'd` stays empty.
- Galaxies at cosmic scale: hover highlight and InfoCard match the galaxy under the cursor, including all four screen edges and corners.
- `#focus=body-sun`, zoomed out: bright stars hover and select.
- `#focus=body-saturn`: Saturn and a moon select; a body's caption label click selects that body; a planet in front of stars wins the hover.
- Zoom out to the galactic plane: clicking the zone-of-avoidance band selects it (picks right at its noisy edge may differ from main, ruled acceptable).
- Resize while hovering: picks keep tracking, no console errors.
- Debug → overlays → **Show pick buffer**: still the full coloured raster for every slab.
- **Parity, once by hand:** at cosmic, Sun-neighbourhood, Saturn-system and Earth-surface poses, `pick()` agrees with the same texel of `renderForDebug()`'s rasters at a spread of cursor positions, except exact pixel-edge ties and the ZoA noise edge. A throwaway console snippet, never committed; the result goes in the PR body.

**Out of scope**
- Debug pick targets outliving the overlay (lazy-allocation backlog item).
- Any pick pad or floor value.
- Multi-pixel picks (nearest hit within a radius).
