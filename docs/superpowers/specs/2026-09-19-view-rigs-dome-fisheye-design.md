# View rigs + dome fisheye — design

**Status:** approved in brainstorm 2026-09-19 · **Deadline:** Wisdome Malmö presentation, Friday 2026-09-25
**Delivery:** two PRs — (1) view-rig prep, (2) dome fisheye feature on top.

## Goal

Render skymap as a 180° fulldome master for Wisdome Malmö, both as a live
in-app preview (`?dome`) and as a recorded film (`record-clip --dome`), by
teaching the frame to render **several views per frame** through one data
seam — the _view rig_ — that the dome uses now and a VR stereo rig can use
later without reshaping it.

## Delivery target (Wisdome spec, v4 2026)

- 4096×4096, square pixels, **equidistant azimuthal** 180° fisheye; black
  outside the circle.
- Centre = zenith; bottom edge (0°) = front of the dome; 180° = behind the
  audience. Natural horizon ≈ 30° up from the front edge.
- H.264 Main, CRF 20–25, 30 fps constant, yuv420p 8-bit, mp4 played directly.
  4096² is 65 536 macroblocks — above level 5.2's limit, so the encode
  declares **level 6.x**.
- Test content: `earthUniverseLoop` at 30 fps.

## Architecture (post-prep)

### View rig — the one seam

```ts
// @types/camera/ViewFrustum.d.ts — tangent (OpenXR "fov") form: every slab
// builds its own matrix from it with its own near/far, which one Mat4 cannot do
type ViewFrustum = { tanLeft: number; tanRight: number; tanDown: number; tanUp: number };

// @types/engine/frame/ViewSpec.d.ts
type ViewSpec = {
  rotation: Mat3; // view basis relative to the camera's image-plane basis
  eyeOffsetMpc: Vec3; // in the rotated view frame; zero for dome
  frustum: ViewFrustum; // symmetric 90° face, asymmetric XR eye
  sizePx: Size;
  slot: number; // view-slot uniform ring index
  output?: GPUTextureView; // where this view's `swap` resolves; absent = canvas
};

// @types/engine/frame/FrameSection.d.ts
type FrameSection = { scope: 'once' | 'perView'; steps: readonly FrameStepSpec[] };

// @types/engine/frame/ViewRig.d.ts
type ViewRig = {
  /** The rig's views off the frame's canvas view; mono returns `[canvas]`. */
  views: (canvas: FrameView, state: EngineState) => readonly FrameView[];
  program: readonly FrameSection[];
};
```

- `deriveView(snapshot, spec): FrameView` builds one view (vp, slabs,
  `drawPxPerRad`, `canvasSize`, body-frustum gate, star partition) from the
  frame's one camera pose **and arm** plus the spec, so a surface camera keeps
  its metre-native body path in every view (P6; was `deriveViewContext`).
  Sky/probe captures build their own frame on `cubemapFaceContext` — own eye,
  absolute or host axes and near plane — then six face views through the same
  `deriveView` (plan-time amendment 2026-09-19, reshaped by P6).
- The three perspective sites (`computeViewProj`, `computeForegroundViewProj`,
  `deriveSlabs`) build from a `ViewFrustum` instead of fov/aspect; `pxPerRad =
height / (tanUp − tanDown)`. The camera's own `CameraProjection` stays the
  _framing_ input (clip foci, focus distance) — a view's projection never
  feeds the camera path, so every view of a frame shares one deterministic
  pose.
- `FRAME_ORDER` becomes named sections: `PRELUDE` (compute + captures,
  once), `SCENE` (offscreens → hdr rows → `foreground:0` chain → composite →
  orbit trails, per view), `POST` (bloom, tonemap), `OVERLAYS` (selection
  ring, marker lines, labels, NEAR0 overlays). A rig's `program` lists which
  sections run and with what scope.
- `renderFrame` walks the rig's program: a `once` section runs against the
  main context; a `perView` section runs once per `ViewSpec`, each with its
  own derived context, **own encoder and own submit** (single-buffer body
  uniforms, `docs/RENDERER.md` #1). The program is expanded per view context
  (`foregroundChainOrder(viewCtx.slabs)`, `bodyRowSlabs(state, viewCtx)`), not
  once from the main context.
- Rigs are data in `src/data/rendering/viewRigs.ts`:

```ts
VIEW_RIGS = {
  mono: { views: (canvas) => [canvas], program: [PRELUDE, SCENE, POST, OVERLAYS] },
  dome: { views: domeFaceSpecs, program: [PRELUDE, SCENE_TO_DOME_CUBE, DOME_RESAMPLE, POST] },
  // vr (later): { views: xrEyeSpecs, program: [PRELUDE, { ...SCENE+POST+OVERLAYS, scope: 'perView' }] }
};
```

The active rig is engine state (`state.viewRig`), seeded at boot from the
URL (`?dome` → `dome`, else `mono`).

### Frame planning over the rig's views

View-dependent CPU planners run **once per frame over the union of the rig's
frusta**, and every view draws that one result:

- `cutSurfaceTiles` takes `viewProjsLocal: readonly Float64Array[]`; a patch
  survives if any frustum keeps it. One cut, one fetch queue, one residency.
- The star octree cut is prepared once per frame from the rig's frusta,
  carries its own `originMpc` (draws rebase about it, never about
  `view.camPos`), and advances fades once.
- Captures keep their own per-face cut with no fades. The discriminant is
  explicit: `FrameView.viewKind: 'frame' | 'capture'`, replacing
  the `viewSlot !== 0` tests in `starCatalogPass` and `starAggregatesPass`.

### Photometry

`toRefPx` normalises a glow radius by `pxPerRad`, not viewport height, so
star brightness per solid angle holds at any fov (identical at the app's 60°;
correct on a 90° face and an XR eye).

### Dome rig (feature PR)

- **Canvas and targets:** the canvas is square N×N (4096 in the recorder;
  the preview fits the window). The existing size table sizes `hdr`, the
  half-res offscreens and bloom to N² unchanged.
- **Faces:** five 90° views, N² each — front, left, right, back, top. The
  bottom face never reaches the hemisphere. Faces align to the **dome frame**:
  zenith = camera forward pitched up by `tiltDeg` (default 60, in
  `src/data/rendering/domeParams.ts`), so the look direction lands 30° up at
  the front edge. Face views take view slots after the capture rows'
  (`VIEW_SLOT_COUNT` grows by 5).
- **Per face:** `SCENE` into `hdr`, then a copy step `hdr → dome-cube[face]`
  (new render-target row: 2d-array, 5 layers, N², `allocateWhen` dome rig).
- **Resample:** `domeResamplePass` writes the equidistant fisheye into `hdr`
  from `dome-cube` (pixel → polar (r, φ) → direction in dome frame → face +
  uv), black outside r = 1. A TS twin of the pixel→face mapping is the
  testable contract.
- **Post once** on the fisheye: bloom and tonemap are camera-independent, so
  no face seams from post.
- **Off in dome:** `OVERLAYS` (screen-aligned, camera-planned), the terrain
  pick marker and picking (cursor maps to no single view).
- **Preview:** `?dome` squares the canvas via CSS (`min(100vw, 100vh)`); the
  React shell stays usable. Orbit input drives the frame camera as usual.
- **Recorder:** `record-clip --dome` → `--size 4096x4096 --dpr 1`, loads
  `?cinema&dome`, encodes with the Wisdome args (libx264, `-profile:v main
-level 6.1 -crf 20 -pix_fmt yuv420p -r 30`).

## Ground preparation

Ran `refactor-ground` 2026-09-19; greenfield cross-check by a fresh agent
agreed on scoped sections, once-per-frame union planning and per-view cache
keys.

| Touchpoint                                         | Verdict                                | Blocker                                                                                                                                                            |
| -------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scene section per view                             | bolt-on                                | `renderFrame.ts:52-90` expands one program from the main ctx; capture steps can't express offscreens or the `foreground:0` composite (`expandFrameOrder.ts:57-82`) |
| Arbitrary per-view projection (VR)                 | bolt-on                                | `deriveFrameContext` takes fov/aspect (`frameContext.ts:74-95`); `cubemapFaceContext` is a capture-only derivation                                                 |
| Union surface cut                                  | bolt-on                                | one `viewProjLocal` (`runFrame.ts:267-270`), cut stored globally                                                                                                   |
| Shared star cut + fades                            | bolt-on                                | ctx-keyed walk (`starCatalogPass.ts:657`), fades main-ctx only (`runFrame.ts:312`), origin not carried                                                             |
| Capture vs frame view                              | bolt-on (2nd case on one discriminant) | `viewSlot !== 0` at `starCatalogPass.ts:825`, `starAggregatesPass.ts:58`                                                                                           |
| Photometry at 90°                                  | bolt-on                                | `toRefPx` by viewport height (`starPhotometry.wesl:136`)                                                                                                           |
| Rig row, cube target, resample pass, recorder flag | growth                                 | seams exist after prep                                                                                                                                             |

**Prep (PR 1, each its own commit, mono renders byte-identical):**

- **P1** `FrameSection` + `ViewRig` + `VIEW_RIGS.mono`; `renderFrame` walks the
  rig. Test: the mono program expands to today's step list.
- **P2** `ViewFrustum` + `ViewSpec` + `deriveViewContext`;
  perspective sites build from a `ViewFrustum`; captures stay on
  `ViewSpec` builders; `ViewSpec.output` resolves `swap`.
- **P3** Planning over the rig's frusta: `cutSurfaceTiles` over N
  view-projections; star cut prepared once per frame with `originMpc` and
  fades once. Consumes backlog _star-cut-origin-carrying_.
- **P4** `ReadyFrameContext.viewKind` replaces `viewSlot !== 0`.
- **P5** Photometry by `pxPerRad` (WGSL only; a TS twin would only restate the formula).

- **P6** (added 2026-09-20 after P1–P5 landed) Frame / view split — the
  greenfield shape P2 had deferred. `deriveFrameContext(state, input: FrameContextInput)`
  derives the frame (orbit camera, arm, body states, un-turned pose provider,
  clock, targets, the one `renderedTargets` set, `runFrame`'s stamps);
  `deriveView(snapshot, spec: ViewSpec)` derives one `FrameView` (turned `cam`,
  `vp`, `slabs`, turned `bodyPose`, `canvasSize`, `drawCamPos`, `drawPxPerRad`,
  `fovYRad`, `viewSlot`, `viewKind`, `output?`, its own `renderedTargets`)
  holding the frame context by reference as `snapshot` (not `frame`: that
  word is a rung tag and a coordinate frame elsewhere). `mainViewSpec` is
  the canvas view; a capture derives its frame once and six face views.
  `RenderFrameInput` is `{ canvas, views }` — the frame's own swap-chain
  view for `once` sections, the rig's views for `perView`. Passes take a
  `FrameView`; frame fields read `ctx.snapshot.x`.
  Plan: `docs/superpowers/plans/2026-09-20-frame-view-split.md`.

**Reversed 2026-09-20:** P2 kept one `ReadyFrameContext` per view to avoid
renaming every `ctx.vp`/`slabs`/`drawCamPos` reader. Executed, that shape cost
an optional `view?` parameter with five `view === undefined` branches, a
re-pack round trip in `deriveViewContext`, captures re-deriving the frame six
times and a per-view `renderedTargets` fold in `renderFrame` — P6 pays the
rename instead (view fields keep `ctx.x`; only frame fields move). Backlog
_frame-view-record_ is consumed by it.

## Risks and eye-checks

- **Pixel floors:** galaxy dot and star glow minimums are in face pixels;
  after the warp a floor-sized dot at a face edge spans ~½ the angle it does
  at face centre. Accepted for v1 (1.6× oversampling at 4096); eye-check the
  first stills. Angular floors → backlog.
- **Earth close-up in faces:** the union surface cut is the load-bearing
  part for the clip's opening; eye-check face seams over Earth.
- **Cost:** ~5× a flat 4K frame's pixels per frame; offline only at 4096.
- **Test file** to Wisdome as early as possible (wisdome-teknik.kf@malmo.se).
- **Fallback** for Friday regardless: laptop HDMI on the podium, flat view.

## Testing

- Mono unchanged: expanded mono program equals today's step list; a pinned
  `deriveFrameContext` output for a fixed pose matches before/after P2.
- `deriveViewContext`: five dome specs → five distinct vps through the real
  derivation; an asymmetric `clipFromView` survives into `ctx.vp`.
- Union cut: a patch visible only to face 3 is in the cut.
- Star cut: prepared at origin A, drawn with a view at B → rebases about A.
- Fisheye twin: centre → zenith; the camera's forward lands at 30° elevation
  on the front meridian (r = 2/3 below centre at tilt 60); r > 1 → none;
  each face reached; continuity across face edges.
- Photometry (eye-check): identical at 60°; per-solid-angle constant across fov.
