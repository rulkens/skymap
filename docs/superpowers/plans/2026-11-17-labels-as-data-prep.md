# Labels as data: the prep PR (mono only)

**Spec:** [`docs/superpowers/specs/2026-11-17-dome-labels-design.md`](../specs/2026-11-17-dome-labels-design.md)
(§3–§6 the target, §8 this PR, §9 the perf baseline). The dome PR (§7) gets its own plan after this lands.

**Goal.** Layers describe labels as data; core encodes them into one record buffer and does all
view work; the GPU projects and lifts. Mono only. Tasks 1–6 change nothing on screen; tasks 7–13
change behaviour in the ways the spec's D6/D7 list, each checked by the owner from shots.

**Execution.** Subagent-driven, lean protocol. One plan, serial dispatches, in the worktree
`dome-2d-labels-simplify`. The perf gate runs (owner: "measure performance before and after").
One commit per task; the PR squashes. Dev server: `http://localhost:5176`.

**Read first (implementers):** `docs/RENDERER.md`, the `wesl-shaders` skill, memory landmine
"Labels" (never `acos(dot)`; a vanishing NEAR0 caption is CPU declutter plus GPU depth).

---

## Group A: one projection (no visible change)

### Task 1: `OutputProjection`, `projectLabel`, `liftedAnchor` in TypeScript

**Files:** `src/@types/rendering/OutputProjection.d.ts`, `src/@types/rendering/ProjectedLabel.d.ts`,
`src/utils/labels/projectLabel.ts`, `src/utils/labels/liftedAnchor.ts`, `src/utils/labels/tangentToward.ts`,
tests mirroring each.

```ts
export type OutputProjection = {
  readonly kind: 'pinhole';            // the dome PR adds 'equidistant'
  readonly viewFromWorld: Mat3;        // rotation only
  readonly camHi: Vec3; readonly camLo: Vec3;
  readonly up3: Vec3;                  // view +y, in view space
  readonly sizePx: Vec2; readonly focalPx: number; readonly pxScale: number;
};
export type ProjectedLabel = { px: Vec2; pxPerRad: number; up: Vec2; visible: boolean };
projectLabel(v: Vec3, p: OutputProjection, out: ProjectedLabel): void   // v = view-space vector
liftedAnchor(v: Vec3, radiusMpc: number, gapPx: number, p: OutputProjection, out: ProjectedLabel): void
```

Pinhole: `px = centre + focalPx · (v.x, −v.y) / v.z`, `pxPerRad = focalPx · |v| / v.z`,
`up = (0, −1)`, `visible = v.z > 0`. Lift: turn `normalize(v)` toward `up3` by
`asin(clamp(radiusMpc / |v|, 0, 1))`, project, add `gapPx · pxScale` along `up`. Both write into
`out` and allocate nothing.

- [x] Test `projectLabel matches the view-projection matrix path` — a spread of points against
      `forwardProjectPoint` (`src/utils/labels/projectLabels.ts`), within 1e-3 px.
- [x] Test `liftedAnchor matches liftedLabelPlacement at small angles` — subject under 2° across.
- [x] Test `liftedAnchor caps the lift at 90 degrees when the eye is inside the sphere`.
- [x] Test `tangentToward falls back to image-up when the direction is parallel to up3`.

### Task 2: the WGSL twin — **review: yes**

**Files:** `src/services/gpu/shaders/lib/projectLabel.wesl`, `tests/services/gpu/shaders/projectLabel.parity.test.ts`

Same two functions and struct, field for field. Follow an existing TS↔WESL parity test
(`selectionEncoding.test.ts`) for how constants and struct layouts are held equal.

- [x] Test `OutputProjection uniform layout matches the TS writer` (offset table in the test).
- [x] Test `projectLabel.wesl names the same fields as projectLabel.ts`.

### Task 3: the rig names its projection; overlays take a rings parameter

**Files:** `src/data/rendering/viewRigs.ts`, `src/data/rendering/frameSections.ts`, the view-rig type,
`src/utils/labels/outputProjectionOf.ts` (+ test), `src/services/engine/frame/runFrame.ts`.

- `OVERLAYS` comes from one section builder, `overlays({ selectionRings })`: the same two swap
  steps either way, with or without the rings and clip-path debug. No split (Gate A: a split costs
  a pass and moves the rings in the draw order). Mono's `OVERLAYS` is `overlays({ selectionRings: true })`.
- The mono rig gains `outputProjection: pinholeOutput`; `outputProjectionOf(view, rig)` builds the
  `OutputProjection` for a frame (f64 camera position split with the `writeHiLoVertex` rule).
- [x] Test `mono program draws the same steps in the same order as before the overlays builder`.
- [x] No other test: this is routing.

### Task 4: the label shader and `projectLabels` use `projectLabel` — **review: yes**

**Files:** `src/services/gpu/shaders/labels/{io,vertex,vertexOcclude}.wesl`,
`src/services/gpu/renderers/labels/labelRenderer.ts`, `src/utils/labels/projectLabels.ts`,
`src/utils/labels/{cosmoLabelProjection,near0LabelProjection}.ts`, `src/@types/rendering/Label2DProjection.d.ts`.

- Uniforms become `{ out: OutputProjection, viewFromSlab: mat4x4f }` (the matrix is interim; Task 8
  removes it). `worldToClip`, `pxToClipOffset`, `EM_PX_RETUNE` and `emClipScale` leave the label
  shader; the quad is built from `up` and its perpendicular, written as NDC at w = 1.
- `near0OverlayClipScale` / `near0OverlayVpF32` lose their label callers; delete them if nothing
  else calls them.
- [x] `npm run shot` at earth-surface, solar-system, star-field and local-group before and after;
      the label pixels must match. Attach the pairs to the reply.

**Gate A:** `npm run perf -- --url http://localhost:5176 --frames 60` and `perf:cpu --frames 240`
on the four poses; compare with `scratchpad/perf-baseline/`. Report; no change expected.

---

## Group B: lift and leaders in the shader (no visible change)

### Task 5: the label row carries the lift — **review: yes**

**Files:** `src/@types/rendering/Label2D.d.ts`, `src/services/gpu/shaders/labels/io.wesl`,
`labels/vertex.wesl`, `labelRenderer.ts`, `packLabels.ts`, `src/services/engine/subsystems/label2DDirector.ts`,
`src/layers/galaxyCatalog/famousGalaxies/present/produceFamousGalaxyLabels.ts`,
`src/layers/milkyWay/card/present/produceMilkyWayLabel.ts`, `src/utils/labels/composeForegroundCaption.ts`.

`LabelData` bytes 80..95 (`subjectPos` today) become:

| word | field |
|---|---|
| 80 | `radiusMpc` |
| 84 | `gapPx` |
| 88 | `leaderLengthPx` (0 = no leader) |
| 92 | `leaderWidthPx` |

`worldPos` is now the subject. `Label2D` loses `occludeSubjectPos`, `leader` and `lift`'s old
fields; gains `lift?: { radiusMpc; gapPx; leader?: { lengthPx; widthPx; color } }`. The director's
`applyLift` (`:622-707`), the far clamp and the em rescale are deleted; the famous and Milky Way
producers set `lift` instead of calling `liftedLabelPlacement`. Declutter and pick use
`liftedAnchor` (TS).

- [x] Test `a lifted label's declutter box sits where the shader draws it` (TS twin against the
      numbers Task 1 pinned).
- [x] Shots before/after at solar-system and local-group; label and leader pixels must match
      within 1 px.

As built (deviations from the text above):

- The shader reproduces today's screen-space proportional lift (anchor = subject px + up x
  `max(28, 1.5 D, 28 + inkDrop)`, D = the subject's apparent diameter), not `liftedAnchor`: the 3D
  turn moves big or off-axis subjects by several px, which breaks "no visible change". The angle
  and gap rule is Group C's behaviour change.
- Row bytes 72..95 as laid out in `LABEL_DATA_OFFSETS`: `leaderRgba`, `inkBottom`, `radiusMpc`,
  `leaderGapPx`, `lift` (kind), `leaderWidthPx`. No `leaderLengthPx`: the length is camera-derived,
  so the shader computes it.
- `Label2DDirectorConfig.declutterLift: 'drawn' | 'proposed'` is transitional: NEAR0 still judges
  captions at subject + `proposedLiftPx`, COSMO at the drawn lift. Task 10 removes it.

### Task 6: leaders draw in `labelRenderer`; the marker-line renderer goes

**Files:** `labelRenderer.ts`, `src/services/gpu/shaders/labels/leader.wesl` (new), delete
`markerLineRenderer`, `markerLinesPass`, `shaders/markerLines/*`, `src/utils/labels/liftedLabelPlacement.ts`,
`src/utils/labels/labelLeaderLine.ts`, `src/@types/rendering/{Label2DLeader,MarkerLine}.d.ts`, their
tests, and the `marker-lines` step in `frameSections.ts`. Keep `segmentQuad.wesl`.

A second instanced draw over the label buffer: from the silhouette top to the text's bottom edge,
`leaderWidthPx` wide, in the leader colour, faded by the label's alpha.

- [x] Shots as in Task 5.

As built: the leader entries (`vsLeader`, `fsLeader` and the occluded pair) live in the existing
`labels/{vertex,fragment}*.wesl` files, not a new `leader.wesl` (the folder convention bans two
stages in one file, and this reuses the compiled modules). `shaders/markerLines/{io,vertex,fragment}`
became `shaders/debugLines/` (the debug-line renderer still uses them, minus occlusion).

**Gate B:** perf as Gate A. Expect one GPU pass fewer; report the label-path allocation with
`scratchpad/allocProbe.mts`.

---

## Group C: label sources and the record buffer (behaviour changes, each checked)

### Task 7: types, the style table, the text clamp

**Files:** `src/@types/engine/layer/LabelSource.d.ts`, `src/@types/rendering/{LabelDescription,LabelStyleRow}.d.ts`,
`src/data/labels/labelStyles.ts`, `src/data/labels/labelTextPx.ts`, `src/utils/labels/labelSource.ts`.

Types exactly as spec §3. Rows as spec §4, values copied from today's constants
(`structureMarkerStyles.ts`, `famousLabelStyle.ts`, `stellarStreamLabelStyle.constants.ts`,
`bodyCaption.ts`, `constellationCaptions.ts`, `produceLightTimeCaptions.ts`). `LabelStyleRow` is the
spec §3 type as amended: `lift?: { radii; minPx }` and `leader?: { from: 'rim' | 'centre'; gapPx;
widthPx; color }` replace `gapPx`. Values from Group B's rule (`src/utils/labels/labelLiftPx.ts`,
`src/data/labels/labelLift.ts`): `caption` lift { radii: 3, minPx: 28 }, leader from the rim, gap 4;
`famousGalaxy` and `milkyWay` the same lift, leader from the centre, gap 0; structure rows placed
above and `lightTime` lift { radii: 1, minPx: 8 or 0 } with no leader. The leader's top stops 6 px
under the text's ink bottom (`LEADER_LINE_PADDING_PX`). Structure
appear thresholds are today's radii doubled. `LABEL_TEXT_PX = { min: 32, max: 72 }`. No test.

### Task 8: the record, its encoder, and anchors — **review: yes**

**Files:** `src/data/labels/labelRecordLayout.ts`, `src/@types/rendering/LabelRecords.d.ts`,
`src/utils/labels/{createLabelRecords,encodeLabelSource,writeLabelRecord,packPickWord}.ts`,
`src/services/gpu/shaders/labels/io.wesl`, tests.

| word | type | field |
|---|---|---|
| 0–2 | f32 | `atHi` |
| 3 | f32 | `radiusMpc` |
| 4–6 | f32 | `atLo` |
| 7 | f32 | `alpha` (the only per-frame word) |
| 8 | u32 | `pick` (packed; 0 = not clickable) |
| 9 | u32 | `style` index |
| 10 | u32 | `tint` rgba8 (0 = the style's colour) |
| 11 | u32 | `glyphs` first instance |
| 12 | u32 | `glyphCount` |
| 13 | f32 | `rank` |
| 14–15 | f32 | `revealNear`, `revealFar` (Mpc; 0, ∞ = none) |

`encodeLabelSource(source, state, into, start) → count` calls `items` then `describe` and writes
records; it runs only when `source.changes?.(state)` differs from the remembered value.

- [x] Test `record layout matches io.wesl LabelRecord`.
- [x] Test `encodeLabelSource writes the described label` (one fixture, compare words).
- [x] Test `a source is described again only when its change value differs`.
- [x] Test `hi/lo position keeps millimetre precision 1 AU from the origin`.

### Task 9: the per-frame stages

**Files:** `src/services/engine/labels/{resolveAnchors,projectRecords,targetAlpha,declutterRecords,labelEnvelope}.ts`,
`src/data/labels/{labelStages,labelDirectors}.ts`, `src/@types/rendering/LabelFrame.d.ts`, tests.

Each stage is `(records, frame, inputs) => void`, writes only its own columns of `LabelFrame`, and
allocates nothing. `targetAlpha` implements the rules, one test each:

- [x] `a label fades out as its subject fills the view`
- [x] `a near-scene label behind a body is hidden` (reuse `subjectOccludedByBodies`)
- [x] `focused-only hides every label but the focused subject's`
- [x] `a hovered or selected subject keeps its label below the appear threshold`
- [x] `the focused subject's label stays clickable; a dimmed subject's does not`
- [x] `ranking is priority band first, apparent diameter within a band`
- [x] `a label with no position this frame has zero alpha`
- [x] `fade state survives a re-encode that reorders records`

Both envelope policies stay selectable by the director row until Task 12. Declutter judges every
label at its drawn position (Group B's transitional `declutterLift: 'proposed'` for NEAR0 goes in
Task 10; the kept-label changes it causes are checked in Task 11).

### Task 10: the switch — renderer, directors and every Layer — **review: yes**

**Files:** `labelRenderer.ts`, `labels/*.wesl`, `src/services/engine/phases/createLayers.ts`,
`src/services/engine/layer/gateLabelProducer.ts`, `runFrame.ts`, `labelsCosmoPass.ts`, `labelsNearPass.ts`,
`labelPickQuads.ts`, each Layer's `layer.ts` and a new `…/labels/<name>LabelSource.ts`; delete the ten
`produce*Labels`/`produce*Captions` files, `label2DDirector.ts`, `projectLabels.ts`,
`composeForegroundCaption.ts`, `captionComposeContextOf.ts`, `aboveRingAnchor`, `sphereSilhouetteTop`
(if unused), `Label2D`, `Label2DProjection`, `LayerScreenLabel`, `packLabels`' object path, and their tests.

The renderer reads records, the style table (a storage buffer uploaded once) and the glyph buffer;
the interim `viewFromSlab` matrix goes (positions are hi/lo). Upload is dirty word ranges.

Per Layer, the source and what it maps to (spec §10). Anchored positions use the body id:

| Layer | style | notes |
|---|---|---|
| constellations | `constellation` | no radius |
| black holes | `caption` | `anchorId: blackHoleAnchorId(row)`, `fadeKey: row.id` |
| bodies | `caption` | constant list; priority from `BODY_CAPTION_ROWS`; no stagger |
| stars | `caption` | constant list; `revealBand` from `starCaptionStyles` |
| missions | `caption` | `revealBand` from `captionRevealM`; the settings dim folds into the toggle's per-craft fade (`fadeKey: body.id`) |
| structures ×2 | category row | `changes`: store version; pick index = `categoryIndexOf` |
| stellar streams | `stellarStream` | `changes`: `runtime.meta()` |
| Milky Way | `milkyWay` | one item |
| famous galaxies | `famousGalaxy` | `changes`: the catalog object |
| light-time | `lightTime` | `anchorId: 'earth'`, radius = sphere radius |

- [ ] One test per Layer, `<layer> describes its labels`, replacing its producer test.
- [ ] Renamed files move with `npm run move-files -- <from> <to>`, never `git mv`.

### Task 11: tune from shots, owner checks

**Files:** `src/data/labels/labelStyles.ts`, `src/data/labels/labelTextPx.ts`.

Shoot before (main) and after at: Local Group; the solar system; a stream field near star captions;
the LMC from the Milky Way; Andromeda on approach; a planet on approach; a zoom where Sun, Earth and
Moon collapse to one dot. Set the ranking bands and `LABEL_TEXT_PX.max` from them. Send each pair
with its deep link as a dash check; the owner keeps the verdict.

### Task 12: one fade behaviour

**Files:** `src/data/labels/labelDirectors.ts`, `labelEnvelope.ts`, tests.

Record the same short flight twice with `npm run record-tour` tooling or a screen capture of the
dev server, once per policy on both ranges. Send both to the owner. Delete the policy not chosen
and its test.

**Gate C:** perf as Gate B. Targets: label-path allocation near zero at a still pose,
`labels:near0` below 0.79 ms, GPU label passes no slower. A neutral or worse result stops here for
the owner's ruling.

---

## Group D: adjacent fixes (own commits)

### Task 13: the pick sentinel has one home

**Files:** `src/data/selectionEncoding.ts`, the 59 call sites of `PICK_SENTINEL_OFFSET` (grep), tests.

`packPickWord(code, index)` adds the offset; `packSelection(code, i + PICK_SENTINEL_OFFSET)` call
sites become `packPickWord(code, i)`. `PICK_SENTINEL_OFFSET` stops being exported if the shader
parity test allows. No behaviour change; the existing pick tests are the gate.

### Task 14: pixel constants follow DPR — **review: yes**

**Files:** `outputProjectionOf.ts`, `src/data/labels/referencePxPerRad.ts`, test.

`pxScale` in mono becomes the canvas's device-pixel ratio (labels today are sized in device pixels,
so they shrink on a dense display). Shoot at `deviceScaleFactor` 1 and 2; text must be the same
size in CSS pixels. Owner check.

### Task 15: the light-time sphere fades by pixels

**Files:** `src/layers/lightTime/spheres/**` (the liveness helper and the sphere pass), tests.

The sphere uses the appear/fills-view rule its caption uses, from one shared helper. Shots at the
default lens must match today's; shoot one long-lens pose to show sphere and caption agree.

### Task 16: backlog and docs

**Files:** `docs/backlog/2026-09-23-dome-output-space-overlays.md` (trim to the pixel-floor half;
retitle), `docs/BACKLOG.md` line 209, `docs/RENDERER.md` (labels section), `viewRigs.ts` comment.

---

## Definition of Done

- **Deliverables:** `LabelSource`, `LabelDescription`, `LabelStyleRow`, `LABEL_STYLES`,
  `LABEL_TEXT_PX`, `OutputProjection`, `projectLabel`/`liftedAnchor` (TS and WESL), the record
  layout and its parity test, the five stages; no `Label2D`, `LayerScreenLabel`, `label2DDirector`,
  marker-line renderer, or per-Layer `produce*` label file remains.
- **Observable, mono:** every label that showed before shows, with leaders; hover highlights a
  label; clicking a label selects its subject; "focused only" leaves one label; a caption behind a
  planet hides; labels fade rather than pop when decluttered; a still scene uploads no label bytes.
- **Owner-approved from shots:** ranking in crowded views, the text size cap, the missing stagger,
  the single fade behaviour, DPR sizing, the light-time sphere.
- **Perf:** Gate C numbers recorded in the PR body beside the baseline.
- **Out of scope:** anything dome (`equidistant`, the coverage mask, the dome program); 3D world
  labels; the dome pixel floors.
