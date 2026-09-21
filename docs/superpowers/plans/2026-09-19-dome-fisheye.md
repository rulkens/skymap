# Dome fisheye — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use `- [ ]` checkboxes.

**Goal:** Render skymap as a 4096² equidistant 180° fulldome master for Wisdome Malmö (Friday 2026-09-25): a live `?dome` preview and a `record-clip --dome` film.

**Architecture:** A `dome` row in `VIEW_RIGS`. It has five 90° face views (front, left, right, back, top), each rendering `SCENE` into `hdr` and then copying `hdr` into one layer of a 5-layer `dome-cube` target. A `once` pass resamples the cube into an equidistant fisheye in `hdr`, and `POST` (bloom, tonemap) runs once on the fisheye. Overlays, picking and the terrain pick marker are off.

**Tech stack:** TypeScript, WebGPU, WGSL/WESL, Vitest, Playwright + ffmpeg (recorder).

**Spec:** `docs/superpowers/specs/2026-09-19-view-rigs-dome-fisheye-design.md`, sections "Dome rig (feature PR)", "Testing" (fisheye twin) and "Risks and eye-checks". **Builds on:** PR 1, `docs/superpowers/plans/2026-09-19-view-rigs-prep.md`. This plan assumes all of PR 1's contracts exist: `FrameSection`, `PRELUDE/SCENE/POST/OVERLAYS` (in `src/data/rendering/frameSections.ts`), `ViewRig`/`ViewRigKey`, `VIEW_RIGS.mono`, `state.viewRig`, `FrameContextInput`, `FrameView`, `deriveView`, `mainViewSpec`/`faceViewSpec`, `{ canvas, views }`, `ViewFrustum` + `symmetricFrustum`, `ViewSpec`, `ViewSpec.kind`, `cutSurfaceTiles` over `viewProjsLocal`, `PreparedStarCut.originMpc` and `toRefPx` by `pxPerRad`.

## Global constraints

- **Mono stays unchanged:** without `?dome`, the step list, overlays, picking and terrain pick marker all behave exactly as on PR 1's HEAD.
- **Each face view has its own encoder and submit** (PR 1). Two parts of this plan depend on that and nothing else: the compositor's uniform buffer, which is shared per `(blend, format)` key, and every per-view-slot uniform.
- **Conventions:** `type` aliases only. One function per `utils/` file and one type per `@types/` file. Frame files (`src/services/engine/frame/**`) export only their own symbol, and constants go to `src/data/` (`tests/services/engine/frame/frameFilePurity.test.ts`).
- **WESL:** load the `wesl-shaders` skill before editing any `.wesl` file. Shader comments must not contain backticks, and each shader declares its own `@vertex fn vs` that calls `fullscreenVertex`.
- **Line citations** are as of `db19821bc` (PR 1, Task 1). PR 1 is still moving some of these files, so look up the named symbol if a line has shifted.
- **Tasks that can start before PR 1 lands:** Task 1 (dome maths) and Task 6 (recorder).

## Dome frame (the contract every task shares)

**Camera coordinates** are the frame `ViewSpec.rotation` is expressed in: +x = right, +y = up, +z = forward. A rotation's columns are the view's (right, up, forward) in those coordinates.

**Dome coordinates:** +x = right, +y = zenith, +z = front. This triad is right-handed in the same sense as the camera's, so right = zenith × front.

**Dome basis** (camera-from-dome), with τ = `tiltDeg` = 60. Its columns are the dome axes in camera coordinates:

| dome axis | camera coords      | at τ = 60        |
| --------- | ------------------ | ---------------- |
| right     | (1, 0, 0)          | (1, 0, 0)        |
| zenith    | (0, sin τ, cos τ)  | (0, 0.866, 0.5)  |
| front     | (0, −cos τ, sin τ) | (0, −0.5, 0.866) |

So the zenith is the camera forward pitched up by τ. The camera forward sits at dome coordinates (0, cos τ, sin τ): 30° elevation on the front meridian.

**Faces:** layer order is fixed. The columns are (right, up, forward) in dome coordinates. Each face's camera-relative rotation is `domeBasis · DOME_FACES[i]`.

| layer | face  | right | up  | forward |
| ----- | ----- | ----- | --- | ------- |
| 0     | front | +x    | +y  | +z      |
| 1     | left  | +z    | +y  | −x      |
| 2     | right | −z    | +y  | +x      |
| 3     | back  | −x    | +y  | −z      |
| 4     | top   | +x    | −z  | +y      |

There is no bottom face: for θ ≤ 90° the bottom face never wins the argmax below.

**Pixel → NDC.** For an N×N image, pixel (px, py) maps to x = 2(px + 0.5)/N − 1 and y = 1 − 2(py + 0.5)/N, with y up. This matches `fullscreenVertex`'s `uv` (`src/services/gpu/shaders/lib/fullscreenTri.wesl`).

**Equidistant fisheye.** r = √(x² + y²), and r > 1 → none (black). θ = r·π/2 is the angle from the zenith. The image is a zenith-pointing camera with the front at the bottom edge, so image-right = dome right and image-up = back (−z). That gives d = (sin θ · x/r, cos θ, −sin θ · y/r), with r = 0 → (0, 1, 0). Consequences: the bottom edge (0, −1) is the front horizon, and the camera forward lands at (0, −2/3), i.e. r = 2/3 below the centre.

**Direction → face + uv:** face = argmax over layers of d·forwardᵢ (ties go to the lower layer). Then s = d·rightᵢ / d·forwardᵢ, t = d·upᵢ / d·forwardᵢ, u = (s + 1)/2 and v = (1 − t)/2. uv has a top-left origin, which is how a normal (un-flipped) WebGPU render lays out a face. Dome faces must **not** apply `cubemapFaceContext`'s `flipClipY` (`cubemapFaceContext.ts:63-68`), because that flip exists only for the `texture_cube` convention.

---

### Task 1: Dome maths and its TS twin

**review: yes** (camera maths; the WGSL port in Task 3 copies this)

**Files:** `src/data/rendering/domeParams.ts` (create), `src/data/rendering/domeFaces.ts` (create), `src/utils/dome/domeBasis.ts`, `src/utils/dome/domeFaceRotations.ts`, `src/utils/dome/fisheyeDirection.ts`, `src/utils/dome/domeFaceUv.ts` (create), `tests/utils/dome/fisheye.test.ts` (create)

**Contract:**

```ts
// src/data/rendering/domeParams.ts
export const DOME_PARAMS = {
  tiltDeg: 60, // zenith = camera forward pitched up by this
  viewSlotBase: 19, // five face slots 19…23, after the capture rows' 1…18
} as const;
// src/data/rendering/domeFaces.ts — the face table above, column-major Mat3 per layer
export const DOME_FACE_COUNT = 5;
export const DOME_FACES: readonly Mat3[];
domeBasis(tiltDeg: number): Mat3                     // camera-from-dome, table above
domeFaceRotations(tiltDeg: number): readonly Mat3[]  // domeBasis · DOME_FACES[i] → ViewSpec.rotation
fisheyeDirection(ndcX: number, ndcY: number): Vec3 | null  // dome coords; null for r > 1 (r = 1 inclusive)
domeFaceUv(dir: Readonly<Vec3>): { readonly face: number; readonly u: number; readonly v: number }
```

Build with `mat3FromColumns` / `multiply3x3` (`src/utils/math/`).

- [ ] Test `every DOME_FACES basis is orthonormal and right-handed (right = up × forward)`, and the same for `domeFaceRotations(60)`. A sign typo in the table would otherwise show up only as a mirrored face at the venue.
- [ ] Test `centre maps to the zenith on the top face`: `fisheyeDirection(0, 0)` ≈ (0, 1, 0), and `domeFaceUv` gives face 4 with u = v = 0.5.
- [ ] Test `the camera forward lands at 30° elevation on the front meridian`: take `domeBasis(60)`ᵀ·(0, 0, 1) and assert that it is ≈ `fisheyeDirection(0, −2/3)` (12 digits). `domeFaceUv` of it is face 0, u = 0.5, v = (1 − tan 30°)/2.
- [ ] Test `edges: bottom = front horizon, top = back, right = right`: (0, −1) → (0, 0, 1), (0, 1) → (0, 0, −1) and (1, 0) → (1, 0, 0).
- [ ] Test `outside the unit circle is none`: (0.8, 0.8) → null, while (1, 0) is not null.
- [ ] Test `every face is reached`: a 64² NDC grid over the disc hits faces {0, 1, 2, 3, 4}, and nothing else.
- [ ] Test `continuous across face edges`: sample directions densely on each of the eight edges (four side–side edges at 45° azimuth, four side–top edges at 45° elevation), stepping ±1e-6 across each edge. For every sample, the chosen face contains it (|s|, |t| ≤ 1 + 1e-9), and normalize(rightᵢ·s + upᵢ·t + forwardᵢ) ≈ d. Both sides therefore converge on the same direction.
- [ ] Commit.

### Task 2: `dome-cube` target, face view slots, copy step

**review: yes** (executor, compositor uniform-per-key landmine)

**Files:** `src/@types/engine/frame/RenderTargetSpec.d.ts`, `src/services/gpu/renderTargets.ts`, `src/utils/gpu/createViewSlotUniformRing.ts:14-18`, `src/@types/engine/frame/CopyStepSpec.d.ts` (create), `src/@types/engine/frame/FrameStepSpec.d.ts`, `src/@types/engine/frame/FrameStep.d.ts`, `src/services/engine/frame/expandFrameOrder.ts` (`EXPAND_STEP`), `src/services/engine/frame/checkFrameOrder.ts` (`STEP_FACTS`), `src/services/engine/frame/executeFrame.ts` (the step switch), `tests/services/gpu/renderTargets.test.ts`, `tests/data/rendering/cubemapCaptures.test.ts`, `tests/services/engine/frame/executeFrame.test.ts`

**Layered rows:** `layers` moves out of `fixedSizePx` into its own optional field (absent means 1), so a canvas-sized row can have array layers (see Open points #1).

```ts
// RenderTargetSpec
layers?: number;                        // 2d-array layer count; one '2d' layer view each when > 1; a 'cube' view when 6
fixedSizePx?: { readonly size: number | ((state: EngineState) => number) };  // `layers` removed
```

The two sky rows (`renderTargets.ts:288,303`) move `layers: 6` up one level. Every current `spec.fixedSizePx?.layers` read (`renderTargets.ts:366,377,388,409`) becomes `spec.layers`. The new row goes before `swap`:

```ts
{ id: 'dome-cube', format: HDR_TARGET_FORMAT, depth: null, scale: 1, layers: DOME_FACE_COUNT,
  clearValue: { r: 0, g: 0, b: 0, a: 1 }, allocateWhen: (state) => state.viewRig === 'dome' }
```

The row is canvas-sized (N²) and costs 5 × N² × 8 B, which is 671 MB at 4096. That is why it is allocated only under the dome rig.

**View slots:** `VIEW_SLOT_COUNT` goes from 19 to 24. Its doc comment names the dome range (`DOME_PARAMS.viewSlotBase` … +4).

**Copy step:**

```ts
export type CopyStepSpec = { readonly kind: 'copy'; readonly source: string }; // "source into this view's output"
// FrameStepSpec |= CopyStepSpec;  FrameStep |= { kind: 'copy'; source: string }
```

- `EXPAND_STEP.copy` maps each copy spec to exactly one step. `STEP_FACTS.copy` gives `{ targets: [source] }`.
- `executeFrame`, `case 'copy'`:
  - If `touched` does not have `source`, skip the step, as a composite does.
  - If `ctx.output` is undefined, throw: a copy writes the view's output and has no other destination.
  - Otherwise open one pass whose colour attachment is `ctx.output`, with `loadOp` `'clear'` and clear colour (0, 0, 0, 1), then draw `compositor.draw(pass, viewFor(source), 'replace', null, specOf(source).format)`.
  - The step marks nothing touched, because the output is not a target id. It takes no timing slot (see Out of scope).
- **Landmine:** the compositor keeps **one uniform buffer per (blend, dstFormat) key** (`src/services/gpu/passes/compositor.ts` header). The five face copies share `(replace, rgba16float)`, and they are correct only because each face is its own submit.

- [ ] Test `a canvas-scaled layered row allocates canvas-sized with one layer view per layer and reallocates on resize` (use the `renderTargets.test.ts` mock device; 5 layers; resize 64² → 128²).
- [ ] Test `dome faces claim five slots disjoint from every capture row, inside VIEW_SLOT_COUNT`. Put it beside the capture-slot test in `cubemapCaptures.test.ts`, because a slot collision corrupts the other view's uniforms without raising any error.
- [ ] Test `copy step draws its source into ctx.output with replace and no tone`, using a stub compositor: assert the pass attachment view is `ctx.output`, and that the args are `(…, 'replace', null, HDR_TARGET_FORMAT)`.
- [ ] Test `copy step without a view output throws`.
- [ ] Commit.

### Task 3: Fisheye resample pass

**review: yes** (shader; TS↔WGSL twin)

**Files:** `src/services/gpu/shaders/domeResample/domeResample.wesl` (create), `src/services/gpu/renderers/domeResample/domeResampleRenderer.ts` (create), `src/@types/rendering/DomeResampleRenderer.d.ts` (create), `src/@types/engine/handles/EngineGpuHandles.d.ts` (`domeResampleRenderer`), `src/services/engine/engine.ts` (null seed, beside `cubeFaceBlitRenderer: null`, currently `:222`), `src/services/engine/gpuHandles/gpuHandleRegistry.ts` (row, beside `cubeFaceBlitRenderer`, currently `:322-327`), `src/services/engine/frame/passes/domeResamplePass.ts` (create), `src/services/engine/frame/passes/index.ts`, `tests/services/gpu/shaders/domeFaces.parity.test.ts` (create)

**Template:** `cubeFaceBlitRenderer.ts` + `cubeFaceBlit.wesl` is exactly this shape: a covering triangle, one sampled texture, a bind group rebuilt per draw because `reconcile` replaces views, no blend and no depth.

**Contract:**

```ts
export type DomeResampleRenderer = Renderer & {
  draw(pass: GPURenderPassEncoder, faces: GPUTextureView /* dome-cube, whole 2d-array */): void;
};
// passes/domeResamplePass.ts
export const domeResamplePass: ContentPass; // name 'dome-resample'
//   enabled: state.gpu.domeResampleRenderer !== null. Only the dome program rosters it, and dome-cube is allocated exactly then.
//   draw:    renderer.draw(pass, ctx.renderTargets.viewOf('dome-cube'))  — createView() on a 5-layer texture is a 2d-array view
```

**Shader:**

- Bindings: `@binding(0) texture_2d_array<f32>` and `@binding(1)` a linear, clamp-to-edge sampler. There are no uniforms, because the tilt lives only in the face rotations (Task 4).
- The fragment shader follows the dome-frame contract above step for step: NDC from `in.uv` → r. For r > 1 it returns `vec4(0, 0, 0, 1)`. Otherwise it computes d, runs the argmax over a `DOME_FACES` table, computes s, t → u, v, then `textureSampleLevel(faces, samp, uv, face, 0.0)` with alpha forced to 1.
- Declare the table as `const DOME_FACES = array<mat3x3<f32>, 5>(…)` with **literal numbers in column order**. Copy it into a function-scope `var` before the runtime-indexed loop, because runtime indexing of a module `const` array is not portable across WGSL compilers.
- Pipeline target: `HDR_TARGET_FORMAT`, with no blend.

- [ ] Test `DOME_FACES in domeResample.wesl equals the TS table`: text-parse the 45 literals in order (regex idiom from `tests/services/gpu/shaders/orbitTrailConstants.parity.test.ts`) and compare them with `DOME_FACES` flattened column-major, plus the array length against `DOME_FACE_COUNT`. The argmax/uv rule itself can't be text-pinned; it is a line-for-line port of `domeFaceUv`, and review checks it.
- [ ] Verify: `npm run typecheck:fast`, plus the WESL link tests for the new file. On the dev server the dome view does not exist until Task 4, so the eye-check waits for Task 5.
- [ ] Commit.

### Task 4: The `dome` rig

**review: yes** (frame orchestration; camera/view derivation)

**Files:** `src/@types/engine/frame/ViewRigKey.d.ts`, `src/@types/engine/frame/ViewRig.d.ts`, `src/data/rendering/viewRigs.ts`, `src/data/rendering/frameSections.ts`, `src/utils/camera/domeFaceSpecs.ts` (create), `src/services/engine/frame/checkFrameOrder.ts`, `src/services/engine/phases/startLoop.ts:27-33`, `tests/utils/camera/domeFaceSpecs.test.ts` (create), `tests/services/engine/frame/checkFrameOrder.test.ts`

**Contract:**

```ts
export type ViewRigKey = 'mono' | 'dome';
// ViewRig gains:
/** The canvas cursor maps to one view. False turns off picking and the terrain pick marker (Task 5). */
readonly pickable: boolean;
// frameSections.ts gains:
export const SCENE_TO_DOME_CUBE: FrameSection = { scope: 'perView', steps: [...SCENE.steps, { kind: 'copy', source: 'hdr' }] };
export const DOME_RESAMPLE: FrameSection = { scope: 'once', steps: [{ kind: 'render', target: 'hdr', slab: COSMO, passes: ['dome-resample'] }] };
// viewRigs.ts:
mono: { views: () => null, program: [PRELUDE, SCENE, POST, OVERLAYS], pickable: true },
dome: { views: domeFaceSpecs, program: [PRELUDE, SCENE_TO_DOME_CUBE, DOME_RESAMPLE, POST], pickable: false },
// utils/camera/domeFaceSpecs.ts
export function domeFaceSpecs(canvas: FrameView, state: EngineState): readonly ViewSpec[];
```

**What `domeFaceSpecs` builds.** One `ViewSpec` per layer i; `runFrame` derives each into a view via `deriveView(canvas.snapshot, cam, spec)`.

| ViewSpec field | value                                                        |
| -------------- | ------------------------------------------------------------ |
| `rotation`     | `domeFaceRotations(DOME_PARAMS.tiltDeg)[i]`                  |
| `eyeOffsetMpc` | `[0, 0, 0]`                                                  |
| `frustum`      | `symmetricFrustum(Math.PI / 2, 1)`                           |
| `sizePx`       | `canvas.canvasSize` (the dome canvas is square: Task 5)      |
| `slot`         | `DOME_PARAMS.viewSlotBase + i`                               |
| `output`       | `canvas.snapshot.renderTargets.layerViewOf('dome-cube', i)`  |

**How the rig runs:**

- The `DOME_RESAMPLE` section runs after the faces, and PR 1's first-touch union marks `hdr` as rendered, so the resample loads `hdr`. That is harmless because it writes every pixel.
- `POST` then blooms and tonemaps the fisheye into the canvas: the main ctx has no `output`.

**Check this PR 1 assumption.** `renderFrame` must submit the `PRELUDE` encoder (the `sky-view` compute and captures) **before** the face submits, because `atmosphere-shell` in every face samples that LUT. If PR 1 submits once-section work at the end of the frame, fix the ordering here and say so in the commit.

**`checkFrameOrder` over every rig.**

- It takes `programs: readonly (readonly FrameStepSpec[])[]`.
- A pass or compute listed on more than one line **within a program** throws.
- A contributed pass or compute that **no** program draws throws. Capture-only passes stay exempt.
- Targets are checked across all programs.
- `startLoop` passes `Object.values(VIEW_RIGS).map((rig) => rig.program.flatMap((s) => s.steps))`.

Today's single-order check (`checkFrameOrder.ts` loop and throws) would reject `dome-resample` under mono, and would reject `SCENE` once it is listed by both rigs.

- [ ] Test `domeFaceSpecs returns five specs on slots 19–23, each targeting its dome-cube layer`: use a stub `layerViewOf`.
- [ ] Test `a direction projected through each dome view's vp lands where domeFaceUv says`. This is the twin ↔ render contract, the only test that catches a flipped axis or a swapped face order.
  - For each face, take directions at the face centre and 0.9 of the way to each edge, in dome coordinates.
  - Carry each one to world space with `domeBasis` and the main camera's world axes, which you decode from `main`'s view matrix as PR 1's test decodes forward.
  - Project `drawCamPos + dir·k` through `views[i].vp`, then assert u = (ndc.x + 1)/2 and v = (1 − ndc.y)/2 to 5 digits.
- [ ] Test `a pass drawn only by the dome program passes the boot check`, and test `a pass listed twice within one rig's program throws`.
- [ ] Commit.

### Task 5: `?dome` boot, square canvas, picking off

**review: yes** (engine state seeding)

**Files:** `src/services/engine/engine.ts` (the `EngineState` literal, currently `:136`), `src/styles/global.css:385-390`, `src/services/engine/helpers/pickFrameContext.ts`, `src/services/engine/phases/wireInput.ts:168-177`, `tests/services/engine/helpers/pickFrameContext.test.ts`

**What changes:**

- `engine.ts` seeds `viewRig: hasUrlGate('dome') ? 'dome' : 'mono'` (`src/utils/url/hasUrlGate.ts`, the same read `initGpu` does for `gpuTimings`). It then stamps `canvas.dataset.viewRig = state.viewRig` once. React doesn't own that attribute, so it survives re-renders. This is the only place the URL is read.
- `global.css` gains a rule after `#c`: `#c[data-view-rig='dome'] { width: min(100vw, 100vh); height: min(100vw, 100vh); margin-inline: auto; }`. `resizeCanvasToDisplay` then produces a square backing store.
- `pickFrameContext` returns `null` when `!VIEW_RIGS[state.viewRig].pickable`. That one gate turns off hover pick, click pick and `drawPickDebugOverlay`, because all three go through it.
- `wireInput`'s pointer-move handler returns before the `cursorTexPx` write and wake when the rig isn't pickable. `terrainPickMarkerPass` stays off in dome because its gate reads `ctx.cursorTexPx === null`. The pass sits in `SCENE` (`frameSections.ts:236`), so leaving `OVERLAYS` out of the program does not reach it (Open points #2).

- [ ] Test `pickFrameContext is null under a non-pickable rig` (the existing test file's fixture with `viewRig: 'dome'`). Without the gate, a dome click would select whatever the unseen 60° main view has under the cursor.
- [ ] Eye-check, with the dev server (running already) and the user looking at `?dome`:
  - the canvas is a centred square;
  - the fisheye disc is black outside;
  - the look direction sits two-thirds of the way from the centre to the bottom edge;
  - a slow orbit shows no face seams, including over Earth;
  - bloom is continuous across the seam lines;
  - no labels, rings or marker lines appear;
  - the HUD stays usable.
- [ ] Commit.

### Task 6: Recorder `--dome`

**Files:** `tools/record/record.ts` (`parseArgs` `:187-312`, `captureTake`'s URL, `spawnFfmpeg` `:346`, `ffprobeReport` `:920-955`), `tools/utils/record/buildCaptureUrl.ts`, `tools/utils/record/buildFfmpegArgs.ts`, `tools/record/README.md`, `tests/tools/utils/record/buildCaptureUrl.test.ts`, `tests/tools/utils/record/buildFfmpegArgs.test.ts` (create)

**Contract:**

```ts
buildCaptureUrl(opts: { base: string; simTime: Date; dome: boolean }): string   // dome → `${base}/?cinema&dome#t=<ISO>`
buildFfmpegArgs(opts: { fps: number; out: string; dome: boolean }): string[]
// dome argv, exactly:
// -f image2pipe -framerate <fps> -i - -c:v libx264 -profile:v main -level 6.1 -crf 20 -pix_fmt yuv420p -r 30 -y <out>
// non-dome: today's VideoToolbox argv, unchanged (buildFfmpegArgs.ts:29-44)
```

**Flags and output:**

- **`--dome`** (boolean) implies `--size 4096x4096`, `--dpr 1` and `--fps 30`.
- **Overrides under `--dome`:** an explicit `--size` may override the size, but only as a square (otherwise throw); this allows fast pipeline checks at 1024². An explicit `--dpr` ≠ 1 or `--fps` ≠ 30 throws.
- **Why level 6.1:** 4096² is 65 536 macroblocks, over level 5.2's limit. That is also why `--dome` cannot use VideoToolbox (Open points #3).
- **Output name:** the default name keeps coming from `defaultOutName`.
- **`ffprobeReport`** also returns and prints `profile`, `level`, `pix_fmt` and `r_frame_rate`. They are already in `-show_streams` JSON.
- **README:** add a `--dome` row to the flag table, plus a short "Fulldome (Wisdome)" section giving the command and the expected ffprobe values.

**`--frames N`** (user-ruled 2026-09-20, applies to every take, not just dome): stop after N captured frames and close the file cleanly. N is a positive integer; the take ends at `min(natural end, loopFrames, N)` — the capture loop already bounds on `frameCap` and a looping clip's `loopFrames` (`record.ts:874`, `:904`), so this is a third bound on the same comparison, not a new stop path. `--frames` beyond the take's own length is clamped, never a way to run a loop twice. It is the FIRST N frames only: no start offset (tours window with `--beats`; a clip start offset is out of scope). Its value: a 4096² dome frame renders five faces, so an early Wisdome test file costs minutes at `--frames 150` (5 s) instead of 4440 frames.

- [ ] Test `dome capture URL carries both gates` in `buildCaptureUrl.test.ts`.
- [ ] Test `dome encode pins the Wisdome H.264 argv`: full-array `toEqual`. A dropped `-level 6.1` or `-pix_fmt` produces a file that only fails on the venue's player.
- [ ] Add `--frames`: parse + validate in `parseArgs`, clamp into the loop's bound, name it in the progress line and the README table. No test (argv plumbing over an existing bound; Task 7 exercises it).
- [ ] Commit.

### Task 7: Test film to Wisdome

**Files:** none committed (`recordings/` is gitignored).

- [ ] If `public/data` in the worktree is empty, run `/link-data` first.
- [ ] Take the short film FIRST: `npm run record-clip -- earthUniverseLoop --dome --frames 150 --serve --rebuild` (5 s at 30 fps). `--serve` means a production build with no HMR reloads mid-take, and `--rebuild` because the app changed. This is the file Wisdome gets early, and it proves the format before any long render.
- [ ] Then the full take, `npm run record-clip -- earthUniverseLoop --dome --serve` (drop `--frames`), one loop cycle: 148 s, 4440 frames at 30 fps.
  - Time the first progress lines (they print every 60 frames). If a frame takes more than about 2 s (over 2.5 h total), report the rate to the user before committing to the full run.
- [ ] Probe the file:

  ```bash
  ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,profile,level,pix_fmt,width,height,r_frame_rate \
    -of default=nw=1 <out>
  ```

  Expect `codec_name=h264`, `profile=Main`, `level=61`, `pix_fmt=yuv420p`, `width=4096`, `height=4096` and `r_frame_rate=30/1`.

- [ ] Extract stills with `ffmpeg -ss <t> -i <out> -frames:v 1 still-<t>.png` at t = 2 s (Earth close-up: face seams over Earth), 35 s (galaxy field: dot/glow floors at face edges) and 74 s (far turn-around).
  - Check each still: the disc is black outside, the horizon sits about 30° up from the bottom edge, and there are no seams.
  - Show the stills to the user.
- [ ] Hand the file path to the user to send to wisdome-teknik.kf@malmo.se. Sending it is the user's action.

## Risks and eye-checks

- **Pixel floors:** galaxy-dot and star-glow minimums are in face pixels, so at a face edge a floor-sized dot spans about half its centre angle after the warp. This is accepted for v1 (1.6× oversampling at 4096); judge it on the Task 7 stills. Angular floors go to the backlog.
- **Earth seams:** the opening of the clip rests on PR 1's union surface cut. Judge seams over Earth on the Task 5 preview and the 2 s still.
- **Cost and VRAM:** each dome frame costs about 5× a flat 4K frame. At 4096² the `hdr`, `foreground:0` + depth, offscreens, bloom and `dome-cube` together come to about 1.1 GB. The preview on a retina display renders five faces at the canvas's device size, so expect a low frame rate.
- **Fallback for Friday** regardless: laptop HDMI on the podium, flat view.

## Open points (spec vs code)

1. **Canvas-sized layered target.** The spec wants `dome-cube` as a "2d-array, 5 layers, N²" row, but today a row can have layers only through `fixedSizePx`, whose size comes from state and not from the canvas (`RenderTargetSpec.d.ts` `fixedSizePx.layers`; `renderTargets.ts:366,377,388,409,463-466`). Task 2 hoists `layers` to its own field instead of working around it.
2. **Terrain pick marker placement.** The spec lists the marker among the things that are off in dome, beside `OVERLAYS`, but it is drawn inside `SCENE`'s foreground line (`frameSections.ts:236`). Leaving `OVERLAYS` out does not turn it off. Task 5 gates it at the cursor write instead.
3. **Encoder.** The recorder encodes with `h264_videotoolbox` at 60 Mbit/s, not libx264 (`buildFfmpegArgs.ts:29-44`, with the reasoning in its header). The spec's libx264 args apply under `--dome` only; non-dome takes keep VideoToolbox. Apple's H.264 encoder very likely rejects 4096² anyway.
4. **"Short" test clip — RULED 2026-09-20.** A loop take records exactly one cycle: 148 s, i.e. 4440 frames at 30 fps (`makeEarthLoop.ts:23-24,53`; `record.ts` loop-frame stop). The user asked for a `--frames N` cap; Task 6 adds it and Task 7 takes the short film first.
5. **Boot check assumes one order.** `checkFrameOrder` checks "exactly once" over one order (`checkFrameOrder.ts:56-116`, `startLoop.ts:27-33`), which contradicts a second rig reusing `SCENE`. Task 4 makes the check per-rig.
6. **Planning on the main context only.** The spec's union planning covers the surface cut and the star cut only. Some SCENE data is still planned once, from the main 60° context: the galaxy disk LOD (`src/layers/galaxyCatalog/frame.ts:83-119` plans at `drawPxPerRad` ≈ 0.87 N, while faces render at 0.5 N), structure markers (`runFrame.ts:315-317`) and the label directors (`runFrame.ts:292-295`, which feed overlays that dome doesn't draw). This plan leaves them as is: expect LOD thresholds to shift in the dome frames; it is not a correctness break. Eye-check it on the stills.
7. **README drift — FIXED** on the prep PR (`965979a9b`, `ea4ccaa0c`): `tools/record/README.md` claimed `--dpr` defaults to 2 where the code defaults to 1 (`record.ts:196-199`).

## Definition of Done

**Deliverables:**

- Data: `DOME_PARAMS`, `DOME_FACES`/`DOME_FACE_COUNT`.
- Utilities: `domeBasis`, `domeFaceRotations`, `fisheyeDirection`, `domeFaceUv`.
- Frame and rig: `RenderTargetSpec.layers`, the `dome-cube` row, `VIEW_SLOT_COUNT = 24`, `CopyStepSpec` and the executor `copy` case, `ViewRigKey 'dome'`, `ViewRig.pickable`, `SCENE_TO_DOME_CUBE`/`DOME_RESAMPLE`, `VIEW_RIGS.dome`, `domeFaceSpecs`, and `checkFrameOrder` over every rig.
- Resample: `domeResample.wesl`, `domeResampleRenderer`, `domeResamplePass`.
- Boot and input: `?dome` seeding plus the square-canvas CSS, and the pick and cursor gates.
- Recorder: `record-clip --dome`, and `--frames N` on every take.
- The Task 7 film is on disk, and its ffprobe values are recorded in the ledger.

**Smoke (dev server):**

- `?dome`: everything listed in Task 5's eye-check.
- Mono (no `?dome`) is unchanged: labels, selection ring and marker lines draw; hover updates the InfoCard; click selects; the terrain pick marker follows the cursor when its debug overlay is on.
- `?cinema&dome` shows only the square fisheye, with no HUD.

**Film:** the ffprobe values in Task 7 match, and the stills show no seams, a black surround and the horizon about 30° up from the bottom edge.

**Out of scope:**

- The VR rig.
- Angular (per-steradian) point-size floors.
- Per-view planning for Layer frame hooks and label/marker producers (Open points #6).
- GPU timing slots for the `copy` and `dome-resample` steps: `MAX_PROGRAM` expands only `FRAME_ORDER` (`timing/maxProgram.ts:12`), so they stay untimed.
- A live 4096² preview.
- Migrating captures onto `ViewSpec`.
- A `--frames` recorder cap, unless the user asks for it (Open points #4).
