# View rigs prep — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use `- [ ]` checkboxes.

**Goal:** Let one frame render several views through a data seam (the view rig), with mono rendering unchanged, so the dome fisheye (next PR) and a later VR rig land as rows.

**Architecture:** `FRAME_ORDER` splits into scoped sections; a `ViewRig` row names the frame's views and which sections run once vs per view. A view is a full `ReadyFrameContext` derived from the frame's one camera pose plus a rotation, eye offset and tangent-form frustum. View-dependent planners (surface cut, star cut) run once per frame over all views' frusta.

**Tech stack:** TypeScript, WebGPU, WGSL/WESL, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-view-rigs-dome-fisheye-design.md` — sections "Architecture (post-prep)" and "Ground preparation". This plan is PR 1 (prep) only.

## Global constraints

- Mono (`VIEW_RIGS.mono`) renders **byte-identical** to today: same step list, same matrices, same star brightness at the default 60° fov.
- A view's frustum never feeds the camera path; clip framing keeps reading `CameraProjection`.
- Each per-view section run gets its **own command encoder and submit** (`docs/RENDERER.md` "writeBuffer race").
- `type` aliases only; one type per `@types/` file; one function per `utils/` file; frame files declare only their own symbol (`tests/services/engine/frame/frameFilePurity.test.ts`).
- File moves via `npm run move-files -- <from> <to>`, never `git mv`.
- Comments: why, not what; module header ≤ 5 lines (`docs/superpowers/conventions/comments.md`).

---

### Task 1: Scoped frame sections

**Files:** `src/@types/engine/frame/FrameSection.d.ts` (create), `src/services/engine/frame/frameOrder.ts` (modify), `src/services/engine/frame/expandFrameOrder.ts` (modify), `src/services/engine/frame/checkFrameOrder.ts` (modify if it walks `FRAME_ORDER`), `src/services/engine/frame/timing/timedSlots.ts` or wherever slots derive from `FRAME_ORDER` (modify), `tests/services/engine/frame/expandFrameOrder.test.ts` (modify)

**Contract:**

```ts
export type FrameSection = {
  readonly scope: 'once' | 'perView';
  readonly steps: readonly FrameStepSpec[];
};
```

`frameOrder.ts` exports the four sections in today's line order, and `FRAME_ORDER` stays exported as their concatenation (existing readers stay valid):

| Section    | Scope     | Lines (today's `frameOrder.ts`)                                 |
| ---------- | --------- | --------------------------------------------------------------- |
| `PRELUDE`  | `once`    | compute `flow`, `sky-view`; the `sky` and `probe` capture lines |
| `SCENE`    | `perView` | `volume` … `foreground:0` chain, composite, `orbit-trails`      |
| `POST`     | `once`    | `bloom`, `tonemap`                                              |
| `OVERLAYS` | `once`    | COSMO and NEAR0 swap overlays                                   |

If `frameOrder.ts` would then export more than its one symbol, the sections live in `src/data/rendering/frameSections.ts` instead and `frameOrder.ts` concatenates them (frame-file purity).

- [x] Test `the four sections concatenate to FRAME_ORDER in order`: assert deep equality of `[...PRELUDE.steps, ...SCENE.steps, ...POST.steps, ...OVERLAYS.steps]` with `FRAME_ORDER` — the guard that the split moved no line.
- [x] Split; no behaviour change. `npm test -- frameOrder expandFrameOrder checkFrameOrder` green.
- [x] Commit.

### Task 2: View rig row + `renderFrame` walks it

**review: yes** (frame orchestration, submit ordering)

**Files:** `src/@types/engine/frame/ViewRig.d.ts`, `src/@types/engine/frame/ViewRigKey.d.ts` (create), `src/data/rendering/viewRigs.ts` (create), `src/@types/engine/state/EngineState.d.ts` (modify — `viewRig`), the engine-state initialiser that builds `EngineState` (modify — seed `'mono'`), `src/@types/engine/frame/RenderFrameInput.d.ts` (modify), `src/services/engine/frame/renderFrame.ts` (modify), `src/services/engine/frame/runFrame.ts` (modify), `tests/services/engine/frame/renderFrame.test.ts` (modify)

**Contract:**

```ts
export type ViewRigKey = 'mono'; // 'dome' arrives in PR 2
export type ViewRig = {
  /** The frame's views, derived from the main context; mono returns [main] itself. */
  readonly views: (main: ReadyFrameContext, state: EngineState) => readonly ReadyFrameContext[];
  readonly program: readonly FrameSection[];
};
// src/data/rendering/viewRigs.ts
export const VIEW_RIGS: Readonly<Record<ViewRigKey, ViewRig>>; // mono: views m => [m], program [PRELUDE, SCENE, POST, OVERLAYS]
// RenderFrameInput gains:
readonly views: readonly ReadyFrameContext[]; // runFrame computes once, before the planners (Task 5 reads it)
```

**Behaviour of `renderFrame`:**

- `once` sections run against the main `ctx`; `perView` sections run once per view context, each expanded **from that view's context** (`foregroundChainOrder(view.slabs)`, `bodyRowSlabs(state, view)`), each with its own encoder and submit.
- Captures stay as today (they are `PRELUDE` lines, expanded once from the main ctx).
- `swap` resolves to `view.output ?? context.getCurrentTexture()` — `output?: GPUTextureView` is a new optional `ReadyFrameContext` field, unset for mono.
- **First-touch across views:** each view keeps its own `renderedTargets` (so a second view clears `hdr` rather than loading the first view's pixels); after a `perView` section, the main ctx's set gains the union, so a following `once` section sees those targets as rendered. With mono (`views = [main]`) both are the same set — no change.
- The timing window still spans every submit of the frame.

- [x] Test `mono rig submits the same step list as FRAME_ORDER`: with a stub device, record the expanded steps across submits; equal to today's single-program expansion (reuse the existing `renderFrame.test.ts` harness).
- [x] Test `a perView section with two views submits twice, each expanded from its own view`: two stub view contexts with different `slabs` lengths → two submits, foreground step counts differ accordingly.
- [x] Test `a once section after a perView section sees targets the views rendered`.
- [x] Implement; `runFrame` computes `views = VIEW_RIGS[state.viewRig].views(ctx, state)`.
- [x] Commit.

### Task 3: Tangent-form view frustum

**review: yes** (projection maths)

**Files:** `src/@types/camera/ViewFrustum.d.ts` (create), `src/utils/camera/symmetricFrustum.ts` (create), `src/utils/camera/frustumPerspective.ts` (create — f32 `Mat4`), `src/utils/camera/frustumPerspectiveF64.ts` (create — f64, both depth conventions), `src/utils/camera/computeViewProj.ts:115`, `src/utils/camera/computeForegroundViewProj.ts:145-146`, `src/services/engine/frame/slabs.ts:141-142,202-203,284-285,323-324` (modify), tests mirroring each new util

**Contract:**

```ts
/** Frustum edges as tangents of the half-angles from the view axis (OpenXR "fov" form). */
export type ViewFrustum = {
  readonly tanLeft: number; // ≤ 0 for a centred view
  readonly tanRight: number;
  readonly tanDown: number; // ≤ 0 for a centred view
  readonly tanUp: number;
};
symmetricFrustum(fovYRad: number, aspect: number): ViewFrustum
frustumPerspective(f: ViewFrustum, near: number, far: number): Mat4            // [0,1] depth, as mat4.perspective
frustumPerspectiveF64(f: ViewFrustum, near: number, far: number | null, reverseZ: boolean): Mat4d
```

`OrbitCamera`/`deriveSlabs` carry a `frustum: ViewFrustum` in place of the `fovYRad`/`aspect` pair at the three perspective sites. `CameraProjection` (framing input) is unchanged; the camera's frustum is `symmetricFrustum(projection.fovYRad, projection.aspect)`.

- [x] Test `symmetric frustum reproduces mat4.perspective exactly` (f32 and f64, a spread of fov/aspect/near/far): element-wise `toBe`, not `toBeCloseTo` — byte-identical mono is the requirement; if the formula differs in rounding, match `wgpu-matrix`'s term order.
- [x] Test `symmetric frustum reproduces perspectiveReverseZ exactly`.
- [x] Test `asymmetric frustum maps its edges to clip ±1`: project the four edge directions at depth 1, assert NDC x/y = ±1.
- [x] Swap the three sites; existing `slabs.test.ts`, `frameContext.test.ts` green unchanged.
- [x] Commit.

### Task 4: `deriveViewContext` + `viewKind`

**review: yes** (camera/pose maths)

**Files:** `src/@types/engine/frame/ViewSpec.d.ts`, `src/@types/engine/frame/ViewKind.d.ts` (create), `src/@types/engine/frame/ReadyFrameContext.d.ts` (modify — `viewKind`, `output?`), `src/services/engine/frame/frameContext.ts` (modify), `src/services/engine/frame/deriveViewContext.ts` (create), `src/services/engine/frame/cubemapFaceContext.ts` (modify — stamps `viewKind: 'capture'`), `src/services/engine/frame/passes/starCatalogPass.ts:825`, `src/services/engine/frame/passes/starAggregatesPass.ts:58` (modify), `src/utils/gpu/createViewSlotUniformRing.ts:18` (only if a slot is needed — not in this PR), `tests/services/engine/frame/deriveViewContext.test.ts` (create)

**Contract:**

```ts
export type ViewKind = 'frame' | 'capture';
export type ViewSpec = {
  readonly rotation: Mat3; // view basis relative to the camera's image-plane basis (right, up, forward columns)
  readonly eyeOffsetMpc: Vec3; // in the rotated view frame
  readonly frustum: ViewFrustum;
  readonly sizePx: { width: number; height: number };
  readonly slot: number;
  readonly output?: GPUTextureView;
};
export function deriveViewContext(
  state: EngineState,
  main: ReadyFrameContext,
  spec: ViewSpec,
): ReadyFrameContext | null;
```

- `deriveFrameContext` gains a trailing `view?: ViewSpec`; absent = today's view (identity rotation, zero offset, the camera frustum, canvas size, slot 0). The **same pose and arm** drive every view, so a body-arm (surface) camera keeps its metre-native path in every view — unlike `cubemapFaceContext`'s synthetic absolute pose.
- The rotation and offset apply at every view-matrix derivation: cosmo `vp`, `deriveSlabs` (NEAR0 + body rows), `bodyPose`'s `camBasisWorld`, and the slab gate's forward/fov. `drawPxPerRad = sizePx.height / (tanUp − tanDown)`; `fovYRad = atan(tanUp) − atan(tanDown)`.
- `viewKind` is `'frame'` for the main and rig views, `'capture'` from `cubemapFaceContext`. The two `viewSlot !== 0` tests become `viewKind === 'capture'`.
- Captures stay on `cubemapFaceContext` (own eye, absolute or host axes, own near plane — not camera-relative); migrating them onto `ViewSpec` is out of scope (spec amended).

- [x] Test `identity view spec derives the same context as no spec`: `vp` and every slab `vp` element-wise equal.
- [x] Test `a 90° yaw rotation turns the view's forward to the camera's right`: decode forward from `vp`, compare to the main ctx's right.
- [x] Test `five dome-like specs derive five distinct vps from one pose` (rotations only; no dome code — five 90° rotations built in the test).
- [x] Test `an asymmetric frustum survives into ctx.vp and drawPxPerRad`.
- [x] Test `an eye offset moves drawCamPos by the rotated offset and leaves the pose untouched`.
- [x] Test `a body-arm camera keeps its body-arm slab path under a rotated view` (reuse `frameContext.meshBodyHost.test.ts` fixtures).
- [x] Commit.

### Task 5: Planning over the rig's frusta

**review: yes** (frustum culling, fade state)

**Files:** `src/utils/surfaceTiles/cutSurfaceTiles.ts` (modify), `src/services/engine/frame/runFrame.ts:243-282,312` (modify), `src/services/engine/frame/passes/starCatalogPass.ts:647-691,773-829,866-874,956-962` (modify), `src/@types/…/PreparedStarCut` (modify — `originMpc`), `tests/utils/surfaceTiles/cutSurfaceTiles.test.ts`, `tests/services/engine/frame/passes/starCatalogPass*.test.ts` (modify), `docs/BACKLOG.md` + `docs/backlog/2026-08-23-star-cut-origin-carrying.md` (delete the line and the file)

**Contract:**

```ts
cutSurfaceTiles({ ..., viewProjsLocal: readonly Float64Array[] /* was viewProjLocal */ })
// keep a node iff ANY frustum keeps it; screen-density refine uses the finest view (max over views)
PreparedStarCut = { ...; readonly originMpc: Readonly<Vec3> }
```

- `runFrame` plans the surface cut from every view's body-local vp (mono: one), stored once as today.
- The star cut is prepared **once per frame from the frame's views** (not memoised per ctx): frustum = union over `views`, origin = the main ctx's `drawCamPos`, recorded as `originMpc`. `drawStream`/`drawPick` rebase about `prep.originMpc`, never `view.camPos`. Fades advance once per frame (`runFrame.ts:312`), and every `'frame'` view draws with those fade opacities. Captures keep their per-face cut, full opacity, no fades.

- [x] Test `cutSurfaceTiles keeps a patch only the second frustum sees` and `one frustum gives today's cut` (existing cases pass with `[vp]`).
- [x] Test `a star cut prepared at origin A and drawn with a view at B rebases about A` (the backlog item's regression test).
- [x] Test `a star node visible only in the second view is in the frame's cut`.
- [x] Test `two frame views in one frame advance fades once`.
- [x] Delete the backlog index line and detail file for _star-cut-origin-carrying_.
- [x] Commit.

### Task 6: Star photometry per solid angle at any fov

**review: yes** (WGSL, uniform contract)

**Files:** `src/services/gpu/shaders/lib/starPhotometry.wesl:122-138`, `src/services/gpu/shaders/starCatalog/vertex.wesl:371`, `src/services/gpu/shaders/bodies/starPoints/vertex.wesl:108`, the two renderers' camera-uniform writers if `pxPerRad` is not already in `u.cam` (modify), `src/services/engine/frame/passes/starAggregatesPass.ts:51` (comment)

**Contract:** `fn toRefPx(rPx: f32, pxPerRad: f32) -> f32 { return rPx * (REF_PX_PER_RAD / pxPerRad); }` with `REF_PX_PER_RAD = 1080 / (2·tan(30°)) ≈ 935.307` — the reference height at the default 60° fov (`DEFAULT_FOV_DEG`, `src/data/defaults.ts:518`), so mono at 60° is unchanged. If `pxPerRad` must be added to a camera uniform struct, give the byte-offset table for the new field in the commit message and keep TS writer and WGSL struct in the same commit.

- [x] No new test (no TS twin exists, and one would only restate the formula); verify by eye: mono star field unchanged at default fov; `npm run typecheck:fast` and the WESL link tests green.
- [x] Commit.

## Definition of Done

**Deliverables:** `FrameSection`, `ViewRig`/`ViewRigKey`, `VIEW_RIGS.mono`, `ViewFrustum` + `symmetricFrustum`/`frustumPerspective`/`frustumPerspectiveF64`, `ViewSpec`, `ViewKind`, `deriveViewContext`, `ReadyFrameContext.viewKind`/`output`, `cutSurfaceTiles` over `viewProjsLocal`, `PreparedStarCut.originMpc`, `toRefPx` by `pxPerRad`.

**Smoke (dev server, mono):**

- Default view, Earth close-up, Milky Way, galaxy field: pixel-identical to main by eye (no brightness, size or seam change).
- Star field brightness unchanged at the default fov; LOD crossfades still fade (no popping) while zooming through the star catalog.
- Sgr A\* lensing and the solar-system sky capture still render (captures untouched).
- Earth surface tiles stream as before on descent.

**Out of scope (PR 2 / later):** the `dome` rig, dome faces, `dome-cube` target, fisheye resample, `?dome`, recorder `--dome`; migrating captures onto `ViewSpec`; the frame-pose / view-context split (backlog _frame-view-record_); angular point-size floors.
