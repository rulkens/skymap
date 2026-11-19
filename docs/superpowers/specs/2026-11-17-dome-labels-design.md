# Labels as data, and labels on the dome: design spec

> **Status.** Draft, 2026-11-17. Owner: Alexander Rulkens. The contract, the unified rules and the
> packaging below were ruled in the design session of 2026-11-16/17.
> **Written against** main at ee682ac07.
> **Inputs.** [`docs/backlog/2026-09-23-dome-output-space-overlays.md`](../../backlog/2026-09-23-dome-output-space-overlays.md)
> (its label half is picked up here; its pixel-floor half stays backlogged) and the producer survey
> of 2026-11-17 (§10).
> **Packaging.** Two PRs. The prep PR (§8, three commits) changes mono only. The dome PR (§7) follows.

## 1. Why

The dome draws no 2D labels: its frame program has no overlay section
(`src/data/rendering/viewRigs.ts:26`), and every place that turns a world position into pixels
assumes a flat perspective image. There are six such places: `projectLabels` on the CPU, the label
vertex shader, the caption lift (an f64 matrix inverse in `liftedLabelPlacement`), the famous-galaxy
and Milky Way producers (which lift themselves), the pick re-projection, and the marker-line shader.
Ten Layers add to this, because each producer does its own camera math (`ctx.drawPxPerRad`,
screen-up from the camera basis), which is wrong on a fisheye image.

The label path is also the largest source of garbage in the near scene. Measured at ee682ac07, it
allocates 0.82–0.95 MB per frame at the three near poses, about half of all JS allocation (§9).

So this work does two things in order: it makes labels data that a Layer describes and core draws
(mono, no dome yet), then it adds the dome as one more projection.

## 2. Decisions

- **D1. A Layer describes labels; core does everything else.** A Layer declares `LabelSource` rows.
  It never sees a camera, a projection, a buffer, a pick word or a fade value.
- **D2. Projection stays on the GPU.** The vertex shader projects every frame. A TypeScript twin of
  the same function serves declutter and hit tests, held equal by a parity test.
- **D3. One record buffer per director.** Core encodes descriptions into 64-byte records in one
  `ArrayBuffer`, in the layout the shader reads. Per frame core writes only each record's alpha.
- **D4. Styles are rows in one table.** A record carries a style index. The shader reads the same
  table.
- **D5. Lift is an angle with a pixel floor.** The angle is the style's `lift.radii` times
  `asin(subjectRadius / distance)`, computed where the projection runs, and never less than
  `lift.minPx`. Nothing in a record depends on the camera. (Found in group B: today's rule is
  1.5 apparent diameters, at least 28 px, in screen space; the angle form replaces it in group C and
  moves large subjects' captions by a few px, e.g. about 10 px for Earth from its surface pose.)
- **D6. Rules that apply to every label** (owner, 2026-11-17), replacing per-Layer variants:
  1. A label fades out when its subject fills the view.
  2. A near-scene label hides behind bodies.
  3. In "focused only" mode every label hides except the focused subject's.
  4. A hovered or selected subject always keeps its label; the focused subject's label stays clickable.
  5. Declutter ranking is priority band first, apparent size within a band.
  6. One text size clamp, `LABEL_TEXT_PX`, for every label.
- **D7. Dropped special cases:** the Sun/Earth/Moon vertical stagger, the famous-galaxy distance-ramped
  size cap, the stream's hover bypass (now rule 4), per-producer lift.
- **D8. Dome labels draw once on the fisheye image**, after resample and tonemap, upright toward the
  zenith (ruling of 2026-09-23). Marker lines' successor (leaders) draws with them; the selection
  ring stays off and the dome stays unpickable.
- **D9. Dome occlusion comes from the resample**, which also writes a coverage mask at output size.
- **D10. Pixel constants scale by output size.** `pxScale = outputPxPerRad / REFERENCE_PX_PER_RAD`;
  mono's is 1.

## 3. The Layer contract

```ts
// src/@types/engine/layer/LabelSource.d.ts
export type LabelSource<Item> = {
  readonly slab: Slab;
  readonly toggle: LabelToggleId;
  readonly style: LabelStyleId;
  /** Cheap value compared each frame; when it differs core calls `items` and `describe` again.
   *  Omit for a list that never changes. */
  readonly changes?: (state: EngineState) => unknown;
  readonly items: (state: EngineState) => readonly Item[];
  /** Pure. null = no label for this item. */
  readonly describe: (item: Item, index: number) => LabelDescription | null;
};

// src/@types/rendering/LabelDescription.d.ts
export type LabelDescription = {
  readonly text: string;
  /** Absolute Mpc, or a body core tracks. No position this frame = no label. */
  readonly position: Vec3 | { readonly anchorId: string };
  readonly subjectRadiusMpc?: number;
  readonly color?: Vec4;
  readonly priority?: number;
  readonly pick?: { readonly code: number; readonly index: number };
  readonly fadeKey?: string;
  readonly revealBand?: FadeBand;
  readonly style?: LabelStyleId;
};

// src/@types/rendering/LabelStyleRow.d.ts
export type LabelStyleRow = {
  readonly font: LabelFont;
  readonly color: Vec4;
  readonly outline: { readonly color: Vec4; readonly emFrac: number };
  readonly textHeight: { readonly mpc: number } | { readonly timesRadius: number };
  readonly appear?: { readonly fromPx: number; readonly bandPx: number };
  readonly placement: 'centre' | 'above';
  /** For 'above': the text sits `radii` subject angular radii above the subject's centre, and at
   *  least `minPx` up. Today's rule is 1.5 diameters and 28 px, so captions use { radii: 3, minPx: 28 }. */
  readonly lift?: { readonly radii: number; readonly minPx: number };
  /** A line from the subject's rim (plus `gapPx`) or its centre to just under the text. */
  readonly leader?: {
    readonly from: 'rim' | 'centre'; readonly gapPx: number;
    readonly widthPx: number; readonly color: Vec4;
  };
  readonly priority: number;
};
```

`LayerScreenLabel` and its `produceLabels` are deleted; `guides.screenLabels` holds `LabelSource`
rows. `labelSource(row)` is an identity helper that infers `Item`.

Notes on single fields:

- **`changes`.** Three lists are filtered per frame today (missions, famous galaxies, structures),
  so list identity cannot be the signal. Typical values: the catalog object, a store version, a
  setting. `describe` receives no state, so anything it needs from state is captured by `items`.
- **`pick`.** The Layer passes the pick code it already holds (codes differ per item for bodies,
  stars and structures). Core adds `PICK_SENTINEL_OFFSET` and packs the word in one place.
- **`revealBand`.** Stars and craft are below a pixel, so a size rule cannot replace a distance rule.
- **`fadeKey`.** Names one of the toggle's per-item fades. The missions' settings-driven dim moves
  into that fade, so no `opacity` field exists.
- **Missions' launch dates.** A craft with no position this frame has no label, so sources get no
  clock.

## 4. Styles

`LABEL_STYLES` (`src/data/labels/labelStyles.ts`) is the registry; `LabelStyleId` is its key union.
Rows at landing, from today's values (apparent sizes are diameters, so today's structure radii double):

| row | text height | appear | placement | leader | priority |
|---|---|---|---|---|---|
| `galaxyCluster` | fixed | 10 +8 px | centre | no | tuned (§8.3) |
| `openCluster`, `globularCluster`, `nebula`, `gcCluster` | fixed per row | 10 +8 px | above, gap 8 | no | tuned |
| `supercluster`, `void` | fixed | 56 +40 px | centre | no | tuned |
| `galaxyGroup` | fixed | 88 +48 px | centre | no | tuned |
| `famousGalaxy` | × radius | 6 +4 px | above | yes | tuned |
| `milkyWay` | fixed | none | above | yes | top band |
| `stellarStream` | fixed | 150 px, band tuned | centre | no | tuned |
| `caption` (bodies, stars, black holes, missions) | × radius | none | above, gap 4 | yes | per item (10–40) |
| `constellation` | fixed | none | centre | no | 5 |
| `lightTime` | tiny, so pinned at the minimum | from today's distance band at the default lens | above, gap 0 | no | 12 |

`LABEL_TEXT_PX = { min: 32, max: 72 }` (`src/data/labels/labelTextPx.ts`) replaces every per-style
clamp. 72 is a starting value; §8.3 says how it is chosen.

The light-time sphere pass moves to the same pixel rule (§8, commit 6).

## 5. Core

### 5.1 The record

One layout, in `src/data/labels/labelRecordLayout.ts` and `labels/io.wesl`, held equal by a parity
test (as `SLOTS_PER_GALAXY_POINT` is):

```wgsl
struct LabelRecord {          // 64 bytes
  atHi: vec3f, radiusMpc: f32,
  atLo: vec3f, alpha: f32,    // alpha is the only word written per frame
  pick: u32, style: u32, tint: u32, glyphs: u32,
  glyphCount: u32, rank: f32, revealNear: f32, revealFar: f32,
};
```

Positions are absolute Mpc as an f32 hi/lo pair (`writeHiLoVertex`, as `missionTrail` does). The
shader subtracts the camera's own pair, which is exact near the camera, so labels need no per-slab
rebased matrix and no clip-w rescale. `near0OverlayClipScale`, `near0OverlayVpF32` and `emClipScale`
leave the label path.

### 5.2 Encoding

Per source, when `changes` differs from the last frame's value: call `items`, call `describe` per
item, write records into the source's range of the director's buffer, lay out text into the glyph
buffer (memoised by text and font), mark the range dirty. If a source's count changes, the whole
buffer is repacked. Fade state is carried across an encode by `(source, pick index or item index)`.

### 5.3 Per frame

Stages run in a fixed order, each writing only its own output:

| stage | reads | writes |
|---|---|---|
| `resolveAnchors` | body states | `atHi`/`atLo` of anchored records |
| `projectRecords` | records, `OutputProjection` | scratch: px, pxPerRad, up, apparent diameter |
| `targetAlpha` | styles, toggle fades, focus, hover/select, D6 rules, body occluders | scratch: target |
| `declutter` | rank, px boxes | scratch: survivor |
| `envelope` | target × survivor, the director's policy | `alpha` |

The two directors are two config rows (`slab`, envelope policy). `label2DDirector.ts` (807 lines)
is replaced by these stages; `applyLift`, `synthesizeLines`, `signatureOf` and both envelope
closures go. Upload is the dirty word ranges: nothing while the scene is still, and nothing for
camera motion alone.

### 5.4 Projection and lift

```ts
// src/@types/rendering/OutputProjection.d.ts
export type OutputProjection = {
  readonly kind: 'pinhole' | 'equidistant';
  readonly viewFromWorld: Mat3;       // rotation only; the camera position travels as hi/lo
  readonly camHi: Vec3; readonly camLo: Vec3;
  readonly up3: Vec3;                 // view +y (pinhole) or the zenith (equidistant)
  readonly sizePx: Vec2; readonly focalPx: number; readonly pxScale: number;
};
```

`projectLabel(v, p) → { px, pxPerRad, up, visible }` and
`liftedAnchor(v, radiusMpc, gapPx, p)` exist in TypeScript (`src/utils/labels/`) and WGSL
(`lib/projectLabel.wesl`). The lift turns the view direction toward `up3` by
`asin(clamp(radius / |v|, 0, 1))`, projects, then adds `gapPx × pxScale` along the local `up`. When
the direction is parallel to `up3` it falls back to image-up. The fisheye angle uses
`atan2(length(d.xy), d.z)`, never `acos(dot)`.

The glyph quad is built from `up` and its perpendicular, so text rotation costs nothing extra.

### 5.5 Leaders, picking, occlusion

- **Leaders** are a second instanced draw in `labelRenderer` over the same records, from the
  silhouette top to the text's bottom edge. `markerLineRenderer`, `markerLinesPass` and
  `markerLines/*.wesl` (596 lines) are deleted; `Label2DLeader` and `MarkerLine` go with them.
  `segmentQuad.wesl` stays (constellations, filaments, trails and streams use it).
- **Picking** reads the px boxes `projectRecords` already made; `labelPickQuads` stops re-projecting.
- **Occlusion** in mono keeps the sampled-depth test, judged at the subject (which is now the
  record's own position, so `occludeSubjectPos` goes), plus the body-sphere test in `targetAlpha`.

## 6. What is deleted

`LayerScreenLabel`, `Label2D`, `Label2DProjection`, `Label2DLeader`, `MarkerLine`;
`label2DDirector.ts`, `projectLabels.ts`, `liftedLabelPlacement.ts` (172), `labelLeaderLine.ts` (147),
`composeForegroundCaption.ts` (81), `captionComposeContextOf.ts`, `aboveRingAnchor`,
`sphereSilhouetteTop` (if no other caller), the marker-line renderer (596), `cosmoLabelProjection`,
`near0LabelProjection`, `packLabels`' object path, and ten producer files, each replaced by a source
row of 5–15 lines.

## 7. The dome PR

1. `dome` rig: `program: [PRELUDE, SCENE_TO_DOME_CUBE, DOME_RESAMPLE, POST, overlays({ selectionRings: false })]` and an
   `outputProjection` of kind `equidistant` (image centre = zenith, bottom = front,
   `r = θ / (π/2)`), with `pxScale = (N/π) / REFERENCE_PX_PER_RAD`. Mono's rig names its pinhole
   projection the same way, so the directors read the rig's projection and never ask which rig runs.
2. `overlays(...)` is the section builder the prep PR made of `OVERLAYS` (§8.1), so the dome lists
   mono's section without the rings; it adds none of its own.
3. The `equidistant` branch of `projectLabel` in both languages, under the parity test.
4. `DOME_RESAMPLE` gains a second target at output size holding coverage and radial distance; the
   dome's label occlusion samples it in place of `foreground:0` depth. **Open for the dome PR's
   plan:** this is a second occlusion source, so the label shader would branch on the rig. The
   un-braided shape is one occlusion input of one format that each rig's program fills (mono from
   its depth, the dome from the resample). Its cost in mono is one extra small pass; price it with
   `npm run perf` before choosing.
5. Confirm with the planetarium that dome masters are front-at-bottom before the first delivery
   with text (carried over from the 2026-09-23 ruling).

`REFERENCE_PX_PER_RAD` is mono's value on a 1080-px-high canvas at the default 60° lens.

## 8. Ground preparation

The prep PR, mono only, three commits in this order. Verdicts from the refactor-ground pass: every
touchpoint the dome needs was a bolt-on (six pinhole-only projection sites, no output projection on
a rig, lift tied to a matrix inverse, leaders in a separate renderer).

1. **One projection.** `OutputProjection`, `projectLabel`/`liftedAnchor` in TS and WGSL with the
   parity test; the label shader and `projectLabels` use them; the rig carries its projection.
   `OVERLAYS` comes from one builder, `overlays({ selectionRings })`, the rings a parameter (no
   split: it would cost a pass). No visible change.
2. **Lift and leaders in the label shader.** The label row carries the subject position, its
   radius, a px gap and the leader's length and width (in the slot `subjectPos` frees); the shader
   lifts with `liftedAnchor`, and `labelRenderer` draws leaders as a second instanced draw. The
   director's `applyLift`, the famous and Milky Way producers' own lift, `liftedLabelPlacement`,
   `labelLeaderLine` and the marker-line renderer are deleted. No visible change.
3. **Label sources and the record buffer.** §3–§5: the contract, the style table, the stages, all
   ten Layers migrated, the D6 rules and D7 removals. This commit changes behaviour, deliberately:
   - **Ranking bands** are set from before/after shots of crowded views (streams against star
     captions, the Local Group, the solar system).
   - **`LABEL_TEXT_PX.max`** is chosen from shots at the LMC, at Andromeda on approach and at a planet.
   - **The dropped stagger** is checked at a zoom where Sun, Earth and Moon collapse to one dot.
   - **One fade behaviour** (owner, 2026-11-17): the two envelope policies become one. Which one is
     chosen from two recordings of the same flight, one per policy; the other is then deleted.
   Each set goes to the owner as dash checks before the PR is offered for merge.

Three adjacent findings ride the prep PR as their own commits after these (owner, 2026-11-17):

4. **The pick sentinel has one home.** `PICK_SENTINEL_OFFSET` is added at 59 call sites; packing a
   pick word from `(code, index)` becomes the only place that adds it.
5. **Pixel constants follow DPR.** `pxScale` in mono is `devicePixelRatio`-aware, through the same
   joint the dome uses (D10), so labels are the same physical size on any display.
6. **The light-time sphere fades by pixels**, with the rule its caption uses, so the two cannot
   drift apart on a long lens.

## 9. Performance

Baseline at ee682ac07, four poses (earth-surface, solar-system, star-field, local-group), server on
`--url http://localhost:5176`:

- **Main thread** (`perf:cpu --frames 240`): `labels:near0` 0.79–0.90 ms per frame at the three near
  poses (0.04 at local-group); `labels:cosmo` 0.18–0.23 ms.
- **GPU** (`perf --frames 60`, floor-subtracted): labels-cosmo, labels-near and marker-lines about
  0.4–0.7 ms each.
- **Allocation** (heap sampling over 240 frames): label path 953 / 904 / 824 / 142 KB per frame.

Re-measure after the prep PR and after the dome PR with the same flags and the same probe. Targets
for the prep PR: label-path allocation near zero in a still scene, `labels:near0` lower, GPU label
passes no slower (one pass fewer). A neutral or worse result halts the landing for the owner's ruling.

## 10. Producer survey (2026-11-17)

| Layer | maps to | notes |
|---|---|---|
| constellations | `constellation` | no radius: no size fade, no lift |
| black holes | `caption` | anchored position |
| bodies | `caption` | anchored; list becomes a constant (today rebuilt each frame under a running clock) |
| stars | `caption` | anchored; `revealBand`; list becomes a constant |
| missions | `caption` | anchored; `revealBand` per craft; dim via `fadeKey` |
| structures (two sources) | per-category rows | pick index is the per-category index |
| stellar streams | `stellarStream` | hover bypass becomes rule D6.4 |
| Milky Way | `milkyWay` | core lifts on the cosmic range too |
| famous galaxies | `famousGalaxy` | per-galaxy size threshold becomes the row's; cap ramp dropped |
| light-time | `lightTime` | silhouette top is the angle lift with Earth as anchor |

Open detail for the plan: the Milky Way's pick gate is tested at the galactic centre while its label
sits at the origin; under D6.4 the gate is by pick word, so the position difference should vanish.
Verify.

## 11. Not in this work

- The pixel-floor half of the dome overlays backlog item (star glow floor, sprite clamp, ring band,
  constellation line width). The backlog file is trimmed to that half.
- 3D world labels (`worldLabels`, Label3D) are untouched.

## 12. Tests

- Parity: `projectLabel`/`liftedAnchor` TS against WGSL constants and against the old matrix path in
  mono (small angles); the record layout TS against WGSL.
- Encoding: a source's `describe` output to record bytes; re-encode only when `changes` differs;
  fade state survives a re-encode.
- Stages: each D6 rule as one test on `targetAlpha`; declutter order; both envelope policies.
- Per Layer: one test that its source describes the expected labels (replacing ten producer tests).
- Dome: equidistant projection at zenith, horizon and the fallback cone; upright rotation.
