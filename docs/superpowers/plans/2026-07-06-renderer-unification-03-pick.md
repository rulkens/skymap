# Renderer Unification — Phase 3: Pick Folded In, Space-Aware (N=1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task with fresh subagents.

**Goal**: Make the pick camera a value built at pick time from the slab table, then fold picking into the ContentLayer registry as a `drawPick` aspect executed by a parallel per-slab `pickProgram` with a pure `frontmostPick` cross-slab resolver — behaviour-identical at N=1.

**Architecture**: Phase 3 of `docs/superpowers/specs/2026-06-29-renderer-unification-design.md` (§Pick). Phases 1+2 are merged: `Compositor` exists; the flat `ContentLayer` registry exists (rows shaped `{name, slab, target, blend, enabled, draw(pass, view: SlabView, ctx, state), drawPick?}`); `slabs.ts` provides `SLABS` + `slabViewOf(ctx, slabIndex)` and the slab-index constants; the `FRAME` program + executor run the frame. This plan (a) deletes the `lastFrameUniformBytes` byte-snapshot and rebuilds the pick uniform from `(SlabView, ctx, state)` at pick time, (b) adds `drawPick` to the four pickable rows (pointSprites, proceduralDisks, milkyWay, structureMarkers), (c) introduces `pickProgram.ts` — one pick target per slab (`pick:cosmo`; `pick:near0` lazily, never at N=1), texel readback per slab, `frontmostPick` on the CPU. Pick lifecycle unchanged: own encoder + submit, fired by `hoverPickDriver` on pointer events, throttled by `mapAsync` readback.

**Tech Stack**: TypeScript, WebGPU, Vitest (fake-GPU fixtures). No WESL edits.

## Investigation result: what the 176-byte snapshot contains

`state.picking.lastFrameUniformBytes` is the `packPointUniforms` image
(`src/utils/gpu/packPointUniforms.ts:37-111`; layout docblock in
`pointRenderer.ts` around line 217). Every field re-homes cleanly — nothing
needs the visual frame to have drawn:

| bytes       | field                                               | pick-time source                                                                      |
| ----------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0–63        | viewProj (mat4)                                     | `SlabView.vp` (via `slabViewOf` on a pick-time ctx — see `pickFrameContext` below)    |
| 64–71       | viewportPx                                          | `SlabView.viewportPx`                                                                 |
| 72–79       | camera pads                                         | zero (never written)                                                                  |
| 80          | selectedPacked                                      | pack `SELECTION_NONE_SENTINEL` directly — the pick pass always overrode it anyway     |
| 84          | sourceCode slot                                     | never packed (identity rides per-source `@group(2)`); stays zero                      |
| 88          | pointSizePx                                         | `state.settings.galaxyCatalogs.sizePx` (pick's `+PICK_PADDING_PX` override unchanged) |
| 92          | brightness                                          | `state.settings.galaxyCatalogs.brightness`                                            |
| 96–107      | camPosWorld                                         | `SlabView.camPos`                                                                     |
| 108         | pxPerRad                                            | `ctx.drawPxPerRad` (same `h / (2·tan(fovY/2))` derivation, `frameContext.ts:144`)     |
| 112/116/120 | highlightFallback / realOnlyMode / depthFadeEnabled | `state.settings.galaxyCatalogs.*`                                                     |
| 128/132     | biasMode / absMagLimit                              | `state.settings.bias.*`                                                               |
| 136–156     | reserved Schechter slots                            | zero (never packed — reserved to keep `pickPass`'s offset stable)                     |
| 160/164     | pxFadeStart / pxFadeEnd                             | `PROCEDURAL_DISK_FADE_START_PX` / `_END_PX` module constants (`data/galaxyLodBands`)  |
| 168         | pickPass                                            | pick's `= 1` override, unchanged                                                      |

The pick-time camera is `(state.cameraRuntime.lastPose.current, state.cameraRuntime.projection)`
run through the same `deriveFrameContext` math that produced the frame's
`ctx.vp` (`frameContext.ts:113-179`, explicitly side-effect-free) — so at rest
the rebuilt bytes are **byte-identical** to the stash.

Two adjacent findings this plan also handles:

- **A second camera stash lives in `proceduralDiskRenderer`** —
  `cachedViewProj/cachedViewport/cachedCamPosWorld/cachedPxPerRad/cachedFocusBindGroup`
  (`proceduralDiskRenderer.ts:194-201, 271-277, 303-333`), written by the visual
  `draw()` and replayed by `pickDisks()`. Same frame-ordering braid; Task 7
  makes the camera caller-supplied. The **instance** replay
  (`pickInstanceBuffer` + `lastPickInstanceCount`) stays — that is content (the
  last-drawn disk LOD set), not camera.
- **The ring and MW pick pipelines read the point pick uniform** via the
  caller-bound `@group(0)` CameraUniforms prefix
  (`structureMarkerRenderer.ts:588-605`, `milkyWayPickRenderer.ts:181-200`).
  Rebuilding the point pick uniform therefore fixes their camera too — but it
  makes "pointSprites' `drawPick` uploads + binds `@group(0)` even with zero
  sources" a load-bearing contract (Task 6 pins it with a test; registry order
  keeps pointSprites first among cosmo pickables).

## Documented behaviour deltas (all confined to degenerate scenes)

Behaviour-neutral at N=1 for every scene with pickable content. Three corner
deltas are accepted and must be restated in the PR description:

1. **All-hidden scene** (pick mask 0, no markers, MW faded): today the pick is
   skipped entirely (`hasAny === false`); after, an empty pass runs and decodes
   `null`. Hover result identical; a click now dispatches
   `updateSelectionSelect(null)` (clears a stale selection) where today nothing
   dispatched. This aligns the corner with the normal empty-space-click
   behaviour.
2. **Zero-catalog scene with visible rings**: today's click path is gated on
   `catalogs.size > 0` (`wireInput.ts:244`) while hover is not — rings are
   hoverable but not clickable. After, click and hover agree (both pick).
3. **Pre-first-frame window**: the "no bytes yet" gate becomes "engine not
   ready" (`pickFrameContext` returns null). `lastPose` is seeded in
   `wireInput` before any pick can fire, so a pick in the one-frame window
   between bootstrap and first present hits the same pose frame 1 renders.

## Global Constraints

- Behaviour-neutral at N=1: hover/click selection identical before/after; final task includes a user visual gate (hover + click + ?showPickBuffer debug overlay on the dev server).
- One type per file in src/@types; `type` never `interface`; one function per file in src/utils.
- WESL: pick fragment shaders and lib/selectionEncoding.wesl are NOT edited this phase; the TS↔WESL selectionEncoding parity test must stay green untouched. If a task seems to need a shader edit, escalate instead.
- No per-type branches: pickable-layer selection is registry-driven (layer.drawPick presence + enabled), never a hardcoded layer-name list.
- Didactic comments, timeless; tidy comments of files you touch.
- Grep src/utils before writing any helper.
- Typed vi.fn in fixtures: `vi.fn<() => void>()`.
- `npm run typecheck` + `npm test` green per task; prettier only touched files.
- Final task: entanglement-radar pass over the phase diff — confirm the three braids the spec names for the byte-snapshot are actually dissolved (pick-camera availability no longer tied to the points pass having drawn; camera no longer encoded as one renderer's uniform layout; no frame-ordering coupling), and no new mirror state.

---

### Task 1: `frontmostPick` — pure cross-slab resolver

**Files:** `src/utils/picking/frontmostPick.ts` (new), `tests/utils/picking/frontmostPick.test.ts` (new)

**Signature:** `export function frontmostPick(perSlabRaw: readonly number[]): number`
**Behaviour:** first non-zero raw pick value in near→far order (ascending slab index, index 0 = nearest per `Slab.d.ts`), else 0. Pure; no decode — `unpackPick` stays the decoder.

- [x] Grep `src/utils` for an existing first-non-zero helper (none expected); note the result in the test header.
- [x] Tests (exhaustive, per the spec's testing section):
  - `returns 0 for all-zero readbacks` — `frontmostPick([0, 0])` → 0; also `[]` → 0.
  - `returns the single slab's hit` — `frontmostPick([0, 7])` → 7.
  - `near slab occludes far` — `frontmostPick([5, 9])` → 5.
  - `falls through to a far-only hit` — `frontmostPick([0, 9])` → 9.
- [x] Implement (a few lines; didactic header explaining this mirrors the visible far→near OVER composite as a CPU fold).
- [x] `npm test -- frontmostPick` → 4 tests pass. `npm run typecheck` → clean.
- [x] Commit `src/utils/picking/frontmostPick.ts tests/utils/picking/frontmostPick.test.ts`.

### Task 2: `pickFrameContext` — the pick-time camera as a value

**Files:** `src/services/engine/helpers/pickFrameContext.ts` (new), `tests/services/engine/helpers/pickFrameContext.test.ts` (new)

**Signature:** `export function pickFrameContext(state: EngineState, canvas: HTMLCanvasElement): ReadyFrameContext | null`
**Behaviour:** derives a ready context from the last **rendered** pose —
`deriveFrameContext(state, canvas, state.cameraRuntime.lastPose.current, state.cameraRuntime.projection, deriveSourceMasks(state).pick)`
— returning null when `isReady` is false. The mask argument is the **pick**
mask so `ctx.visibleSourceMask` means "pickable sources" to every `drawPick`
(this is what dissolves `collectPickTargets`' filter in Task 8).

- [x] Tests (reuse the fixture approach of `tests/services/engine/frame/frameContext.test.ts`):
  - `returns null before the engine is ready`.
  - `reproduces the frame's camera from lastPose + projection` — assert the returned `vp` equals `deriveFrameContext`'s for the same pose/projection inputs.
  - `carries the pick mask as visibleSourceMask`.
- [x] Implement. Didactic header: why `lastPose` (the produced pose of the last frame — same value the stash encoded) and why this is side-effect-free (cite `frameContext.ts:109-112`).
- [x] `npm test -- pickFrameContext` → pass; `npm run typecheck` → clean.
- [x] Commit the two files.

### Task 3: `pickUniformBytesOf` — rebuild the pick uniform from values

**Files:** `src/services/engine/helpers/pickUniformBytesOf.ts` (new), `tests/services/engine/helpers/pickUniformBytesOf.test.ts` (new)

**Signature:** `export function pickUniformBytesOf(view: SlabView, ctx: ReadyFrameContext, state: EngineState): ArrayBuffer`
**Behaviour:** assembles the packed-field subset of `PointDrawSettings` per the
byte table above (`selectedPacked: SELECTION_NONE_SENTINEL`) and delegates to
`packPointUniforms(view.vp, view.viewportPx, …)` — the packer stays the single
byte-layout truth, so drift with the visual pass is structurally impossible.

- [x] If `PointDrawSettings`' draw-only fields (`focusBindGroup`, `fadeOpacityOf`, `visibleSourceMask`) force fabricating GPU objects here, narrow `packPointUniforms`' parameter to the packed subset with an inline `Omit<…>` (no new type file) — the packer only reads the packed fields (`packPointUniforms.ts:52-65`).
- [x] Tests:
  - `matches the visual packer byte-for-byte apart from selectedPacked` — pack the same camera/settings through `packPointUniforms`, overwrite its `u32[20]` with the sentinel, assert `Uint8Array` equality with the helper's output.
  - `packs the none-sentinel at byte 80` — direct offset assertion.
- [x] `npm test -- pickUniformBytesOf` → pass; `npm run typecheck` → clean.
- [x] Commit the touched files.

### Task 4: Repoint the three snapshot consumers to pick-time bytes

**Files:** `src/services/engine/interaction/hoverPickDriver.ts`, `src/@types/engine/interaction/HoverPickDeps.d.ts`, `src/services/engine/phases/wireInput.ts`, `src/services/engine/frame/drawPickDebugOverlay.ts`, matching tests

All three consumers currently read `state.picking.lastFrameUniformBytes`
(`hoverPickDriver.ts:83`, `wireInput.ts:265`, `drawPickDebugOverlay.ts:108`).
Replace each read with `pickFrameContext` → `slabViewOf(ctx, COSMO)` →
`pickUniformBytesOf` (import the cosmological slab-index constant from the
phase-2 slabs/frameProgram module — never re-declare it). This is interim
plumbing: Task 10 absorbs it into `pickProgram`; keep the edits minimal.

- [x] `HoverPickDeps`: replace the byte read with a `uniformBytes: () => ArrayBuffer | null` thunk (wired in `wireInput` as a closure over `state` + `canvas`); update the module docblock's "Only `lastFrameUniformBytes` is read from state" paragraph. Driver: null thunk result → skip, matching today's null-bytes skip.
- [x] `wireInput` click path (`runPickAtCss`): build bytes the same way; keep the null guard shape.
- [x] `drawPickDebugOverlay`: derive internally from `state` + `deps.canvas`; replace the `lastFrameUniformBytes` gate (and its docblock section) with the not-ready gate.
- [x] Update tests: `hoverPickDriver.test.ts` (`null lastFrameUniformBytes is a no-op` → null-thunk variant), `drawPickDebugOverlay.test.ts` (no-op-when-null + `calls renderForDebug with … lastFrameUniformBytes` cases), `wireInput` tests.
- [x] `npm test` → full suite green; `npm run typecheck` → clean.
- [x] Commit the touched paths.

### Task 5: Delete the stash

**Files:** phase-2 successor of `pointSpritesPass.ts` (the pointSprites layer's `draw`), `src/@types/engine/state/EnginePickingState.d.ts`, `src/services/engine/engine.ts` (state literal, ~line 242), `src/services/gpu/renderers/pointRenderer.ts` (+ `src/@types/rendering/PointRenderer.d.ts`), doc sweeps in `src/@types/rendering/PickRenderer.d.ts`, `src/@types/engine/ClickResolveInput.d.ts`, `src/services/engine/frame/renderFrame.ts` (docblock), matching tests

- [ ] Delete the stash write in the pointSprites layer (today `pointSpritesPass.ts:88-125` tail) and its rationale comment.
- [ ] Delete `EnginePickingState.lastFrameUniformBytes` + its docblock entries; drop the seed from the `engine.ts` state literal; update `tests/@types/engineState.test.ts` and the other fixtures that seed it (grep `lastFrameUniformBytes` under `tests/` — `runFrame.test`, `renderFrame.test`, `renderFrame.timing.test`, `passes.test`, `renderFrameSplitBaseline.test`, `hoverPickDriver.test`).
- [ ] `PointRenderer.draw` returned the packed buffer **only** to feed the stash (`pointRenderer.ts:710-762`) — per the delete-proxy-surfaces rule, change it to return `void`; delete the `stashes the packed …` / `leaves state.picking …` tests (today in `passes.test.ts:465-512`) and update `pointRenderer.test.ts`.
- [ ] Doc sweep: remove every "stashed on `state.picking.lastFrameUniformBytes`" reference (`PickRenderer.d.ts:52,93`, `ClickResolveInput.d.ts:22`, `renderFrame.ts:68`); reword to "built at pick time from the slab view". Timeless comments — no "previously we stashed" history notes.
- [ ] `npm test` + `npm run typecheck` → green.
- [ ] Commit the touched paths.

### Task 6: `pickRenderer.drawPoints` — extract the point pick draw

**Files:** `src/services/gpu/renderers/pickRenderer.ts`, `src/@types/rendering/PickRenderer.d.ts`, `tests/services/gpu/renderers/pickRenderer.test.ts`

**Signature (added to the `PickRenderer` type):**
`drawPoints(pass: GPURenderPassEncoder, sources: readonly PickSourceDraw[], pointSizePx: number, uniformBytes: ArrayBuffer): void`

Extract the middle of `recordPickPass` (`pickRenderer.ts:305-413`): uniform
upload + the three overrides + `@group(0)/(1)/(3)` binds + the per-source loop
— **without** the ring/disk/MW fold-ins (those become layers in Task 8).
`pick()`/`renderForDebug()` keep working by calling `drawPoints` then the
fold-ins, so the app is unbroken until Task 10's cutover.

- [ ] New tests:
  - `drawPoints applies the three pick overrides to its own buffer` — port the assertion style of the existing `DECOUPLING REGRESSION` test (`pickRenderer.test.ts:180`).
  - `drawPoints uploads the camera uniform and binds @group(0) even with zero sources` — the load-bearing prefix contract for the ring/MW pick pipelines (see Investigation).
- [ ] Implement; existing `pickRenderer.test.ts` / `.structure` / `.diskPick` suites stay green unchanged.
- [ ] `npm test -- pickRenderer` → green; `npm run typecheck` → clean.
- [ ] Commit the touched paths.

### Task 7: `pickDisks` takes the camera as arguments

**Files:** `src/services/gpu/renderers/proceduralDiskRenderer.ts`, `src/@types/rendering/ProceduralDiskRenderer.d.ts`, `tests/services/gpu/renderers/proceduralDiskRenderer.test.ts`, `tests/services/gpu/renderers/pickRenderer.diskPick.test.ts`, `src/services/gpu/renderers/pickRenderer.ts` (interim call site)

**Signature:** `pickDisks(pass: GPURenderPassEncoder, viewProj: Float32Array, viewport: Vec2, camPosWorld: Readonly<Vec3>, pxPerRad: number, focusBindGroup: GPUBindGroup): void`

- [ ] Delete the five cached camera fields (`proceduralDiskRenderer.ts:194-201`) and the cache writes (`:271-277`); `pickDisks` writes its pick uniform from the arguments (`:309-322` unchanged in layout). Keep `pickInstanceBuffer` + `lastPickInstanceCount` (content replay — essential; document why in the header).
- [ ] Interim: `pickRenderer.recordPickPass`'s fold-in passes the values it already has (`uniformBytes` fields aren't accessible — pass the caller-visible camera args through; this call site is deleted in Task 10, keep it crude-but-correct).
- [ ] Update test: `pickDisks draws with the caller-supplied camera, not a cached frame value` (replace the cached-camera assertions).
- [ ] `npm test -- proceduralDisk` and `-- diskPick` → green; `npm run typecheck` → clean.
- [ ] Commit the touched paths.

### Task 8: `drawPick` on the four registry rows

**Files:** the phase-2 registry rows for pointSprites / proceduralDisks / milkyWay / structureMarkers (per-layer files or `contentLayers.ts`, whichever phase 2 shipped), registry test file

Per the spec's migration table, add `drawPick(pass, view, ctx, state)` to
exactly these rows (all cosmological slab):

| layer            | drawPick delegates to                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pointSprites     | `state.gpu.pickRenderer.drawPoints(pass, sources, state.settings.galaxyCatalogs.sizePx, pickUniformBytesOf(view, ctx, state))` where `sources` = `renderer.loadedSources()` filtered by `ctx.visibleSourceMask` (the pick mask — Task 2) |
| proceduralDisks  | `pickDisks(pass, view.vp, view.viewportPx, view.camPos, ctx.drawPxPerRad, state.gpu.focusUniform.bindGroup)`                                                                                                                             |
| milkyWay         | `milkyWayPickRenderer.pickMilkyWay(pass, halfExtent)` with `halfExtent = milkyWayPickHalfExtentPx(state, view.viewportPx[1])`; skip on null (the helper folds `milkyWayPickVisible`)                                                     |
| structureMarkers | `structureMarkerRenderer.pickRing(pass)`                                                                                                                                                                                                 |

Notes: the layers' existing `enabled` gates already mirror today's pick gates
(`milkyWayPickVisible` mirrors `milkyWayPass.enabled` beat-for-beat;
`markerCount() > 0` mirrors `structureMarkersPass`'s gate). Follow phase 2's
null-narrowing pattern for `state.gpu.*` reads. Registry order must keep
pointSprites first among cosmo pickables (`@group(0)` contract, Task 6).

- [ ] Test: `exactly the migration-table rows expose drawPick` — assert `layers.filter((l) => l.drawPick).map((l) => l.name)` equals the four names (a contract-pinning test; the _code_ stays name-blind).
- [ ] Test (fake-GPU): `pointSprites drawPick filters loadedSources by ctx.visibleSourceMask` — port `collectPickTargets`' mask-filter assertion (`tests/services/engine/helpers/collectPickTargets.test.ts`).
- [ ] Implement the four rows.
- [ ] `npm test` → green; `npm run typecheck` → clean.
- [ ] Commit the touched paths.

### Task 9: `pickProgram.ts` — the parallel per-slab program

**Files:** `src/services/engine/frame/pickProgram.ts` (new), `src/@types/engine/frame/PickProgram.d.ts` (new, one type), `tests/services/engine/frame/pickProgram.test.ts` (new)

**Contract:**

```ts
// @types/engine/frame/PickProgram.d.ts
export type PickProgram = {
  readonly label: string; // 'pickProgram'
  pick(pickXPx: number, pickYPx: number): Promise<PickResult | null>;
  renderForDebug(): GPUTexture | null; // populates + returns pick:cosmo for the overlay
  destroy(): void;
};

// services/engine/frame/pickProgram.ts
export function createPickProgram(deps: {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  state: EngineState;
  layers: readonly ContentLayer[]; // the phase-2 registry export
}): PickProgram;
```

**`pick(x, y)` behaviour** (mirrors the spec's conceptual program):

1. Guard: own `inFlight` (staging-buffer protection — port from `pickRenderer.ts:243,464-479`, including the destroy/AbortError swallow).
2. `ctx = pickFrameContext(state, canvas)`; null → return null.
3. `pickable = layers.filter((l) => l.drawPick && l.enabled(state, ctx))`, grouped by `l.slab`. No slab has any → return null without touching the GPU. **Registry-driven only** — no layer-name list anywhere.
4. Per slab with pickable layers, in near→far (ascending index) order: lazily (re)allocate that slab's pick target + depth (`pick:cosmo` = r32uint + depth24plus at viewport size — the `RenderTargetSpec` row; `pick:near0` would be depth32float but is **never allocated at N=1**, assert via test); `view = slabViewOf(ctx, slab)`; begin the pass (clear 0 / depth 1, port `pickRenderer.ts:341-361` incl. the timestampWrites spread-omit); call each layer's `drawPick(pass, view, ctx, state)` in registry order; end; `copyTextureToBuffer` of the clamped cursor texel into that slab's staging buffer (port the clamp + 256-byte row rules, `pickRenderer.ts:448-461`).
5. One encoder, one submit. `mapAsync` each staging buffer; `frontmostPick(perSlabRaw)`; `unpackPick`. Timing: thread `state.gpu.timingService.descriptorFor('pick')` into the cosmo pass (single 'pick' slot, as today).
6. `renderForDebug()`: same recording for the cosmological slab, no readback, returns its texture; independent of `inFlight` (port the rationale comment, `pickRenderer.ts:482-509`).

- [ ] Tests (fixture style of `tests/services/gpu/renderers/pickRenderer.test.ts` — fake device/encoder/staging):
  - `returns null while a readback is in flight`.
  - `returns null with no enabled pickable layer — no encoder created`.
  - `runs drawPick only for enabled pickable layers, in registry order`.
  - `decodes the cosmo texel readback via unpackPick` (raw packed value → PickResult).
  - `resolves across slabs with frontmostPick` (two fake slabs/layers; near hit wins).
  - `never allocates pick:near0 at N=1` (no slab-0 pickable layer → one target allocated).
  - `threads the pick timing descriptor into the pass`.
  - `renderForDebug records the same draws without readback and ignores inFlight`.
- [ ] Implement. Module header: why pick is NOT a `FRAME` member (spec §Pick), and why the resolve is a handful of texel reads + a CPU fold instead of a GPU pick-composite.
- [ ] `npm test -- pickProgram` → green; `npm run typecheck` → clean.
- [ ] Commit the touched paths.

### Task 10: Cutover — hover, click, debug overlay onto the program

**Files:** `src/services/engine/phases/wireInput.ts`, `src/services/engine/interaction/hoverPickDriver.ts`, `src/@types/engine/interaction/HoverPickDeps.d.ts`, `src/services/engine/interaction/clickHandler.ts`, `src/@types/engine/ClickResolveInput.d.ts`, `src/@types/engine/CreateClickResolverInput.d.ts`, `src/services/engine/frame/drawPickDebugOverlay.ts`, `src/services/engine/frame/runFrame.ts`, the `EngineGpuHandles` type + `engine.ts` destroy path, matching tests

- [ ] `wireInput`: after `createPickRenderer` (now slimmed — see Task 11), `state.gpu.pickProgram = createPickProgram({ device, canvas, state, layers })`. New `EngineGpuHandles.pickProgram` field follows the existing handle pattern (no fresh ad-hoc `| null` threading beyond it — spec §Relationship, gpu-handle-nullability); wire teardown in `engine.destroy` and update `tests/services/engine/phases/initGpu.destroyReachability.test.ts` if it inventories handles.
- [ ] `hoverPickDriver`: deps slim to `{ state, pickProgram, store, resolveDeps }` — the `collectTargets` / `viewportPx` / `pointSizePx` / `timingDescriptor` / `uniformBytes` thunks all dissolve (the program derives them internally). `fire()` becomes `pickProgram.pick(cssToTexPx(pos.x), cssToTexPx(pos.y))`. Keep `pointerDown` + `pickInFlight` gating and the trailing-edge `maybeFire` untouched. Update `HoverPickDeps.d.ts` docblock (thunks-vs-values section shrinks).
- [ ] `clickHandler`/`ClickResolveInput`: input slims to `{ pickXPx, pickYPx }`; `CreateClickResolverInput.pickRenderer` → `pickProgram`. `wireInput.runPickAtCss` sheds its target/bytes derivation; keep the resolver-null guard.
- [ ] `drawPickDebugOverlay`: call `state.gpu.pickProgram.renderForDebug()`; drop the `masks` parameter (update the `runFrame.ts:401` call site) and the collectPickTargets/bytes gates; keep the encoder/loadOp-load/submit tail unchanged (`drawPickDebugOverlay.ts:123-142`) — per the spec it stays a post-frame debug composite by latency choice, not data dependency (update the module header accordingly).
- [ ] Update tests: `hoverPickDriver.test.ts` (empty-target no-op case becomes "program returns null → dispatches hover(null)"; deps-shape test), `clickHandler.test.ts`, `wireInput*.test.ts`, `drawPickDebugOverlay.test.ts`, `runFrame.test.ts`.
- [ ] Restate the three documented behaviour deltas (top of this plan) in the commit message body.
- [ ] `npm test` + `npm run typecheck` → green.
- [ ] Commit the touched paths.

### Task 11: Delete the superseded surfaces

**Files:** `src/services/gpu/renderers/pickRenderer.ts`, `src/@types/rendering/PickRenderer.d.ts`, `src/services/engine/phases/wireInput.ts`, `src/services/engine/helpers/collectPickTargets.ts` (delete), `tests/services/engine/helpers/collectPickTargets.test.ts` (delete), `tests/services/gpu/renderers/pickRenderer*.test.ts`

- [ ] `pickRenderer` becomes the point-pick draw provider only: delete `pick()`, `renderForDebug()`, `recordPickPass`'s fold-in tail, `hasAnyPickTarget`, the textures/depth/staging/`ensureTextures`/`inFlight`/`destroyed` machinery, and the `structureMarkerRenderer` / `proceduralDiskRenderer` / `milkyWayPickRenderer` / `mwHalfExtentPx` constructor params (their `wireInput.ts:79-98` wiring goes too). Surface: `{ label, drawPoints, destroy }`. Rewrite the module + type docblocks (timeless).
- [ ] Delete `collectPickTargets` + its test — the mask filter lives in pointSprites' `drawPick` (Task 8), the `hasAny` rule in the program's registry filter (Task 9). `milkyWayPickVisible` **stays** (consumed by `milkyWayPickHalfExtentPx`).
- [ ] Port the still-relevant `pickRenderer.test.ts` / `.structure` / `.diskPick` cases to `drawPoints`/`pickProgram` suites; delete the rest (in-flight, empty-source-null, MW-gating cases now live in `pickProgram.test.ts`).
- [ ] Grep for dangling imports (`collectPickTargets`, `renderForDebug`, `PickSourceDraw` docs) and sweep comments in every touched file.
- [ ] `npm test` + `npm run typecheck` → green; prettier the touched files.
- [ ] Commit the touched paths (deletions staged explicitly).

### Task 12: Gate — radar pass + user visual gate

- [ ] `npm run typecheck` && `npm test` → full suite green.
- [ ] Run the `entanglement-radar` skill over the phase diff (`git diff main...HEAD`). Confirm the three named braids are dissolved: (1) pick-camera availability no longer tied to the points pass having drawn (any consumer of `lastFrameUniformBytes` is gone); (2) the camera is no longer encoded as one renderer's uniform byte layout (both the point stash and the disks' cached-camera mirror are gone; `packPointUniforms` is called with values at pick time); (3) no frame-ordering coupling ("stashed just before submit" comments gone; `drawPickDebugOverlay`'s post-frame placement documented as latency choice only). Confirm no new mirror state was introduced (the one accepted coupling: ring/MW pick pipelines reading pointSprites' `@group(0)` prefix — pre-existing, pinned by the Task 6 test).
- [ ] Verify the untouched-parity invariant: `git diff main...HEAD -- src/services/gpu/shaders tests/data/selectionEncoding.test.ts` → empty.
- [ ] USER VISUAL GATE (dev server already running; ask the user to check): hover shows the InfoCard for points, disks, structure rings, and the Milky Way; single-click selects each; click on empty space clears; double-click focuses; `?showPickBuffer` overlay matches the scene and updates while orbiting; behaviour identical to main by eye.
- [ ] On pass: tick the plan checkboxes, update `docs/BACKLOG.md` only if a pick-adjacent item was absorbed, and hand off to `/feature-done`.

---

## Self-review against the spec

- Pick-camera prerequisite (spec §Prerequisite) → Tasks 2–5.
- `drawPick` aspect + migration-table rows (spec table, `drawPick?` column) → Tasks 6–8.
- Parallel per-slab program, `pick:cosmo` / `pick:near0` lazy, readback + CPU resolve (spec §Pick bullets + conceptual program) → Task 9.
- `frontmostPick` + the four named test cases (spec §Testing, phase 3) → Task 1.
- Lifecycle unchanged (own encoder/submit, hoverPickDriver-fired, mapAsync-throttled) → Tasks 9–10; selectionEncoding parity untouched → Task 12 invariant check.
- N=1 equivalence: single populated slab iteration ≡ today's single cosmological pass; MW stays a cosmological-slab pick (Task 8 row).
