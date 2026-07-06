# Renderer Unification 04 — fold zoom-to-earth (PR #386) into the layer/slab/program model

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking. **No `.wesl` file is edited in this plan** — Task 1 deletes three shader files (deletion only); if any task appears to need a shader edit, STOP and escalate.

**Spec:** `docs/superpowers/specs/2026-06-29-renderer-unification-design.md` — the FRAME program's three PR-#386 tail steps (spec lines 329-331), the `foreground:0` target-table row (spec line 143), and the two #386 migration-table rows (spec lines 215-216).
**Series:** plan 04. **Requires plans 01 (Compositor) + 02 (registry & program) merged to `main`.** Plan 03 (pick) is independent — no ordering constraint either way (no foreground layer is pickable; `pick:near0` stays unallocated).
**Vehicle:** this plan executes **on the `feat/zoom-to-earth-true-scale` branch** — draft PR #386 stays the PR. Task 1 merges `main` in; Tasks 2-7 rebuild the foreground on the plan-02 surface; Task 8 runs the visual gate that #386 has been waiting on and un-drafts it. Intermediate commits leave the foreground disconnected (a documented transient — the branch never merges alone in that state); the PR-final state restores it in full.

**Goal:** Dissolve #386's three bespoke frame hooks — `encodeForegroundPass`, `encodeForegroundOver`, and the hand-wired `foregroundLabelsPass` — into two `ContentLayer` rows, one `RenderTargetSpec` row, one slab-derivation swap, and three appended `FrameStep`s. After this plan the foreground is *data* consumed by the plan-02 executor, its second tone-map is one `compositor.draw(..., 'over', tone)` composite step, and `renderFrame` contains zero foreground-specific code.

**Architecture:** The spec's three axes absorb everything the branch wired by hand. **Slab:** the NEAR0 row (layerless since plan 02) activates — its `vp` becomes the origin-relative f64 `computeForegroundViewProj` product, replacing the branch's four `ReadyFrameContext` foreground fields. **Target:** `foreground:0` (rgba16float + depth32float, scale 1) becomes the first target-table row to exercise `RenderTargetSpec.depth`, replacing the bespoke `foregroundOffscreen` module. **Blend:** `opaque` for the bodies (depth-tested pipeline), `over` for the captions and for the composite (plan 01's straight-alpha Porter-Duff row, byte-for-byte the blend state `foregroundComposite` carried). Preserve the un-braided axes — no foreground-specific branch anywhere in the executor or program.

**Tech Stack:** TypeScript, WebGPU (mocked in tests — no real device), Vitest, wgpu-matrix (`mat4d` f64 path).

## Global Constraints

- **One type per file in `src/@types`;** `type` never `interface`; filename = type name. One function per file in `src/utils`.
- **`Vec2`/`Vec3` aliases** from `src/@types/math/`, never raw tuples.
- **No `.wesl` edits** (deletions in Task 1 only); WESL comments use single quotes, never backticks — relevant only if an escalation forces a shader change (it shouldn't).
- **Layers stay pure over `(state, ctx)`** — no cached state; renderers stay the GPU-resource owners.
- **No per-layer branches:** the executor and program gain zero foreground-specific code; everything rides the plan-02 data paths (touched-set, first-touch clear, disabledPasses override, `(target, slab)` selection).
- **Didactic comments, timeless** (no dates/PR refs/"Plan 01 did X" history notes — the two zoom-to-earth forward-references named in Task 6 are the deliberate exception, pointing at *future* work); tidy comments of files you touch.
- **Grep `src/utils` before writing any helper** — this plan should need zero new helpers (`composeBodyMvp`, `computeForegroundViewProj`, `narrowMat4` all exist on the branch).
- **Typed `vi.fn` in fixtures:** `vi.fn<() => void>()`.
- **`npm run typecheck` + `npm test` green per task;** prettier only touched files.
- **Final task: entanglement-radar over `git diff origin/main...HEAD`** + the deferred #386 user visual gate.
- Commits stage specific paths, never `git add -A`. Worktree-absolute paths in every subagent dispatch.

## Cross-plan seams consumed (import, never re-declare)

**From plan 01** — `state.gpu.compositor` with `draw(pass, src, blend, tone)`. Its `over` row is **straight-alpha Porter-Duff** (color `src-alpha`/`one-minus-src-alpha`, alpha `one`/`one-minus-src-alpha`) and packs `preserveAlpha=1`, so the tone path emits `vec4(mapped, sample.a)` — verified byte-identical to the branch's `foregroundComposite` blend state (`src/services/gpu/passes/foregroundComposite.ts:126-140` on the branch). The tone-map mirror constants (`DEFAULT_WHITEPOINT` 4.0, `DEFAULT_ASINH_SOFTNESS` 10.0) live in `compositor.ts` and equal the branch's `toneMapDefaults.ts` values.

**From plan 02** — `NEAR0`/`COSMO` + `deriveSlabs`/`slabViewOf` (`src/services/engine/frame/slabs.ts`); the `@types/engine/frame/*` types (`Blend` = `'additive' | 'opaque' | 'over'`; `SlabView` `{slab, vp: Float32Array, camPos, viewportPx}`; `RenderTargetSpec` `{id, format, depth, scale}`); the flat `CONTENT_LAYERS` registry in `src/services/engine/frame/passes/index.ts` with per-layer files `passes/<name>Layer.ts`; `frameProgram(tone)` + `timedSlotsOf`; `executeFrame` with the touched-set composite gating, the first-touch clear rule, and the one-way `disabledPasses` override; `renderTargets` (`specs`/`viewOf`/`resize`/`destroy`, clear values as target-table data, `viewFor` repointed at it by plan 02 Task 9). Where this plan cites plan-02 internals, reconcile with the shape plan 02 actually landed; the contracts above are the stable seam.

## Plan-time decisions (implementers follow these)

1. **The fold rides PR #386.** No new branch, no new PR. The user visual gate #386 deferred ("AWAITING USER VISUAL GATE") happens once, in Task 8, on the folded shape.
2. **The compositor needs ZERO edits.** Plan 01 already carries the straight-alpha `over` row + per-blend `preserveAlpha`, so #386's `foregroundComposite` (pass module + `shaders/foregroundComposite/{vertex,fragment,io}.wesl` + `@types/rendering/ForegroundComposite.d.ts`) and `src/data/toneMapDefaults.ts` are **deleted** in Task 1, replaced by one composite `FrameStep` in Task 7. One verified nuance: the branch composite sampled with a `linear` sampler, the compositor uses `nearest` — behaviour-neutral, because `foreground:0` is scale 1 (source and dest are the same size, the covering triangle samples every texel exactly at its centre, so the filter choice is a no-op).
3. **Program placement.** The three NEAR0 steps append after the swap/COSMO UI step — exactly the spec's FRAME tail (spec lines 329-331): render `foreground:0` → composite `foreground:0 → swap` with `blend: 'over'` and **the same `tone` value as the hdr→swap composite** (a shared curve across the Sun's limb is the requirement `toneMapDefaults.ts` existed to enforce; now it's literally the same object per frame) → render `swap` @ NEAR0 (captions on top of the bodies, bodies over the cosmological labels — the ordering the spec makes a visible program decision). Three explicit behaviour deltas vs the branch, all benign:
   - (a) the foreground offscreen now renders **after** the hdr→swap tonemap instead of before it (the branch encoded it between the HDR pass and `postProcess.draw` — `renderFrame.ts:158-176` on the branch). No data dependency crosses that boundary; neutral.
   - (b) when no foreground layer is enabled, the `foreground:0` render pass **and** the `foreground:0 → swap` composite are skipped entirely (the plan-02 touched-set rule — this step is its "first real consumer" per plan 02's decision 3). The branch always opened both passes; pure win. Relatedly the executor's uniform `disabledPasses` gate now covers `debug-spheres` too (the branch only hand-checked it for captions) — dev-only, positive.
   - (c) foreground work now appears in the derived timing slots (`debug-spheres`, `foreground:0→swap`, `foreground-labels`) — new dev-only `?gpuTimings` rows; the DebugPanel derives its rows, so no component edit.
4. **Depth attachments become target-table + executor data.** `RenderTargetSpec.depth` exists in the locked type but no phase-2 row uses it; `foreground:0` is the first. `renderTargets` allocates/resizes/destroys a depth texture alongside colour for rows that declare depth; `executeFrame` attaches a `depthStencilAttachment` (first touch: `depthClearValue: 1.0` + `'clear'`; later passes `'load'`; always `depthStoreOp: 'store'`) whenever the step's target row has one. This replaces the branch's `foregroundOffscreen.ts` module, its `@types` file, its `state.gpu` handle, its `runFrame` resize block, and its engine destroy rows — the target table already owns exactly those lifecycles.
5. **NEAR0 slab activation.** `deriveSlabs`' near row swaps its provisional `computeViewProj`-shaped derivation for `computeForegroundViewProj({eyeMpc, targetMpc, up: [0, 1, 0], renderOrigin: RENDER_ORIGIN_MPC, fovYRad, aspect, near: cam.distance · FOREGROUND_NEAR_FRACTION, far: cam.distance · FOREGROUND_FAR_MULTIPLIER})` — origin-relative f64, same near/far heuristic (1e-4 / 100, constants keep their names and their "the zoom-to-earth series' Plan 03 replaces this with an adaptive `foregroundFrustum`" forward-reference, with ONE home: `slabs.ts`). `ReadyFrameContext` gains **no** foreground fields — the branch's `ctx.foregroundVp`/`foregroundNear`/`foregroundFar`/`renderOrigin` (branch `ReadyFrameContext.d.ts:98-129`) dissolve into the slab row; consumers import `RENDER_ORIGIN_MPC` directly (it is a constant, not per-frame state). `RENDER_ORIGIN_MPC = [0, 0, 0]` today, so the numbers are identical to what plan 02's provisional row produced — the semantic swap (origin-relative frame, f64 end-to-end) is the point, and it is what `composeBodyMvp`'s compose-before-narrow contract requires.

## Ride-along inventory (branch modules this fold does NOT touch)

These are #386 feature content, not frame wiring — they keep the branch's shape through the Task-1 merge, with their tests: `src/data/scaleUnits.ts`, `src/data/renderOrigin.ts`, `src/data/bodies/debugSphereBody.ts`, `src/utils/math/narrowMat4.ts`, `src/utils/camera/composeBodyMvp.ts`, `src/utils/camera/computeForegroundViewProj.ts`, `src/utils/math/uvSphereMesh.ts` + `src/@types/math/UvSphereMesh.d.ts`, `src/utils/camera/clampDistance.ts` (`MIN_DISTANCE_MPC = 1e-17`), `src/utils/format/formatDistance.ts` (pc/AU/km ladder), `src/utils/math/milkyWayApproachFadeAlpha.ts`, `src/services/engine/presentation/debugSphereLabels.ts`, `src/services/gpu/renderers/debugSphereRenderer.ts` + `src/@types/rendering/DebugSphereRenderer.d.ts`, `src/services/gpu/shaders/lib/sphere.wesl`, `src/services/gpu/shaders/debugSphere/{vertex,fragment}.wesl`, and the four zoom-to-earth docs under `docs/superpowers/{plans,specs}/2026-06-29-zoom-to-earth-*.md`.

**The one overlap:** the branch edited `passes/milkyWayPass.ts` (near-side approach fade — `milkyWayVisibility = milkyWayFadeAlpha · milkyWayApproachFadeAlpha` in both `enabled` and `draw`), and plan 02 converted that file to `passes/milkyWayLayer.ts`. The branch's edit must be **re-applied onto the converted layer** during the Task-1 merge — it is a gate/alpha change orthogonal to the layer conversion, so it transplants cleanly (Task 1 policy below).

## Consequences for the zoom-to-earth series

The branch's own follow-up plans — `docs/superpowers/plans/2026-06-29-zoom-to-earth-02-earth-and-anchors.md` and `...-03-lod-and-polish.md` — reference `encodeForegroundPass` and `ctx.foregroundVp`, both of which this plan deletes. When those plans are picked up they need re-grounding onto the layer/slab surface (a foreground body renderer becomes a `foreground:0` layer's renderer; the adaptive frustum lands in `slabs.ts`). **Do not rewrite them in this plan** — note the staleness in the Task-1 merge commit body and move on.

---

### Task 1 — merge `main` into the branch under an explicit resolution policy

**Files:** the merge commit, plus the deletions and the one re-application below.

- [ ] On `feat/zoom-to-earth-true-scale`: `git fetch origin && git merge origin/main`.
- [ ] Resolve by policy — **frame-orchestration files take MAIN verbatim** (their branch-side additions are reconstructed by Tasks 2-7): `src/services/engine/frame/renderFrame.ts`, `src/services/engine/frame/frameContext.ts`, `src/@types/engine/frame/ReadyFrameContext.d.ts`, `src/services/engine/frame/runFrame.ts`, `src/services/engine/phases/initGpu.ts`, `src/services/engine/engine.ts`, `src/@types/engine/handles/EngineGpuHandles.d.ts`, `src/services/gpu/passes/postProcess.ts`, `src/services/engine/frame/passes/index.ts`, and every `passes/*Layer.ts` plan 02 converted. Same policy for their tests (`frameContext.test.ts`, `passes.test.ts` + per-layer tests, `renderFrame.test.ts`, `renderFrame.timing.test.ts`, `runFrame.test.ts`, `engineState.test.ts`, `initGpu.destroyReachability.test.ts`); files `main` deleted stay deleted (the `encodeHdr*`/`encodeUiOverlay`/`encodeVolume*` world and their tests), and branch-side fixture additions to them are dropped.
- [ ] **Branch-only leaf modules keep the branch shape** — the full ride-along inventory above, plus their tests.
- [ ] **Re-apply the Milky Way edit:** transplant the branch's `milkyWayVisibility` product (branch diff of `passes/milkyWayPass.ts` — the `milkyWayApproachFadeAlpha` import, the module-local `milkyWayVisibility` helper, and its use in both `enabled` and `draw`) onto main's converted `passes/milkyWayLayer.ts`, keeping the layer's plan-02 draw signature (`view.vp`/`view.viewportPx`, `state.gpu.milkyWayRenderer`). Port the branch's header-comment update for the two-sided fade window.
- [ ] **Delete in the same merge** (all reference the deleted `Pass`/`PassDeps` types or are now consumer-less): `src/services/engine/frame/encodeForegroundPass.ts`, `src/services/engine/frame/encodeForegroundOver.ts`, `src/services/engine/frame/passes/foregroundLabelsPass.ts`; `src/services/gpu/passes/foregroundComposite.ts` + `src/services/gpu/shaders/foregroundComposite/{vertex,fragment,io}.wesl` + `src/@types/rendering/ForegroundComposite.d.ts` (its only consumers were `encodeForegroundOver` and the branch's `initGpu`, both gone — plan-time decision 2); `src/data/toneMapDefaults.ts` (its consumers were `foregroundComposite` and the branch's `postProcess`; main's compositor owns the constants).
- [ ] Grep for references to every deleted symbol (`encodeForegroundPass`, `encodeForegroundOver`, `foregroundLabelsPass`, `foregroundComposite`, `ForegroundComposite`, `toneMapDefaults`, `TONEMAP_WHITEPOINT`) — zero hits outside `docs/`.
- [ ] `npm run typecheck && npm test` → green. **State the transient in the merge-commit body:** the foreground is disconnected (no spheres, no captions) until Task 7; the branch never merges alone in this state; the zoom-to-earth plans 02/03 docs are now stale against this fold (see Consequences above).
- [ ] Commit (the merge commit; stage the resolution + deletions by path).

### Task 2 — depth support in `renderTargets` + `executeFrame`; the `foreground:0` row

**Files:** `src/services/gpu/renderTargets.ts`, `src/services/engine/frame/executeFrame.ts`, `tests/services/gpu/renderTargets.test.ts`, `tests/services/engine/frame/executeFrame.test.ts`; **delete** `src/services/gpu/passes/foregroundOffscreen.ts` + `src/@types/rendering/ForegroundOffscreen.d.ts` (unreferenced since Task 1 — the handle/resize/destroy wiring never came over because those files took MAIN; verify with a grep before deleting).

**Contract** (the ONE extension to plan 02's `RenderTargets` type):

```ts
export type RenderTargets = {
  // ...plan 02's members unchanged...
  /** Depth view for rows whose spec declares depth; throws for depthless rows and 'swap'. */
  depthViewOf(id: string): GPUTextureView;
};
```

**New row** (spec line 143): `{ id: 'foreground:0', format: 'rgba16float', depth: 'depth32float', scale: 1 }`. Clear values (target-table data per plan 02's decision 2): colour `{ r: 0, g: 0, b: 0, a: 0 }` — transparent, so the later OVER composite leaves every pixel the foreground did not draw unchanged (the branch's `encodeForegroundPass.ts:69-90` rationale, now a table entry); depth clear `1.0` (far plane) so the first fragment always wins the initial test. Depth textures get `usage: RENDER_ATTACHMENT` only (never sampled — carry the branch `foregroundOffscreen.ts` comment). Full resolution (`scale: 1`) because opaque geometry has hard edges bilinear upsampling would smear — carry that rationale too.

**Executor rule:** when a render step's target row declares depth, `beginRenderPass` gains `depthStencilAttachment: { view: renderTargets.depthViewOf(step.target), depthClearValue: 1.0, depthLoadOp: <first touch ? 'clear' : 'load'>, depthStoreOp: 'store' }` — the same per-frame `touched` set that drives the colour clear drives the depth load-op (one first-touch fact, two attachments). `perLayerTimed` passes after the first therefore re-load depth, preserving inter-layer occlusion. Composite steps never attach depth (their dest rows are depthless).

- [ ] Test (`renderTargets.test.ts`): `allocates and resizes a depth texture alongside colour for rows that declare depth` — `foreground:0` produces two `createTexture` calls (rgba16float + depth32float, both at size·1); `resize` reallocates both.
- [ ] Test: `depthViewOf returns the depth view for foreground:0 and throws for depthless rows and swap`.
- [ ] Test: extend the specs-table test with the `foreground:0` row `{format: 'rgba16float', depth: 'depth32float', scale: 1}`.
- [ ] Test: `destroy destroys depth textures alongside colour`.
- [ ] Test (`executeFrame.test.ts`): `attaches a clearing depth attachment on a depth target's first pass and loads on later passes` — two passes against a fake depth-bearing target: first descriptor `depthLoadOp: 'clear'` + `depthClearValue: 1.0`, second `'load'`.
- [ ] Test: `opens no depthStencilAttachment for depthless targets` — the hdr/swap descriptors carry no `depthStencilAttachment` key.
- [ ] Implement; delete the two `foregroundOffscreen` files.
- [ ] `npm run typecheck && npm test` → green.
- [ ] Commit the touched + deleted paths.

### Task 3 — re-add the two renderer handles + the caption presentation wiring

**Files:** `src/@types/engine/handles/EngineGpuHandles.d.ts`, `src/services/engine/engine.ts` (state literal + destroy chain), `src/services/engine/phases/initGpu.ts`, `src/services/gpu/renderers/debugSphereRenderer.ts` (param rename only), `tests/@types/engineState.test.ts`, `tests/services/engine/phases/initGpu.destroyReachability.test.ts`, `tests/services/gpu/renderers` debugSphere test if the branch shipped one.

**Contract:** `EngineGpuHandles` regains `debugSphereRenderer: DebugSphereRenderer | null` and `foregroundLabelRenderer: LabelRenderer | null` — reconstruct the branch's docblocks (branch `EngineGpuHandles.d.ts:152-161, 296-304`), updated for the new surfaces: captions project through the NEAR0 slab view (not "`foregroundVp`"), bodies draw into the `foreground:0` target. Both handles are excluded from `isEngineReady` and null-checked at use, like `labelRenderer`. Both are viewport-independent — **no** `runFrame` resize entry (the branch's resize block belonged to `foregroundOffscreen`, which is now `renderTargets`' job).

**initGpu** (model on the branch's `initGpu.ts:400-413`, minus the two deleted handles):

- `state.gpu.debugSphereRenderer = createDebugSphereRenderer(device, 'rgba16float', 'depth32float')` — the two formats **must** match the `foreground:0` row's `format`/`depth` (the target↔renderer-profile invariant, spec lines 190-194; say so in the construction comment). Rename the factory's `colorFormat` parameter to `targetFormat` per plan 02's Task-10 naming idiom (`depthFormat` keeps its name — it names the depth half of the same profile).
- `state.gpu.foregroundLabelRenderer = createLabelRenderer(uiCtx, fontAtlases)` then `.setLabels(debugSphereLabels())` — the caption path verbatim from the branch: a second MSDF label renderer against the swap format (`uiCtx`), holding the static Sun/Earth label set uploaded once at construction; the layer (Task 5) only draws it.

**engine.ts:** seed both fields `null` in the state literal with the branch's rationale comments; destroy rows `state.gpu.foregroundLabelRenderer?.destroy()` (adjacent to `labelRenderer`) and `state.gpu.debugSphereRenderer?.destroy()` (adjacent to `diskRadiusRing`), each re-nulled.

- [ ] Test (`initGpu.destroyReachability.test.ts`): add a `vi.mock` for the `debugSphereRenderer` module (same `makeStub` shape as the other renderer mocks — it also keeps its `?static` WESL imports out of JSDOM); add both fields to `makeState()`'s gpu bag; extend the writes-onto-state and destroy-chain-reaches assertions to both handles.
- [ ] Test (`engineState.test.ts`): the state-literal shape gains the two null seeds.
- [ ] Implement the wiring + the `targetFormat` rename (update the factory's call site and any factory test asserting the pipeline's colour-target format).
- [ ] `npm run typecheck && npm test` → green (handles constructed but unconsumed — expected until Tasks 4-5).
- [ ] Commit the touched paths.

### Task 4 — `debugSpheresLayer`: the bodies as a `foreground:0` content row

**Files:** create `src/services/engine/frame/passes/debugSpheresLayer.ts` + `tests/services/engine/frame/passes/debugSpheresLayer.test.ts`; modify `src/services/engine/frame/passes/index.ts`, `tests/services/engine/frame/passes/passes.test.ts`.

**Row** (spec line 215): `{ name: 'debug-spheres', slab: NEAR0, target: 'foreground:0', blend: 'opaque' }`.
**enabled:** `state.gpu.debugSphereRenderer !== null` — the branch's second gate (`foregroundOffscreen` non-null) dissolves: the target is `renderTargets`' row, bootstrap-guaranteed behind the ready gate.
**draw:** map `DEBUG_SPHERE_BODIES` through `composeBodyMvp(view.slab.vp, body.positionMpc, RENDER_ORIGIN_MPC, body.radiusMpc)`, then `debugSphereRenderer.draw(pass, mvps)` (the branch's `encodeForegroundPass.ts:92-97` body, re-homed).

**The f64 seam — get this right and document it in the layer header:** `composeBodyMvp` needs the slab's **`Float64Array`** view-projection (`view.slab.vp`), NOT `view.vp` — `SlabView.vp` is the f32 narrowing `slabViewOf` builds for renderers, and feeding it to the compose-before-narrow path would resolve the near-cancellation (body position ~1e-12 Mpc against the VP translation) *after* the precision is already gone, silently mis-placing Earth by more than its radius (see `composeBodyMvp`'s module header). This is the rare layer the spec's `SlabView.slab` field exists for. `RENDER_ORIGIN_MPC` is imported directly from `src/data/renderOrigin.ts` — a constant, not ctx state (plan-time decision 5).

Register in `CONTENT_LAYERS` after the swap group (registry position only affects timing-slot listing — no other layer shares its `(target, slab)`).

- [ ] Test (`passes.test.ts`): extend the migration-table test with the `debug-spheres` row; extend the blend-legality test — `foreground:0` layers are all `'opaque'` (hdr `additive` / swap `over` clauses unchanged).
- [ ] Test (`debugSpheresLayer.test.ts`): `draw composes one MVP per body from the slab's f64 vp` — spy renderer + real `composeBodyMvp`: `renderer.draw` receives `DEBUG_SPHERE_BODIES.length` `Float32Array`s, and the layer passed `view.slab.vp` (assert via a `view` fixture whose `slab.vp` is a recognisable `Float64Array` and whose `vp` is a deliberately different `Float32Array` — identity-check which one the compose consumed, e.g. by mocking `composeBodyMvp` and asserting its first arg `toBe(view.slab.vp)`).
- [ ] Test: `enabled is false while the renderer handle is null and true once set`.
- [ ] Implement + register.
- [ ] `npm run typecheck && npm test` → green (no program step selects the layer yet — inert until Task 7).
- [ ] Commit the touched paths.

### Task 5 — `foregroundLabelsLayer`: captions as a NEAR0 swap row

**Files:** create `src/services/engine/frame/passes/foregroundLabelsLayer.ts` + `tests/services/engine/frame/passes/foregroundLabelsLayer.test.ts`; modify `src/services/engine/frame/passes/index.ts`, `tests/services/engine/frame/passes/passes.test.ts`.

**Row** (spec line 216): `{ name: 'foreground-labels', slab: NEAR0, target: 'swap', blend: 'over' }`.
**enabled** (the branch's `foregroundLabelsPass.ts:43-47` gate verbatim): renderer non-null `&& renderer.glyphCount() > 0 && ctx.cam.distance < SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`. The constant (`1e-3` — one kiloparsec) moves here **with its didactic comment** (branch `foregroundLabelsPass.ts:31-38`: captions are descent navigation aids; above kpc scale they'd clutter the normal view).
**draw:** `state.gpu.foregroundLabelRenderer.draw(pass, view.vp, view.viewportPx)` — the branch's explicit `narrowMat4(ctx.foregroundVp)` call dissolves: `slabViewOf` already narrows the slab's f64 vp to the `Float32Array` the label vertex shader consumes (`Float32Array.from` ≡ `narrowMat4`'s `new Float32Array(m)`), and f32 is amply precise for a caption anchor at the zooms where the gate is open (carry that one-line rationale). Keep the module header's "why a second label renderer" story (one renderer draws with one view-projection; the main labels project through COSMO, whose near plane clips the solar system away).

Register directly after `debugSpheresLayer`.

- [ ] Test (`passes.test.ts`): migration-table row; the blend-legality swap clause now covers six `over` rows.
- [ ] Test (`foregroundLabelsLayer.test.ts`): `enabled respects the kiloparsec distance gate` — true at `cam.distance` 5e-4 with glyphs, false at 1e-3 and above, false with `glyphCount() === 0`, false with a null renderer.
- [ ] Test: `draw threads the SlabView vp and viewport to the label renderer` (arg assertions per the plan-02 layer-test idiom).
- [ ] Implement + register.
- [ ] `npm run typecheck && npm test` → green (inert until Task 7 — the existing swap step is `(swap, COSMO)`, which selects nothing here by construction).
- [ ] Commit the touched paths.

### Task 6 — activate the NEAR0 slab: origin-relative f64 derivation

**Files:** `src/services/engine/frame/slabs.ts`, `tests/services/engine/frame/slabs.test.ts`.

Swap the near row's provisional vp derivation for the branch's real one (plan-time decision 5): `computeForegroundViewProj({ eyeMpc: cam.position, targetMpc: cam.target, up: [0, 1, 0], renderOrigin: RENDER_ORIGIN_MPC, fovYRad: cam.fovYRad, aspect: cam.aspect, near, far })` with `near = cam.distance · FOREGROUND_NEAR_FRACTION` (1e-4) and `far = cam.distance · FOREGROUND_FAR_MULTIPLIER` (100). The two named constants move from the branch's (merged-away) `frameContext.ts:162-163` into `slabs.ts` — their ONE home — keeping their didactic block: the ratio brackets a 1-AU body through the full descent, near > 0 holds because `cam.distance > 0` by the orbit-controls clamp, and **the zoom-to-earth series' Plan 03** (`docs/superpowers/plans/2026-06-29-zoom-to-earth-03-lod-and-polish.md`) replaces both with an adaptive `foregroundFrustum(cam.distance)`. Delete the row's "provisional"/"layerless until PR #386" marker comments; the row comment now states the live facts: origin-relative f64 (`originRelative: true`, `precision: 'f64'` — unchanged fields, now true in practice), fixed up = world +Y (roll parity deferred with the zoom-to-earth series), and `camPos` note — `RENDER_ORIGIN_MPC` is the world origin today, so `ctx.drawCamPos` is already origin-relative; a future floating origin re-derives per-slab `camPos` in `slabViewOf`.

- [ ] Test: `the near row's vp is the origin-relative computeForegroundViewProj product` — call the util directly in the test with the same camera inputs and assert `Float64Array` equality with `deriveSlabs(...)[0].vp` (pins the util as the derivation — an equal-but-reimplemented matrix would drift on the next util change).
- [ ] Test: keep/adjust `slabViewOf(ctx, NEAR0) exposes the adaptive near/far slab row` (near = distance·1e-4, far = distance·100 — unchanged numbers).
- [ ] Test: existing two-row/index-invariant/COSMO tests unchanged.
- [ ] Implement; grep `FOREGROUND_NEAR_FRACTION` — exactly one definition site.
- [ ] `npm run typecheck && npm test` → green.
- [ ] Commit the touched paths.

### Task 7 — the three FRAME tail steps

**Files:** `src/services/engine/frame/frameProgram.ts`, `tests/services/engine/frame/frameProgram.test.ts`, `tests/services/engine/frame/renderFrame.test.ts`, `tests/services/engine/frame/renderFrame.timing.test.ts`.

`frameProgram(tone)` appends the spec's FRAME tail (spec lines 329-331) after the swap/COSMO step:

```ts
{ kind: 'render', target: 'foreground:0', slab: NEAR0 },
{ kind: 'composite', step: { source: 'foreground:0', dest: 'swap', blend: 'over', tone } },
{ kind: 'render', target: 'swap', slab: NEAR0 },
```

`tone` is the **same object** the hdr→swap composite carries — the shared-curve-across-the-limb requirement, now enforced by identity instead of a constants file. `executeFrame` needs zero edits: `viewFor('foreground:0')` resolves through the target table (Task 2's row), the depth attachment rides Task 2's rule, and the touched-set rule skips the `over` composite whenever the foreground render step drew nothing (behaviour delta b). The step order is the visible "captions over bodies, bodies over cosmological labels" decision — carry the spec's one-paragraph rationale into the program's step comments.

- [ ] Test: the main-program deep-equal test grows to the eight-step literal (five plan-02 steps + the tail above).
- [ ] Test: `the two composites share one tone instance` — `steps[3].step.tone` `toBe` `steps[6].step.tone` (adjust indices to the landed program).
- [ ] Test: the only-composite assertion becomes `the program's composites are hdr→swap replace and foreground:0→swap over, in that order`.
- [ ] Test: the every-render-step-references-a-known-slab test now spans both `NEAR0` and `COSMO`.
- [ ] Test: the real-registry `timedSlotsOf` assertion appends `'debug-spheres'`, `'foreground:0→swap'`, `'foreground-labels'` before `'pick'`.
- [ ] Update `renderFrame.test.ts` / `renderFrame.timing.test.ts` where the canonical-order or slot-name fixtures pin the old five-step shape (the foreground steps select nothing when the fixtures' gpu bag has null foreground handles — assert that skip once: `no foreground pass or composite is encoded while the foreground handles are null`).
- [ ] `npm run typecheck && npm test` → green.
- [ ] Commit the touched paths.

### Task 8 — gate: full suite, radar, the deferred #386 visual gate, un-draft

- [ ] `npm run typecheck` + `npm test` + `npm run build` → all green. Prettier over touched files only.
- [ ] Grep the whole of `src/` (comments included) for stragglers: `foregroundVp`, `foregroundNear`, `foregroundFar`, `foregroundOffscreen`, `foregroundComposite`, `toneMapDefaults`, `encodeForeground` — zero hits.
- [ ] Run the `entanglement-radar` skill over `git diff origin/main...HEAD`. Verify: the slab/target/blend axes stayed independent (no foreground-specific branch in executor or program); the near/far heuristic constants have ONE home (`slabs.ts`); the f64/f32 seam has exactly one reader of `view.slab.vp` (`debugSpheresLayer`) with the why documented there; no mirror state re-grew (the tone identity replaces the deleted constants file, not duplicates it). Fix findings via a dispatched subagent.
- [ ] **USER VISUAL GATE — the deferred #386 gate, on the folded shape (do not self-certify):** at cosmological zoom nothing changed vs `main`; descend toward the Sun (`MIN_DISTANCE_MPC` allows it) — the Sun/Earth spheres render true-scale, captions appear below 1 kpc and track the bodies, opaque bodies occlude galaxy-level labels and marker-lines behind them, tone parity holds across the Sun's limb while switching all five curves and sweeping exposure (foreground and background respond identically), the Milky Way approach-fade dims the impostor on the dive inside the disc; `?gpuTimings` shows the three new slots.
- [ ] On pass: mark PR #386 ready for review (`gh pr ready 386`), restate the three behaviour deltas (plan-time decision 3) in the PR body, and hand off per `superpowers:finishing-a-development-branch` / `/feature-done`.

---

## Spec-clause coverage checklist (self-audit)

| Spec clause                                                                  | Task    |
| ---------------------------------------------------------------------------- | ------- |
| Second tone-map (`foregroundComposite`) dissolves into the Compositor        | 1, 7    |
| `foreground:0` target-table row (rgba16float / depth32float / 1)             | 2       |
| Foreground stops being a `renderFrame` special case                          | 1, 7    |
| "debug bodies" migration row (NEAR0 / foreground:0 / opaque)                 | 4       |
| "captions" migration row (NEAR0 / swap / over)                               | 5       |
| NEAR0 slab derived per frame, origin-relative f64 (`composeBodyMvp` path)    | 6       |
| Labels-occluded-by-bodies as a visible FRAME ordering decision               | 7       |
| Behaviour-neutral acceptance (the #386 visual gate)                          | 8       |
| No pickable body / `pick:near0` stays unallocated (Out of scope)             | — (n/a) |
