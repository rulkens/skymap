# Frame / view split — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use `- [ ]` checkboxes.

**Goal:** Derive the frame once and each view of it separately, so a rig's views share one camera, one body-state sample and one clock while each keeps its own first-touch bookkeeping — the shape PR 1's `view?: ViewSpec` parameter stood in for.

**Architecture:** `deriveFrameContext(state, input)` derives the FRAME (orbit camera, arm, body states, un-turned pose provider, clock, render targets, `runFrame`'s stamps). `deriveView(snapshot, spec)` derives one `FrameView` — turned `cam`, `vp`, `slabs`, turned `bodyPose`, size, eye, `drawPxPerRad`, `fovYRad`, `viewSlot`, `viewKind`, `output?`, its own `renderedTargets` — holding the frame context by reference as `snapshot`. Every pass takes a `FrameView`; view fields keep `ctx.x`, frame fields become `ctx.snapshot.x`. `RenderFrameInput` becomes `{ canvas, views }`.

**Tech stack:** TypeScript, WebGPU, WGSL/WESL, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-view-rigs-dome-fisheye-design.md`, "Ground preparation" → **P6** (and the "Reversed 2026-09-20" note under it). **Builds on:** PR 1, `docs/superpowers/plans/2026-09-19-view-rigs-prep.md`; rides its branch and PR (#769).

**Consumes backlog _frame-view-record_** (`docs/backlog/2026-08-23-frame-view-record.md`). That item proposed the inverse nesting (`ctx.view.vp`, ~260 renames); this split nests the other way (`ctx.snapshot.x`, ~90) and satisfies its goal the same way — the four per-frame WeakMaps keyed on a context (`cosmoLabelProjection.ts:14`, `near0LabelProjection.ts:20`, `atmosphereDrawListCache.ts:7`, `starCutOncePerCtx.ts:23`) key on the `FrameView` a pass receives, so a second view can never read the first view's memo.

**Dispatch groups:** A = Tasks 1–3 (types, spec builders, the split; Opus). B = Tasks 4–8 (callers + the mechanical sweep; Sonnet). C = Task 9 (docs; Sonnet). One final review after C.

## Global constraints

- **Mono renders byte-identical** except for two ruled drifts, both on the canvas view only:
  - `fovYRad = atan(tanUp) − atan(tanDown)` may differ from `cam.fovYRad` by ≤1 ulp (same class as the ruled f64 `m[0]` drift).
  - `view.cam` is now the turned camera even for the canvas view: `yaw`/`pitch`/`roll` are 0 and `target`/`poseBasis`/`upBasis` are rebuilt. No pass reads those on a `'frame'` view (census: only `skyCubemapBlitPass` reads `poseBasis`, on capture faces, which already have yaw = pitch = 0; `logCameraState` is not ctx-based). Anything wanting the true pose reads `ctx.snapshot.cam`. `cam.distance` — the ~15 foreground gates — is preserved by `turnedOrbitCamera`.
  - Identity rotation × basis and zero offsets are exact in floating point, so `vp`, `drawCamPos` and the slab vps are unchanged for the canvas view. **No identity short-circuit**: the canvas view goes through `turnedOrbitCamera` like every other view.
- **First-touch stays per view**: `renderedTargets` is a `FrameView` field, minted fresh by `deriveView` — it answers "which targets has THIS view's program touched", both for clear-vs-load and for the later did-it-render guard, exactly as PR 1 behaves. `renderFrame`'s fold into a main set is still deleted: `once` sections run against `canvas` and read `canvas`'s own set (mono: `canvas === views[0]`, so one set; dome: the resample step marks `hdr` on `canvas` itself, so bloom/tonemap see it).
- A view's frustum never feeds the camera path; captures keep `flipClipY`.
- `type` aliases only; one type per `@types/` file; one function per `utils/` file; frame files (`src/services/engine/frame/**`) export ONLY their one symbol — helpers to `src/utils/`, constants to `src/data/` (`tests/services/engine/frame/frameFilePurity.test.ts`, allow-list only shrinks).
- Renames/moves via `npm run move-files -- <from> <to>`, never `git mv` + hand-edited imports.
- Never `git add -A`; stage by path. Prettier only on touched files.
- **The tree does not typecheck between Task 1 and Task 8.** Tasks 1–7 are checkpoint commits; `npm run typecheck:fast` is expected red until Task 8 closes the sweep, and CI is the gate on the pushed branch. Targeted tests still run per task where they can.
- Comments: why, not what; module header ≤ 5 lines (`docs/superpowers/conventions/comments.md`).

---

### Task 1: `FrameContextInput`, `ReadyFrameContext` reshaped, `FrameView`

**Files:** `src/@types/engine/frame/FrameContextInput.d.ts` (create), `src/@types/engine/frame/FrameView.d.ts` (create), `src/@types/engine/frame/ReadyFrameContext.d.ts` (rewrite), `src/@types/engine/frame/ViewSpec.d.ts` (modify — `kind`), `src/@types/engine/frame/ViewRig.d.ts` (modify), `src/@types/engine/frame/CaptureFace.d.ts` (modify — `ctx: FrameView`)

**Contract:**

```ts
// FrameContextInput — ONE input bag in place of twelve positionals. No pose-shaped
// type is minted: `OrbitCamera` already carries pose, projection, both bases and
// `position`, and the CALLER assembles it (`assembleOrbitCamera`) before calling —
// `deriveFrameContext` no longer does. `ReadyFrameContext.cam` is `input.cam`, by reference.
type FrameContextInput = {
  cam: OrbitCamera;
  /** The SAME framed pose `cam`'s pose was folded from — serves the pose-provider seam only. */
  arm: FramedCameraPose;
  /** Eye→pivot-surface range NEAR0's bracket is sized from. REQUIRED, not optional:
   *  `runFrame` already computes it for the scale bar (`runFrame.ts:167`) — it passes
   *  that one; `pickFrameContext` computes the same line; a capture passes its nearMpc. */
  altitudeMpc: number;
  nowMs: number;
  simDays: number;
  visibleSourceMask: number;
};

// ReadyFrameContext — FRAME-wide, ONE per frame, held by every view BY REFERENCE
// (never spread, never copied: sharing is what makes the clock, the body-state
// sample and the stamps one thing rather than N drifting ones).
type ReadyFrameContext = {
  isReady: true;
  cam: OrbitCamera; // the orbit camera, pose-true (yaw/pitch intact)
  arm: FramedCameraPose;
  camBasisWorld: Mat3;
  bodyStates: ReadonlyMap<BodyId, BodyState>; // this frame's ONE R_body(t) sample
  bodyPose: BodyPoseProvider; // the UN-turned provider (the A/B seam as today)
  nowMs: number;
  simDays: number;
  visibleSourceMask: number;
  renderTargets: RenderTargets;
  focus: FocusUniformsValue;
  focusBlend: number;
  layersSettling: boolean;
  cursorTexPx: Readonly<Vec2> | null;
};
// FrameContext stays the { isReady: false } | ReadyFrameContext union.

// FrameView — one per view; what every pass receives as `ctx`.
type FrameView = {
  /** The frame context, by reference. NOT named `frame`: that word already means a
   *  rung tag (`PoseFrame`, `camera.base.frame`) and a coordinate frame (`slab.frame`),
   *  so `ctx.frame.nowMs` beside `slab.frame.kind` misreads. */
  snapshot: ReadyFrameContext;
  cam: OrbitCamera; // ALWAYS turnedOrbitCamera(snapshot.cam, viewBasisWorld, drawCamPos, frustum)
  vp: Mat4;
  slabs: readonly Slab[];
  bodyPose: BodyPoseProvider; // snapshot.bodyPose turned via viewBodyPose
  canvasSize: Size; // THIS view's target size (name kept: 37 read sites)
  drawCamPos: Readonly<Vec3>;
  drawPxPerRad: number;
  fovYRad: number;
  viewSlot: number;
  viewKind: ViewKind;
  output?: GPUTextureView;
  /** THIS view's first-touch set, minted per `deriveView`; the executor populates it. */
  renderedTargets: ReadonlySet<string>;
};

// ViewSpec gains `readonly kind: ViewKind` — captures stop patching `viewKind` after the fact.
// ViewRig.views: (canvas: FrameView, state: EngineState) => readonly FrameView[]
```

- [x] Move each doc comment with its field: the long `viewSlot`, `renderedTargets`, `bodyPose`, `nowMs`/`simDays` docs are load-bearing and land on whichever type now owns the field. `FrameView`'s header says the `snapshot` back-reference is shared, never copied. `FrameView` stays flat: `canvasSize`, `viewSlot`, `viewKind` and `output?` are fields, not a `spec` held by reference.
- [x] No test: a type sweep the compiler checks.
- Deviation: `ReadyFrameContext` also carries `altitudeMpc` and the three frame-wide rosters the view derivation culls (`slabBodyCandidates`, `meshBodies`, `positionedStars`). `deriveView(snapshot, spec)` takes no `EngineState`, and `frameContext.ts:151-159` / `:239` read one — the contract's field list omitted them.

### Task 2: `mainViewSpec`, `faceViewSpec`, cube-face tables out of `cubemapFaceContext`

**Files:** `src/utils/camera/mainViewSpec.ts` (create), `src/utils/camera/faceViewSpec.ts` (create), `src/data/rendering/cubeFaceBases.ts` (create), `src/services/engine/frame/cubemapFaceContext.ts` (modify — drop `FACE_FORWARD`/`FACE_UP`/`FACE_BASES`), `tests/services/engine/frame/frameFilePurity.test.ts` (modify — `'frame/cubemapFaceContext'` 4 → 1), `tests/utils/camera/faceViewSpec.test.ts` (create)

**Contract:**

```ts
mainViewSpec(cam: OrbitCamera, sizePx: Size): ViewSpec
// identity Mat3, [0,0,0], symmetricFrustum(cam.fovYRad, cam.aspect), slot 0, kind 'frame'
faceViewSpec(face: CubeFace, faceSizePx: number, viewSlotBase: number): ViewSpec
// rotation = FACE_VIEW_ROTATIONS[face], 90° symmetric frustum, square size,
// slot viewSlotBase + face, kind 'capture'
```

`FACE_VIEW_ROTATIONS[face]` column _j_ is that face's image-plane axis _j_ (right | up | forward, the `FACE_FORWARD`/`FACE_UP` pair today's `FACE_BASES` encodes) expressed in the **capture camera's own** image-plane basis — the capture frame's camera looks along its axes' −Z with +Y up (Task 5). Every entry is 0/±1, so the product with any `axes` in `deriveView` is exact, and the table is `axes`-independent: `faceViewSpec` takes no `axes`.

- [x] `src/data/rendering/cubeFaceBases.ts` takes `FACE_FORWARD`, `FACE_UP` and `FACE_BASES` verbatim, with their doc comments (`cubemapFaceContext.ts:25-55`). `cubemapFaceContext` keeps only `flipClipY`, so its purity row drops 4 → 1 (the ratchet only shrinks — change the number in the same commit).
- [x] Test `every face rotation is a signed permutation`: each `FACE_VIEW_ROTATIONS[face]` has one ±1 per row and per column and zeros elsewhere — the property the exactness claim rests on. (The per-face `vp` equality against pre-split is Task 5's test; don't duplicate it here.)
- [x] No test for `mainViewSpec`: `deriveView`'s canvas-identity test (Task 3) is the one that can fail.
- [x] Commit. `FACE_VIEW_ROTATIONS` lives beside the tables it derives from (`cubeFaceBases.ts`), not in `faceViewSpec.ts` — a `utils/` file declares its one function.

### Task 3: Split `deriveFrameContext` / `deriveView`

**review: yes** (camera and pose maths; `frameContext.ts` is named by the camera-pose-basis landmine memory)

**Files:** `src/services/engine/frame/frameContext.ts` (rewrite), `src/services/engine/frame/deriveView.ts` (create), `src/services/engine/frame/deriveViewContext.ts` (delete), `tests/services/engine/frame/deriveViewContext.test.ts` → `tests/services/engine/frame/deriveView.test.ts` (rename + rewrite), `tests/services/engine/frame/frameContext.test.ts` (modify — 14 `deriveFrameContext(` call sites), `tests/helpers/frame/canvasViewOf.ts` (create, optional)

**Contract:**

```ts
// src/services/engine/frame/frameContext.ts
deriveFrameContext(state: EngineState, input: FrameContextInput): FrameContext
// src/services/engine/frame/deriveView.ts
deriveView(snapshot: ReadyFrameContext, spec: ViewSpec): FrameView   // never null: `snapshot` is already ready
```

**Where today's lines go** (`frameContext.ts` is 313 lines; cite, don't re-read from here):

| Today                                                               | After                                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `assembleOrbitCamera` (`:105`)                                      | deleted — the caller assembles; `cam` is `input.cam`           |
| `camBasisWorld` (`:116-130`)                                        | frame                                                          |
| `deriveBodyStates`, the A/B provider (`:114`, `:188-206`)           | frame (`bodyPose` stays UN-turned)                             |
| `frustum`/`viewFromCamEye`/`vp` (`:107-109`)                        | view, from `spec` — no `view === undefined` branch left        |
| `viewBasisWorld`, `eyeOffset`, `drawCamPos`, `viewCam` (`:131-149`) | view                                                           |
| slab-gate + `visibleSlabBodies` + mesh-host re-admit (`:161-182`)   | view                                                           |
| `attachedBodiesByHostId` (`:222-235`)                               | view (reads `snapshot.bodyStates`)                             |
| star partition + `starSphereRangeM` (`:239-259`)                    | view                                                           |
| `deriveSlabs`, `drawPxPerRad` (`:263-276`)                          | view; `altitudeMpc` comes from `camera.altitudeMpc`, no `??`   |
| `viewBodyPose` wrapper (`:208-214`)                                 | view, unconditional (identity rotation + zero offset is exact) |

- [ ] **`cameraBasisWorld` util** (user-approved 2026-09-20): create `src/utils/camera/cameraBasisWorld.ts` — `cameraBasisWorld(forward: Readonly<Vec3>, rollRad: number, upBasis: Readonly<Mat3>): Mat3` = `mat3FromColumns(right, up, forward)` over `imagePlaneBasis(forward, rollRad, frameUp(upBasis))`. It takes `forward` rather than a camera because two of the three sites hold a `CameraPose` + bases, not an `OrbitCamera`. Replace the three hand-built sites: `frameContext.ts:124-130` (forward = `orbitForwardOf(cam)`), `poseFrameConversion.ts:58-65`, `cameraDofAnglesOf.ts:95-98` — each becomes one call, same numbers (same seam, same order). Header ≤ 3 lines: it is THE camera basis every world-frame consumer (`bodyRelativePose`, `ViewSpec.rotation`) is relative to. Test `tests/utils/camera/cameraBasisWorld.test.ts`: one case, a rolled forward off-axis, columns equal the `imagePlaneBasis` right/up and the given forward (guards the column ORDER — the Mat3 pole-column landmine).
- [ ] The pose-provider's `armBasisCtx` (`:188-193`) takes its bases off the assembled camera — `cam.poseBasis!` / `cam.upBasis!`, the non-null `assembleOrbitCamera` always sets (optional only on `OrbitCameraInit`, as `deriveViewContext.ts:27` notes today).
- [ ] Delete `deriveViewContext.ts` (`git rm` — `move-files` is not the tool for a deletion) and its re-pack of `focus`/`focusBlend`/`layersSettling`: a view reads them off `snapshot`.
- [ ] Rename its test: `npm run move-files -- tests/services/engine/frame/deriveViewContext.test.ts tests/services/engine/frame/deriveView.test.ts`, then re-point its body. The surviving contracts, renamed to the new seam: `a 90° yaw rotation turns the view's forward to the camera's right`, `five dome-like specs derive five distinct vps from one frame`, `an asymmetric frustum survives into view.vp and drawPxPerRad`, `an eye offset moves drawCamPos by the rotated offset and leaves the frame's pose untouched`, `a body-arm camera keeps its body-arm slab path under a rotated view`. Drop `identity view spec derives the same context as no spec` (no "no spec" case exists) in favour of the pin below.
- [ ] Test `the canvas view's vp, drawCamPos and slab vps are bit-identical to the pre-split values`: pin the numbers from this branch's HEAD **before** the rewrite (run the existing `frameContext.test.ts` fixture through today's `deriveFrameContext`, paste the arrays) and assert element-wise `toBe`. This is the only guard that the no-identity-short-circuit ruling held.
- [ ] Test `two views of one frame share the snapshot by reference`: `a.snapshot === b.snapshot` (and the stamps, clock and `bodyStates` reached through it are one object) — the guard against a `deriveView` that spreads or copies the frame context.
- [ ] Test `each view keeps its own first-touch set`: `a.renderedTargets !== b.renderedTargets`, and a target added to `a`'s is absent from `b`'s — a target first-touched in view A must not read as rendered in view B, which is what clears rather than loads `hdr` for the second view.
- [ ] Re-point `frameContext.test.ts`: its 14 call sites split into `deriveFrameContext(state, input)` plus, where the assertion is about a view field (`ctx.vp`, `drawPxPerRad`, `slabs`, `bodyPose`), one `deriveView(snapshot, mainViewSpec(snapshot.cam, size))`. Its fixtures build a pose + projection + bases today — assemble the `OrbitCamera` once in a shared `tests/helpers/frame/canvasViewOf.ts` (`(state, input) => FrameView | null`) rather than at each call site; don't put it in `src/`.
- [ ] `npm test -- frameContext deriveView` green. Commit.

### Task 4: `runFrame` and `pickFrameContext`

**Files:** `src/services/engine/frame/runFrame.ts` (modify — `:163-192`, `:225-231`), `src/services/engine/helpers/pickFrameContext.ts` (modify), `tests/services/engine/frame/poseFold.test.ts` (modify — its `vi.mock` probe pushes `args[2]`, the pose; now `args[1].cam`, whose `target`/`yaw`/`pitch`/`distance` are that pose), `tests/services/engine/frame/engagedArmClock.test.ts` (modify — same `vi.mock` shape), `tests/services/engine/frame/frameContext.meshBodyHost.test.ts`, `tests/services/engine/helpers/pickFrameContext.test.ts`, `tests/services/engine/frame/runFrame.test.ts` (modify)

**Contract:**

```ts
const cam = assembleOrbitCamera(worldPose, projection, poseBasis, upBasis);   // the caller assembles now
const snapshot = deriveFrameContext(state, { cam, arm: renderPose, altitudeMpc, nowMs, simDays, visibleSourceMask });
// … focus / focusBlend / layersSettling stamped on `snapshot` …
const canvas = deriveView(snapshot, mainViewSpec(snapshot.cam, canvasSize));
const views = VIEW_RIGS[state.viewRig].views(canvas, state);
pickFrameContext(state, canvas): FrameView | null               // deriveView(deriveFrameContext(…pick mask…), mainViewSpec(…))
```

- [ ] Both callers assemble their own `OrbitCamera` (`assembleOrbitCamera(pose, projection, poseBasis, upBasis)`) from what they already hold — `runFrame` from `worldPose` + `next.outputs.projection` + `ORIENTATION_FRAMES[…]` + `upBasis`; `pickFrameContext` from `liveWorldPose(state)` + the displayed outputs + the orientation frame twice.
- [ ] Hoist `pivotSurfaceRangeMpc(renderPose, worldPose.distance, pivotFocus)` out of the `if (state.booted)` scale-bar gate (`runFrame.ts:165-169`) and pass it as `altitudeMpc`: it is the same expression `frameContext.ts:268` computes today, so one call replaces two and the value is bit-identical. `pickFrameContext` computes its own from `state.cameraRuntime.outputs.displayed`, `liveWorldPose(state).distance` and `state.selectionRows.focus`.
- [ ] `views` may now be computed **before** the stamps (they share `snapshot`). Delete the "AFTER the stamps" comment at `runFrame.ts:225-231`; keep the "ahead of the view-dependent planners" reason.
- [ ] Every `ctx.` between `:199` and the `renderFrame` call becomes `canvas.` (view fields) or `canvas.snapshot.` (`nowMs`, `focus`, `simDays` via `sceneBodyStates`) — Task 8 owns the sweep's full census; do this file's now.
- [ ] No new test: `runFrame.test.ts`, `poseFold.test.ts` and `engagedArmClock.test.ts` already pin the ordering these edits could break; re-point them and keep them green (`npm test -- runFrame poseFold engagedArmClock pickFrameContext meshBodyHost`).
- [ ] Commit.

### Task 5: Captures derive the frame once per row

**review: yes** (the per-face basis is pose maths, and `skyCubemapBlitPass` reads `ctx.cam.poseBasis` on faces)

**Files:** `src/services/engine/frame/cubemapCaptureFrame.ts` (create), `src/services/engine/frame/cubemapFaceContext.ts` (modify), `src/services/engine/frame/scheduleSkyCaptures.ts:75-91` (modify), `src/services/engine/frame/scheduleProbeCapture.ts:56-80` (modify), `tests/services/engine/frame/cubemapFaceContext.test.ts` (modify), `tests/services/engine/frame/scheduleProbeCapture.test.ts` (modify)

**Contract:**

```ts
cubemapCaptureFrame(input: {
  state: EngineState; eyeMpc: Readonly<Vec3>; nearMpc: number; nowMs: number;
  /** World-from-cube axes; omitted = world axes. */ axes?: Readonly<Mat3>;
}): FrameContext
cubemapFaceContext(snapshot: ReadyFrameContext, face: CubeFace, faceSizePx: number, viewSlotBase: number): FrameView
```

`cubemapCaptureFrame` assembles the synthetic `OrbitCamera` itself (`assembleOrbitCamera`, as every caller now does) around the capture's **axes** basis (world axes when `axes` is omitted), not a face's: forward = the axes' −Z, up = its +Y, `distance = altitudeMpc = nearMpc`, projection 90°/aspect 1/`near = nearMpc`/`far` off the live projection, `arm: { frame: 'absolute', pose }` as today, mask `deriveSourceMasks(state, nowMs).draw`. Each face is `deriveView(snapshot, faceViewSpec(face, faceSizePx, viewSlotBase))` plus today's `flipClipY` on `vp` and every slab `vp` — the capture-only post-step, unchanged. `viewKind` now arrives from the spec; nothing patches it afterwards.

- [ ] Both schedulers derive the frame ONCE per capture row and loop the six faces off it (today: six `deriveFrameContext` calls per row). The per-face `null` guard collapses into one pre-loop `isReady` check; keep each scheduler's "schedule nothing, retry next frame" behaviour byte-for-byte.
- [ ] Test `a capture row derives its frame once for six faces`: spy on `deriveFrameContext` (or on `cubemapCaptureFrame`) across one `scheduleSkyCaptures` sweep — call count 1, faces 6. This is the whole point of the task and nothing else catches a regression to per-face derivation.
- [ ] Test `each face's vp and cam.poseBasis match the pre-split values`: pin all six from this branch's HEAD before the change and assert element-wise `toBe`. If a term-order difference leaves an element off by ≤1 ulp, record a ruling in the ledger and relax **that element** to 12 significant digits — do not reorder the maths to chase bits.
- [ ] `npm test -- cubemapFaceContext scheduleProbeCapture renderFrame.cubemapCaptures` green. Commit.

### Task 6: `renderFrame` over `{ canvas, views }`

**Files:** `src/@types/engine/frame/RenderFrameInput.d.ts` (modify), `src/@types/engine/frame/ExecuteFrameArgs.d.ts` (modify — `ctx: FrameView`), `src/services/engine/frame/renderFrame.ts` (modify), `src/services/engine/frame/executeFrame.ts` (modify — `ctx.snapshot.renderTargets`; `ctx.renderedTargets` stays a view read), `src/services/engine/frame/scheduleCubemapCaptures.ts`, `src/services/engine/frame/scheduleSkyCaptures.ts`, `src/services/engine/frame/scheduleProbeCapture.ts`, `src/services/engine/frame/captureFaceAttachment.ts`, `src/services/engine/frame/bodyRowSlabs.ts`, `src/data/rendering/viewRigs.ts` (modify), `tests/services/engine/frame/renderFrame.test.ts`, `tests/services/engine/frame/renderFrame.cubemapCaptures.test.ts`, `tests/services/engine/frame/executeFrame.test.ts`, `tests/services/engine/frame/executeFrame.computes.test.ts` (modify)

**Contract:**

```ts
type RenderFrameInput = {
  /** The frame's own view of the swap chain — what `once` sections run against.
   *  They DO read view fields: composite/tonemap resolve `viewFor(dest, ctx, swapView)`
   *  through `ctx.output`, and the sky-view compute's `atmosphereDrawList` reads
   *  `ctx.cam.distance` / `drawCamPos`. */
  canvas: FrameView;
  /** What `perView` sections iterate; mono is `[canvas]`. */
  views: readonly FrameView[];
  state: EngineState;
  device: GPUDevice;
  context: GPUCanvasContext;
  timingService: GpuTimingService;
};
```

- [ ] `flush` loses the `renderedTargets` fold (`renderFrame.ts:105-114`): each view carries its own set and `once` sections run against `canvas`, so nothing needs folding back. `state.gpu.focusUniform?.write(canvas.snapshot.focus)`; `hdrActiveOf(canvas.snapshot.renderTargets)`; `scheduleCubemapCaptures({ state, ctx: canvas })`.
- [ ] `VIEW_RIGS.mono.views` becomes `(canvas) => [canvas]`; the `view !== currentView` batching and the per-section encoder/submit rules are unchanged.
- [ ] No new test: the existing `renderFrame.test.ts` cases (`mono rig submits the same step list`, the two-view expansion, the once-after-perView case) cover this; re-point them to `{ canvas, views }`. The `a once section after a perView section sees targets the views rendered` case now holds through `canvas`'s own set — rewrite its setup, don't delete it; Task 3's per-view-set test is the unit-level half.
- [ ] `npm test -- renderFrame executeFrame` green. Commit.

### Task 7: Star cut over the views

**Files:** `src/services/gpu/renderers/starCatalog/cut/advanceStarCut.ts`, `starCutOncePerCtx.ts`, `readStarCut.ts`, `computeStarCut.ts`, `drawStarStream.ts`, `starCatalogVisible.ts` (modify), `src/services/engine/frame/runFrame.ts:339` (modify), `src/services/engine/frame/passes/starCatalogPass.ts`, `src/services/engine/frame/passes/starAggregatesPass.ts`, `src/services/engine/frame/passes/starPointsPass.ts` (modify), `tests/services/gpu/renderers/starCatalog/cut/readStarCut.test.ts`, `tests/services/engine/frame/passes/starCatalogPass*.test.ts`, `tests/services/engine/frame/passes/starAggregatesPass.test.ts` (modify)

**Contract:**

```ts
advanceStarCut(state: PassState, views: readonly FrameView[]): PreparedStarCut | null
// the frame context is reachable via views[0].snapshot; registration list is `views` — no more [main, ...views]
starCutOncePerCtx(views: readonly FrameView[], compute: () => PreparedStarCut | null)
computeStarCut(state, view: FrameView, views: readonly FrameView[], advanceFades: boolean)
```

- [ ] The memo keyed on `views[0]` stays as is; only the key type changes. Update `starCutOncePerCtx`'s docblock: `deriveView` mints the per-view key now, and "`views[0]` is the main view" becomes "`views[0]` is the canvas view the walk's origin comes from".
- [ ] No new test: the registration change is type-level and the existing `readStarCut`/`starCatalogPass` cases already pin "advance runs once" and the origin rebase.
- [ ] `npm test -- starCut starCatalogPass starAggregatesPass` green. Commit.

### Task 8: The sweep — `ReadyFrameContext` → `FrameView`, `ctx.x` → `ctx.snapshot.x`

**Contract:** every pass, producer, liveness and label signature that says `ctx: ReadyFrameContext` says `ctx: FrameView`. View fields keep `ctx.x` (~270 sites untouched: `cam` 35, `vp` 9, `slabs` 11, `bodyPose` 23, `canvasSize` 37, `drawCamPos` 80, `drawPxPerRad` 20, `fovYRad` 33, `viewSlot` 6, `viewKind` 4, `output` 2, `renderedTargets` 9). Frame fields become `ctx.snapshot.x` (~90 sites: `nowMs` 29, `renderTargets` 31, `simDays` 12, `visibleSourceMask` 8, `focusBlend` 6, `focus` 2, `layersSettling` 2, `cursorTexPx` 2), plus their mirrors in `tests/`.

**Files** — `rg -l "ReadyFrameContext" src tests` is the census; re-run it at the end and confirm the only `src` matches left are the frame-owned ones (`@types/engine/frame/{ReadyFrameContext,FrameContext,NotReadyFrameContext,FrameView,ViewRig,CaptureFace,ExecuteFrameArgs,RenderFrameInput}.d.ts`, `frame/{frameContext,deriveView,cubemapCaptureFrame,cubemapFaceContext,renderFrame,runFrame}.ts`, `helpers/pickFrameContext.ts`). Everything else takes a `FrameView`:

- `src/@types/`: `engine/frame/{ContentPass,ContentCompute,UpsamplePassRow}.d.ts`; `engine/layer/{Layer,LayerInstance}.d.ts`; `engine/subsystems/{Label2DDirector,Label2DDirectorConfig,Label2DProducer,Label3DProducer,MarkerProducer}.d.ts`; `rendering/{GalaxyPointDrawSettings,ProbeCapture,SkyCapture,StarCatalogRenderer,StarPointRenderer,TexturedDiskRenderer,ViewSlotUniformRing}.d.ts`.
- `src/layers/`: `flow/frame.ts`, `flow/passes/flowFieldPass.ts`, `flow/computes/flowCompute.ts`, `filaments/passes/filamentsPass.ts`, `galaxyCatalog/frame.ts`, `galaxyCatalog/present/produceFamousGalaxyLabels.ts`, `galaxyCatalog/render/pickUniformBytesOf.ts`, `galaxyCatalog/passes/galaxyPointSpritesPass.ts`, `zoneOfAvoidance/passes/zoneOfAvoidancePass.ts`, `zoneOfAvoidance/present/{deriveZoneOfAvoidanceLiveness,produceZoneOfAvoidanceLettering}.ts`.
- `src/services/engine/frame/`: `atmosphereDrawList.ts`, `atmosphereDrawListCache.ts`, `atmosphereShellUniforms.ts`, `bodyRowSlabs.ts`, `captureFaceAttachment.ts`, `cosmoLabelProjection.ts`, `drawableMeshBodies.ts`, `encodeAtmosphereSkyView.ts`, `milkyWayCloudLiveness.ts`, `near0LabelProjection.ts`, `pickProgram.ts`, `positionedVisibleStars.ts`, `runBloom.ts`, `runLabel3DProducers.ts`, `runMarkerProducers.ts`, `sceneBodyPartition.ts`, `sceneBodyStates.ts`, `sceneOccluderBodies.ts`, `sceneOccluderSpheres.ts`, `scheduleSkyCaptures.ts`, `scheduleProbeCapture.ts`, `scheduleCubemapCaptures.ts`, `skyCaptureBandAlpha.ts`, `slabs.ts`, `volumeLiveness.ts`.
- `src/services/engine/frame/passes/`: `bloomSrcTexelSize.ts`, `bodyGlintsPass.ts`, `cloudShellPass.ts`, `constellationsPass.ts`, `contactShadowsPass.ts`, `createUpsamplePass.ts`, `earthPass.ts`, `foregroundLabelsPass.ts`, `labelsPass.ts`, `markerLinesPass.ts`, `milkyWayAggregatePass.ts`, `near0SelectionRingPass.ts`, `orbitTrailsPass.ts`, `ringsPass.ts`, `scalarVolumePass.ts`, `selectionRingPass.ts`, `sgrAStarLensingPass.ts`, `skyCubemapBlitPass.ts`, `starAggregatesPass.ts`, `starPointsPass.ts`, `terrainPickMarkerPass.ts`.
- `src/services/engine/presentation/`: `focusRecession.ts`, `produceConstellationCaptions.ts`, `produceMilkyWayLabel.ts`, `produceSceneBodyCaptions.ts`, `produceStructureLabels.ts`, `produceStructureMarkers.ts`; `src/services/engine/subsystems/label2DDirector.ts`; `src/services/engine/wiring/assetWiring.ts`; `src/services/gpu/passes/compositor.ts`; `src/services/gpu/renderers/starCatalog/starCatalogRenderer.ts`; `src/utils/surfaceTiles/surfaceTilesEngaged.ts`.
- `tests/`: the ~75 files `rg -l "ReadyFrameContext" tests` names, plus any that build a context literal (`rg -n "isReady: true" tests`). Most are one-line fixture edits: a test's hand-built context becomes a `FrameView` with a `snapshot` object.

- [ ] Sweep frame-field reads with `rg -n '\b(ctx|view|viewCtx|main)\.(nowMs|simDays|renderTargets|visibleSourceMask|focusBlend|focus\b|layersSettling|cursorTexPx)' src tests` and prefix each with `.snapshot` — note `renderTargets` moves and `renderedTargets` does NOT. Densest: `executeFrame.ts` (8), `galaxyCatalog/frame.ts` (7), `assetWiring.ts` (5), `scheduleSkyCaptures.ts` (5).
- [ ] Rebuild every hand-built test context through a shared `tests/helpers/frame/` factory only where a file already has one; do NOT introduce a new universal fixture — a factory that grows a knob per call site is worse than the literals.
- [ ] No new test: a type sweep the compiler checks end to end.
- [ ] `npm run typecheck:fast` clean (first green typecheck since Task 1) and `npm test` full. Commit.

### Task 9: Re-point the dome plan, free the `FrameView` name, consume the backlog item

**Files:** `docs/superpowers/plans/2026-09-19-dome-fisheye.md` (modify), `tools/galaxy-renderer/src/engine/frame/deriveFrameView.ts:51,83` (modify), `src/@types/galaxy/FieldHeaderFrameLanes.ts:5` (modify — the comment citing it), `docs/BACKLOG.md` (modify), `docs/backlog/2026-08-23-frame-view-record.md` (delete), `docs/superpowers/specs/2026-09-19-view-rigs-dome-fisheye-design.md` (read-only cross-check)

- [ ] Rename the galaxy tool's own `FrameView` — the only other `FrameView` in the repo (`rg -n '\bFrameView\b' src tools` = exactly these two files) — to `FieldFrameLanes`, so the name means one thing repo-wide: `npm run refactor` rename (see `.claude/skills/refactor/SKILL.md`), never a hand-edited find-and-replace. Type only: `deriveFrameView.ts`'s filename and function keep their names, and `FieldHeaderFrameLanes.ts:5`'s "the tool's FrameView" citation becomes "the tool's `FieldFrameLanes`".
- [ ] Re-point the dome plan's names, nothing else — do **not** restructure it: `deriveViewContext(state, main, spec)` → `deriveView(snapshot, spec)`; `domeFaceViews(main: ReadyFrameContext, state)` → `domeFaceViews(canvas: FrameView, state): readonly FrameView[]`; `RenderFrameInput.views` → `RenderFrameInput` is `{ canvas, views }`; the `deriveViewContext.test.ts` fixture reference → `deriveView.test.ts`. Line 11's "assumes all of PR 1's contracts exist" list takes the new names (`FrameContextInput`, `FrameView`, `deriveView`, `mainViewSpec`/`faceViewSpec`, `{ canvas, views }`, `ViewSpec.kind`) and drops `ReadyFrameContext.output?`/`viewKind` (both now `FrameView`/`ViewSpec` fields).
- [ ] Delete the `docs/BACKLOG.md` index line starting `- [ ] **Unify `ReadyFrameContext`'s camera-derived fields into one `view` record**` and `git rm docs/backlog/2026-08-23-frame-view-record.md` — same change, per backlog hygiene.
- [ ] Cross-check the spec's **P6** paragraph against what landed; if a name drifted, fix the spec, don't fix the code to match the spec.
- [ ] Commit.

## Definition of Done

**Deliverables:** `FrameContextInput`, `FrameView`, the reshaped `ReadyFrameContext`, `ViewSpec.kind`, `deriveFrameContext(state, input)`, `deriveView(snapshot, spec)`, `mainViewSpec`, `faceViewSpec`, `src/data/rendering/cubeFaceBases.ts`, `cubemapCaptureFrame`, `RenderFrameInput` as `{ canvas, views }`, the tool's `FieldFrameLanes`; `deriveViewContext.ts` and `docs/backlog/2026-08-23-frame-view-record.md` gone.

**Leanness gate:** `frameContext.ts` + `deriveView.ts` together are **≤ 357 lines** (today's `frameContext.ts` 313 + `deriveViewContext.ts` 44), comments included. Report the number at landing; over it means the split added surface instead of removing branches.

**Smoke (dev server, mono):**

- Default view, Earth close-up (surface tiles streaming), Milky Way, galaxy field: pixel-identical to PR 1's HEAD by eye — no brightness, size, seam or label-placement change.
- Sgr A\* lensing still renders (it samples the sky capture): the lensed sky is correctly oriented, not rotated or mirrored — the capture-basis change in Task 5 is what would show here.
- A mesh body with a probe capture (rover on Mars) is lit as before: probe faces still use the host's axes.
- Pick still hits what the cursor is over (`pickFrameContext` now returns a view), and the terrain pick marker still lands under the cursor.

**Out of scope:** the `dome` rig and everything in PR 2's plan; migrating captures onto a rig (they keep `cubemapCaptureFrame`/`flipClipY`); touching the ~270 view-field read sites.
