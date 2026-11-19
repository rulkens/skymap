# Labels on the dome: implementation plan

**Spec:** `docs/superpowers/specs/completed/2026-11-17-dome-labels-design.md` (§7; decisions D8–D10).
**Prep (merged):** #1144, `docs/superpowers/plans/completed/2026-11-17-labels-as-data-prep.md`.
**Carried risks:** `docs/backlog/2026-09-23-dome-output-space-overlays.md`, last two sections.

## Goal

2D labels and their leaders draw once on the dome's fisheye image, upright toward the
zenith, at the dome's own pixel scale. Mono must not change by a pixel.

## Strategy

The prep PR left one joint: `OutputProjection`. This PR adds its second kind and makes
every pinhole-only line in the label path read the projection instead. Nothing in the
directors, the stages or the shader asks which rig runs.

Three rules make that hold, and each removes a pinhole assumption without a branch:

| Quantity | Today | After | Mono result |
| --- | --- | --- | --- |
| Text height px | `em / v.z × focalPx` | `em / distance × subject.pxPerRad` | identical (`pxPerRad = focalPx·distance/v.z`) |
| Subject diameter px | `2r / distance × focalPx` | unchanged | identical |
| Ink box | axis-aligned at the anchor | bounds of the box turned by `up` | identical (`up = (0, −1)`) |

For `equidistant`, `focalPx` and `pxPerRad` are both `N/π`, so the same two lines give
the dome its sizes.

## Decisions taken here (owner sign-off at plan review)

- **P1. Dome occlusion comes from a coverage mask, as spec D9 says** (owner, 2026-11-19;
  the body-sphere-only shortcut was declined). The mask is one format, `(coverage, distance
  km)`, written by one pass from `foreground:0`'s colour alpha and depth. Each dome face runs
  it; the resample turns the five into one mask at output size. Whether mono's labels read the
  same mask (one occlusion source, at the price of one pass and one target in mono) or keep
  their sampled depth (a second label pipeline variant) is ruled at Task M3, on a measured
  number, as spec §7.4 asks.
  **M3 ruling (owner, 2026-11-19): two sources.** Mono keeps its sampled-depth occlusion
  unchanged; the dome's labels read the mask through their own pipeline pair.
- **P2. Declutter on the dome uses the axis-aligned bounds of the rotated box.** One rule
  for both rigs; a label near a diagonal claims slightly more room than its ink. The dome
  is unpickable, so pick boxes need nothing more.
- **P3. `N` is `min(canvas width, height)` in device px, and it sets sizes only.** The dome
  canvas is always square: `global.css`'s `#c[data-view-rig='dome']` boxes it to the window's
  short side, centred, which is why the image is a circle in a wide window (checked on a
  3200×1800 shot: the canvas is 1800², and rim labels sit on their subjects). Positions follow
  the resample, which maps the horizon to the canvas edge in NDC; on that square canvas the
  per-axis half-size is one radius, `N/2`.
- **P4. The light-time spheres' fade stays in face pixels.** It needs the output scale in
  the shared camera prefix, which is the pixel-floors backlog item's work; the carried line
  stays in that file.

Carried risks that need no task, with the reason:

- *Uniform written per draw:* each director has its own renderer and the dome draws labels
  in a `once` section, so no two draws share a buffer.
- *`clipYFlip` ignored:* only capture faces flip; labels draw on the canvas view.

## The dome frame

View space for `equidistant` is the dome frame the resample already uses
(`shaders/domeResample/fragment.wesl`): `+y` zenith, `+z` front, `+x` right. The image
centre is the zenith and the front lands at the bottom.

```
θ      = atan2(length(d.xz), d.y)          // never acos(dot)
px     = centrePx + (θ / (π/2)) × (sizePx / 2) × (d.x, d.z) / length(d.xz)   // image y runs down
up     = normalize(centrePx − px)          // toward the zenith
pxPerRad = focalPx                         // N/π: sizes, not positions
visible  = θ ≤ π/2
```

The offset is per axis because the resample maps the horizon to the canvas edge in NDC. The
dome canvas is square (P3), so in practice it is `θ × focalPx` along the bearing.

Within `PARALLEL_TANGENT_EPS` of the zenith `px = centrePx` and `up` is image-up
`(0, −1)`.

---

## Group A: projection contract

### Task A1: `OutputProjection` gains `equidistant`; the rig must name its kind

**Files:** `src/@types/rendering/OutputProjection.d.ts`, `src/@types/engine/frame/ViewRig.d.ts`,
`src/services/gpu/lib/outputProjectionUniform.ts`, `src/services/gpu/shaders/lib/projectLabel.wesl`,
`src/data/rendering/viewRigs.ts`, `src/utils/labels/outputProjectionOf.ts`,
`tests/services/gpu/shaders/projectLabel.parity.test.ts`

**review: yes** (TS↔WGSL contract)

```ts
readonly kind: 'pinhole' | 'equidistant';   // OutputProjection
readonly outputProjection: OutputProjection['kind'];   // ViewRig: no longer optional
```

`KIND_CODE` becomes `{ pinhole: 0, equidistant: 1 }`, with matching WGSL constants
`KIND_PINHOLE` / `KIND_EQUIDISTANT`; the parity test holds the two tables equal. The
uniform's byte layout does not change. The dome rig keeps `'pinhole'` in this task (its
labels are not listed yet), and the `?? 'pinhole'` fallback in `outputProjectionOf` goes.

No new test beyond the parity row: the rest is a type change.

### Task A2: `projectLabel`, equidistant branch, both languages

**Files:** `src/utils/labels/projectLabel.ts`, `src/services/gpu/shaders/lib/projectLabel.wesl`,
`tests/utils/labels/projectLabel.test.ts`, `tests/services/gpu/shaders/projectLabel.parity.test.ts`

**review: yes** (shader, pose maths)

Implements "The dome frame" above in both files, field for field. The WGSL must not square
a raw Mpc offset: normalise with `scaledLength` first, as `liftedAnchor` does.

Tests (`projectLabel.test.ts`, with an equidistant fixture of `N = 2000`, centre `(1000, 1000)`):

- `zenith lands on the centre with image-up` — `v = (0, 1, 0)` → `px = (1000, 1000)`, `up = (0, −1)`, visible.
- `the front horizon lands at the bottom edge` — `v = (0, 0, 1)` → `px = (1000, 2000)`, `up = (0, −1)`.
- `the right horizon lands at the right edge, up pointing left` — `v = (1, 0, 0)` → `px = (2000, 1000)`, `up = (−1, 0)`.
- `45° up at the front is half-way down` — `v = (0, 1, 1)` → `px.y = 1500`.
- `below the horizon is not visible` — `v = (0, −0.1, 1)` → `visible = false`.
- `pxPerRad is N/π everywhere` — two directions, both `2000/π`.
- `scale does not matter` — `v` and `1e-22 × v` project to the same px.

Parity test: the WGSL source names the same branch constants and uses `atan2`, never `acos`.

### Task A3: `liftedAnchor` under equidistant

**Files:** `src/utils/labels/liftedAnchor.ts`, `src/services/gpu/shaders/lib/projectLabel.wesl`,
`tests/utils/labels/liftedAnchor.test.ts`

**review: yes**

The function already turns in 3D toward `p.up3` and pushes along `out.up`; it should need no
new branch. Its one pinhole assumption is the caller's: `projectRecords` and the shader add
`out.visible &&= view[2] > 0` / `subject.visible`, which is right once `visible` comes from
`projectLabel`. Fix only what the tests show.

Tests:

- `a lifted label sits nearer the zenith than its subject` — subject at `(0, 1, 1)`, radius
  giving a 2° lift: anchor `px.y` < subject `px.y`, same `px.x`.
- `the pixel floor pushes along the local up` — a zero-radius subject at the right horizon with
  `minPx = 20`: the anchor is 20 × `pxScale` px left of the subject.
- `a subject at the zenith lifts toward image-up` — the fallback cone.

---

## Group B: sizes and boxes read the projection

### Task B1: text height from `pxPerRad`

**Files:** `src/services/gpu/shaders/labels/vertex.wesl`, `src/services/engine/labels/projectRecords.ts`,
`tests/services/engine/labels/projectRecords.test.ts`

**review: yes** (shader + its CPU twin)

Both files: `textPx = clamp(em / distance × subject.pxPerRad × retune, min, max)`, where
`subject` is the un-lifted projection (the shader has it as `placed.subject`; `projectRecords`
must project the subject as well as the anchor for an `above` style). `frame.depthMpc` keeps
`view[2]` for its existing readers; check each reader and say in the report whether any is
pinhole-only.

Tests:

- `pinhole text height is unchanged off axis` — an existing-fixture record 20° off axis gives
  the same `frame.textPx` as `em / v.z × focalPx × retune` to 1e-9.
- `equidistant text height depends on distance alone` — two records at one distance, one at
  the zenith and one at 80°, get equal `textPx`.

### Task B2: the ink box follows `up`

> Superseded by B3: `rotatedBoxBounds` and its test were deleted, and `projectRecords` takes
> the ink box as the bounds of the four box corners through `labelCornerPx`.

---

### Task B3: dome text lies on a card facing the viewer

**Files:** `src/utils/labels/labelCornerPx.ts` (new), `src/utils/labels/unprojectLabel.ts` (new),
`src/services/gpu/shaders/lib/projectLabel.wesl`, `src/services/gpu/shaders/labels/vertex.wesl`,
`src/services/engine/labels/projectRecords.ts`, `src/utils/labels/rotatedBoxBounds.ts` (deleted),
their tests, `tests/services/gpu/shaders/projectLabel.parity.test.ts`

**review: yes** (shader + CPU twin)

Owner ruling 2026-11-19 (option 3: glyphs placed on the sphere, not a flat rectangle on the
fisheye image). An equidistant image stretches widths by `θ / sin θ`, so flat text reads
condensed on the dome, up to 36% at the horizon. Each glyph corner is instead placed on a flat
card tangent to the dome at the label's anchor, upright toward the zenith, and projected on
its own:

```ts
/** Where a point `offsetPx` from a label's anchor lands on the image: x along the text,
 *  y toward the label's up, in output px at the anchor. Written into `out`. */
export function labelCornerPx(
  anchor: ProjectedLabel, offsetPx: Readonly<Vec2>, p: OutputProjection, out: Vec2,
): void;

/** The unit view direction that `projectLabel` sends to `px`. */
export function unprojectLabel(px: Readonly<Vec2>, p: OutputProjection, out: Vec3): void;
```

- Pinhole: `anchor.px + across × x + up × y` (y runs toward the label's up, as the signature
  says), today's rigid quad (a flat screen wants flat text).
- Equidistant: `dir = unprojectLabel(anchor.px)`; `upT = tangentToward(dir, p.up3)`;
  `right = cross(upT, dir)` (sign chosen so text reads left to right for a viewer inside the
  dome; the test pins it); the corner is `projectLabel(dir + (right × x + upT × y) / focalPx)`.
  At the zenith (`tangentToward` gives none) the card's up is image-up.

WGSL twins of both functions live in `lib/projectLabel.wesl`; `expandRecordGlyph` calls
`labelCornerPx` for each corner (fringe included) in place of its rigid expression. No file
outside the projection lib names a projection kind. `projectRecords` takes the ink box as the
bounds of the four box corners through `labelCornerPx`, which replaces `rotatedBoxBounds`
(delete it and its test). Leaders are unchanged.

Tests:

- `a pinhole corner is the rigid offset` — equals `anchor.px + (x, −y)` for image-up.
- `unprojectLabel inverts projectLabel` — both kinds, three directions each, to 1e-9.
- `a dome label at the horizon is π/2 times wider in the image than at the zenith` — the px
  distance between corners `(−50, 0)` and `(50, 0)`.
- `dome text reads left to right from inside the dome` — at the front horizon, the `+x`
  corner lands at larger image x than the `−x` corner... or smaller: derive it from the
  resample's mirror convention, state the derivation in the test name's comment, and confirm
  it on a shot.
- `a dome label's height is the same at the zenith and the horizon` — corners `(0, 0)`, `(0, 50)`.
- `the ink box bounds all four card corners` (`projectRecords`, dome fixture).
- `mono ink boxes are unchanged` (`projectRecords`, existing fixture).

---

## Group C: the dome rig lists the labels

### Task C1: the dome's output projection

**Files:** `src/utils/labels/outputProjectionOf.ts`, `src/data/labels/referencePxPerRad.ts` (new),
`tests/utils/labels/outputProjectionOf.test.ts`

**review: yes** (pose maths)

```ts
/** Mono's on-axis px per radian on a 1080-px-high canvas at the 60° lens: authored label
 *  px are judged against this look. */
export const REFERENCE_PX_PER_RAD = 540 / Math.tan(Math.PI / 6);
```

For `kind: 'equidistant'`, with `N = min(canvasSize.width, canvasSize.height)`:

- `viewFromWorld` = the canvas camera's rotation turned into the dome frame, built from the
  same basis `domeFaceRotations(DOME_PARAMS.tiltDeg)` uses, so a label lands where the
  resample puts its subject;
- `up3 = (0, 1, 0)`, `sizePx` = the canvas, `centrePx` = its centre, `focalPx = N/π`,
  `pxScale = (N/π) / REFERENCE_PX_PER_RAD × DOME_LABEL_SCALE` (1.5, owner ruling 2026-11-19).

The pinhole branch is untouched.

Tests:

- `the dome zenith is the camera forward pitched up by the tilt` — `viewFromWorld × zenithWorld = (0, 1, 0)`.
- `the dome front is below the zenith in the camera's vertical plane` — the camera's forward
  direction projects (via `projectLabel`) to `px.x = centre.x`, `px.y > centre.y`.
- `a face-centre direction lands where the resample samples it` — for each of the five
  `DOME_FACES` forwards, `projectLabel` gives the px whose resample direction (the formula in
  `domeResample/fragment.wesl`, restated in the test) is that forward, to 1e-6.
- `pxScale is the dome label scale on a dome whose N/π equals the reference`.

### Task C2: overlays on the dome program

**Files:** `src/data/rendering/frameSections.ts`, `src/data/rendering/viewRigs.ts`, tests beside each that exist

**review: yes** (frame program)

Runs after Group M. The overlay builder takes what its label steps are occluded by:

```ts
function overlays(o: {
  readonly selectionRings: boolean;
  readonly occlusion: 'sampled-depth' | 'mask';   // one value if M3 rules the shared mask
}): FrameSection;

dome: { program: [PRELUDE, SCENE_TO_DOME_CUBE, DOME_RESAMPLE, POST, DOME_OVERLAYS],
        outputProjection: 'equidistant', pickable: false }
```

The dome's label steps must never bind `foreground:0`: on the dome it holds the last face
only. The letterbox line stays in both.

Tests:

- `the dome program ends with the label passes and no selection ring`.
- `the dome's label steps sample the occlusion mask, never foreground:0`.
- `mono's overlays are unchanged` — pass names and `depth` of `OVERLAYS` equal today's
  (dropped if M3 rules the shared mask).

### Task C3: look at it

**Files:** none

Shots at four poses on this worktree's server, mono and `?dome` each: earth-surface,
solar-system, star-field, local-group. Mono shots are compared with main's (no change
expected). Dome shots go to the owner as dash checks, one per pose, with the questions:
upright toward the zenith; subject and label agree; sizes readable; no label outside the
circle.

---

## Group M: the coverage mask

Runs after Groups A and B, before C2.

### Task M1: the occlusion-mask pass

**Files:** `src/services/engine/frame/passes/occlusionMaskPass.ts` (new),
`src/services/gpu/renderers/occlusionMask/occlusionMaskRenderer.ts` (new),
`src/services/gpu/shaders/occlusionMask/{vertex,fragment}.wesl` (new), the pass and renderer
registries, `src/@types/` entries for the renderer, tests for the pass's gates

**review: yes** (shader)

A fullscreen pass that reads the existing overlay joint (`lib/sceneDepth.wesl`'s group(1):
`foreground:0` colour, its depth, `SampledDepthFrame`) and writes, per pixel:

| Channel | Value |
| --- | --- |
| r | coverage: `1 − sceneTransmittance` |
| g | distance to the nearest drawn surface along the pixel's ray, km (`sceneRayDistance`); a large sentinel where nothing drew |

Target format `rg32float` (km do not fit f16), read with `textureLoad` only. Nothing lists
the pass yet.

Test: `the mask pass is off until foreground:0 has been drawn this frame` (the gate
`overlaySceneOcclusion` already applies).

### Task M2: the dome carries the mask to the fisheye image

**Files:** `src/data/rendering/frameSections.ts`, `src/services/gpu/renderTargets.ts`,
`src/@types/engine/frame/RenderTargetSpec.d.ts`, `src/utils/camera/viewRig/domeFaceSpecs.ts`,
`src/services/gpu/renderers/domeResample/domeResampleRenderer.ts`,
`src/services/gpu/shaders/domeResample/*.wesl`, `src/services/engine/frame/passes/domeResamplePass.ts`
(or a sibling pass), tests beside each that exist

**review: yes** (shader, frame program)

- New target `dome-cube-occlusion`: five `rg32float` layers at face size, allocated exactly
  when `dome-cube` is. `SCENE_TO_DOME_CUBE` gains one step per face running `occlusion-mask`
  into that face's layer.
- New target `dome-occlusion`: `rg32float` at output size. `DOME_RESAMPLE` gains a step that
  resamples the five layers into it with the colour resample's direction and face choice
  (share the function; do not copy it), ONE nearest tap per pixel: averaging distances across
  a silhouette invents a surface that is not there. Outside the circle: coverage 0.
- If the frame program cannot give a face its own layer of a second target, say so before
  building a workaround; that is a contract question for the controller.

Tests:

- `the dome program writes the occlusion mask before the overlays read it` — step order.
- `dome-cube-occlusion is allocated only on the dome rig`.

### Task M3: price the mask in mono, then rule

**Files:** none committed

List `occlusion-mask` in mono's program on a scratch edit and run `npm run perf` (`--frames 60`,
PER-LAYER totals and the wall-clock probe from the `perf` skill) at earth-surface and
solar-system, before and after; note the target's bytes at 4K (8 bytes per pixel). The
controller takes the numbers to the owner:

- **Shared mask:** the label shader reads only the mask on both rigs; `vertexOcclude.wesl`
  loses its depth read. Costs mono the measured pass and the target.
- **Two sources:** mono keeps sampled depth; the dome gets a mask variant of the occlude
  stages and a third pipeline pair in `labelRenderer`. Costs the variant's code.

### Task M4: labels read the mask

**Files:** per M3's ruling: `src/services/gpu/shaders/labels/vertexOcclude.wesl`,
`fragmentOcclude.wesl`, `src/services/gpu/renderers/labels/labelRenderer.ts`,
`occlusionCoverageGroup.ts`, `src/services/engine/frame/overlaySceneOcclusion.ts`,
`src/services/engine/frame/passes/labelsPass.ts`

**review: yes** (shader)

The verdicts keep their meaning: a label is judged once at its subject's px (a leader at its
bottom end) as "the mask's distance is nearer than the subject's near surface", and each
fragment is dimmed by the mask's coverage weighted by that verdict. A grounded record still
reads nothing.

Built under the two-sources ruling: `OverlaySceneOcclusion` is a union (`sampled-depth` |
`mask`), and `labelRenderer` picks plain, sampled-depth or mask pipelines from the value it
is handed (`labels/vertexOccludeMask.wesl`, `fragmentOccludeMask.wesl`, `lib/occlusionMask.wesl`).
A render step names its mask with `mask: { sample: <target> }` beside `depth`; it reaches the
passes as `SlabView.sampledMask`, and `checkFrameOrder` refuses one no earlier line writes.

---

## Group D: close-out

### Task D1: perf

`npm run perf -- --url <this server> --scenario <pose> --frames 60` and
`npm run perf:cpu -- --frames 240` at the four poses, mono, before (main) and after.
Expected: no change beyond what M3's ruling accepted. A worse result halts for the owner.

### Task D2: docs and backlog

**Files:** `docs/backlog/2026-09-23-dome-output-space-overlays.md`, `docs/BACKLOG.md`,
`docs/RENDERER.md` (label and dome sections)

Remove the six carried risks this PR closed; keep P4's line. Spec gets a dated note under §7
recording P1–P4 and M3's ruling.

---

## Not in this work

- The pixel floors and the light-time sphere fade (P4).
- Picking on the dome.
- The planetarium's confirmation that dome masters are front-at-bottom (spec §7.5): the
  owner's to ask before the first delivery with text.

## Definition of Done

- [x] Labels and leaders draw on `?dome`, upright toward the zenith, at all four poses (owner-signed shots).
- [x] A label's subject and its text agree on the dome (the C1 face-centre test, plus the shots).
- [x] Mono matches the base outside the owner-accepted changes.
      Pixel diff against d4051fb77 at six poses, clock pinned, two rounds: at dpr 2 nothing
      differs beyond the dither floor except 4 px on two glyph edges at star-field (cause not
      confirmed; likely f32 rounding in the rewritten text-height expression). At dpr 1 only
      leaders differ (the accepted one-pixel rule). The wide-lens fade and near-hide changes
      were not exercised by these poses.
- [x] `ViewRig.outputProjection` is required; no `?? 'pinhole'` fallback remains.
- [x] No label-path line reads `v.z` or `focalPx` for a size except subject diameter, the
      fill-the-view span (`FILL_SPAN_RAD`) and the card's px per radian (`labelCornerPx`).
- [x] `projectLabel` TS and WGSL agree under the parity test for both kinds.
- [x] Perf in mono, A-B-A-B against the base at the four poses: GPU totals and label rows
      inside the run-to-run spread; no mask or dome pass in mono. Main-thread `labels:near0` is
      0.02–0.035 ms slower per frame (0.13 → 0.16 ms), above the spread: reported to the owner.
      Dome: the half-size mask costs 1.7–2.0 ms per frame and 58 MB at 2205 px (headless Mac).
- [x] A dome label hides behind a body and is cut along its edge (owner passed the Hubble
      edge check, 2026-11-19).
- [x] Backlog: closed risks removed.
- [x] `npm test`, `npm run typecheck`, format: green in CI (675457efb).
