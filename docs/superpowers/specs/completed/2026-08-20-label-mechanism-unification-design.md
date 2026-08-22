# Label mechanism unification (ladder rung 8) — design

> **Status.** Reviewed call-by-call with the user 2026-08-21 — all four flagged
> decisions confirmed as written (§15); not yet built.
> **Date.** 2026-08-20. Branch `refactor/label-unification`, off `main` @ `9a7eb26c3`.
> **Ladder position.** Rung 8 of the engine-composition ladder
> ([decisions.md](../../research/engine/decisions.md) #9, widened by #11), the
> last rung before the umbrella `SubsystemBundle` reassessment (#17) is re-put.
> Inherits three explicit hand-offs: #15 D6 (the caption wake), #18 D12 (the
> `starCatalogLabel` / `bodyLabel` fade wire), and
> [renderer-layer-outliers.md](../../research/engine/renderer-layer-outliers.md)
> §6's rung-8 row (foregroundLabels' private director + structureMarkers' shadow
> path + zone-of-avoidance's private MSDF glyph pipeline).
> **Amends decision #6**: presentation mechanisms go from three named contracts
> to **four**. See §3.

## 1. What we're building

Skymap draws world-anchored text and marker geometry through **five** unrelated
mechanisms today:

| # | mechanism                                                          | who owns it                                                                | evidence                                          |
| - | ------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------- |
| 1 | the label director (COSMO): produce → declutter → envelope → flush | `labelDirectorSubsystem` + 3 registered `LabelProducer`s                   | `labelDirectorSubsystem.ts` (492 lines)           |
| 2 | a private re-implementation of the same thing (NEAR0)              | `foregroundLabelsLayer.draw` — its own declutter, envelope, wake, flush    | `foregroundLabelsLayer.ts` (441 lines)            |
| 3 | a raw per-frame marker call                                        | `runFrame` calls `produceStructureMarkers` and `setMarkers` by hand        | `runFrame.ts:666-669`                             |
| 4 | a private MSDF glyph pipeline for curved world text                | `zoneOfAvoidanceRenderer.drawLabels` + `shaders/zoneOfAvoidance/label/*`   | `zoneOfAvoidanceRenderer.ts:168-331,479-504`      |
| 5 | `drawPick` — the pick aspect of a `ContentLayer`                   | the frame program                                                          | unchanged by this rung                            |

Rung 8 turns 2, 3 and 4 into registered producers behind named contracts, so
that adding a label, a marker or a piece of world lettering is writing a
producer, not growing a layer. Mechanisms 1 and 2 collapse into **one
parameterized director with two instances**; 3 and 4 become their own thin
contracts.

Concretely, when this lands:

- `foregroundLabelsLayer` is a ~75-line draw call in the `labelsLayer` shape.
  Its `enabled` reads `renderer !== null && glyphCount() > 0`, so the
  `enabled`-reads-what-`draw`-wrote circularity
  (`renderer-layer-outliers.md:59`), the module-level `captionAlpha` map, and
  the in-`draw` `scheduler.requestRender()` at `:439` all cease to exist.
- The zone-of-avoidance renderer goes back to the family-A constructor norm
  `(device, targetFormat)` — its `atlases` third parameter and everything
  behind it move to a shared `label3DRenderer`, retiring the §1-family-A
  outlier row the outliers doc opened for it.
- `fade(['starCatalogLabel'])` and `fade(['bodyLabel'])` reach pixels for the
  first time, and the two LANDMINE comments at `fadeLayers.ts:110,123` are
  deleted rather than re-pointed.

Everything else is behaviour-neutral. The fade wire is the single sanctioned
behaviour change (§6).

### Goals

- One mechanism per presentation kind, each with a named contract and a
  registered set of producers; no private re-implementations left.
- `foregroundLabelsLayer`'s content — caption fade rules, priority tiers, the
  Sgr A* gate, apparent-size math, the lift — survives verbatim as **producer**
  content, not layer content.
- The two directors keep their exact current feel: COSMO's 300 ms smoothstep
  appear/disappear envelope and bbox-overlap declutter; NEAR0's 100 ms
  exponential approach and 48 px separation cull with priority tiers.
- Curved world lettering becomes plane-agnostic: the galactic band is one
  instance of an arc placement, not the only shape the shader can draw.
- The wake stays a vote in the existing `anim` bag (#15 D2), with no new channel.

### Non-goals

- **`clipPathDebug` is out.** `clipPathDebugLayer` uses `debugLineRenderer` and
  `DebugLine`, has no glyphs, no label ownership, no declutter and no envelope
  — its `setLines` in `draw` (outliers §2) is a debug-geometry upload, not a
  label path. Folding it in would mean giving `MarkerProducer` a second,
  label-free member solely to absorb a dev overlay. Recorded here so a reader
  of outliers §6's rung-8 row ("clipPathDebug bypass") does not read the
  omission as an oversight.
- **No generalization of the marker descriptor.** `MarkerProducer` is typed to
  the closed `StructureMarkerDescriptor` (§7). Opening it to a category union
  waits for a second, non-structure member — that is the second-special-case
  trigger, recorded, not pre-empted.
- **No envelope convergence.** The two envelopes stay two policies. They are
  independently eye-tuned and the rung is behaviour-neutral; converging them is
  a visual question, not a structural one.
- **No renderer-pair merging.** `labelRenderer`/`foregroundLabelRenderer` and
  `markerLineRenderer`/`foregroundMarkerLineRenderer` stay four instances. One
  renderer draws with one view-projection, and these pairs project through
  different slabs (`foregroundLabelsLayer.ts:5-9`) with different occlusion
  modes (`coverage` vs `compare`) and different capacities — the same "different
  VP" reasoning `subsystem-sweep` applies elsewhere. **Unification here is of
  MECHANISM, not of renderers.**
- **No umbrella `SubsystemBundle`.** #17 defers the commit/close call until
  after this rung; nothing here mints `labelProducers?` / `markerProducers?`
  bundle fields. Registration lives where §5/§7/§8 put it, keyed in its own
  domain per #12.
- **No pick changes.** `drawPick` is untouched, as is
  `zoneOfAvoidanceRenderer.ts:70`'s shared `draw`/`drawPick` uniform buffer —
  #16 D5's blocker for rung 9. This rung does not fix it and does not make it
  worse (the band uniform is not the label uniform).

## 2. Ground preparation

### 2.1 The ideal diff, data first

Written as if the codebase had always had four contracts:

- **Data delta.** `Label` grows one optional field (`leader`) and loses nothing;
  `MarkerLine` loses `ownerLabelId`; `LabelProducerOutput` loses its `lines`
  array. Two new types appear — `Label3D` + its arc placement — and one new
  config type parameterizes the director. Net: one array and one string field
  deleted from the wire, two world-text types added.
- **Code delta.** ~370 lines move out of `foregroundLabelsLayer` into two
  producers; ~130 lines move out of `zoneOfAvoidanceRenderer` into a shared
  renderer; the director grows a config switch in three stages; `runFrame`
  loses a hand-written marker block and gains two walker calls.
- **What the diff must NOT contain.** A registry with one row. A new subsystem
  handle for markers. A `LabelKind` discriminant that both the declutter and the
  envelope branch on. A `postBlit` special case. New `.d.ts` surface for the
  wake.

### 2.2 Growth vs bolt-on, per touchpoint

| touchpoint                             | verdict                                                                                                                                                                                | why                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| director config joint                  | **the missing joint** — mint it                                                                                                                                                        | The director is already the shape both label families want; it is hard-wired to one projection, one declutter and one envelope. That hard-wiring is why the second family cloned it. |
| `foregroundLabelsLayer`                | **the existing bolt-on** — dissolve it                                                                                                                                                 | 441 lines of layer doing production, declutter, envelope, wake and flush, with `enabled` reading state `draw` wrote. Outliers §2 flags it twice; #15 D6 hands its wake here.       |
| marker registration                    | **growth minted here**                                                                                                                                                                 | `produceStructureMarkers` is already a producer in everything but name; only its call site is raw. #6 already names `MarkerProducer` as the contract.                             |
| ZoA draw site                          | **ground already prepared** — rung 2's `postBlit` hook (`createUpsampleLayer.ts:26`) is exactly the seam the full-res lettering needs; this rung reuses it, thins it, and moves nothing | Rung 2 (#575) minted `postBlit` for this draw. Re-homing the draw would undo a shipped decision for no gain.                                                                      |
| fade wire                              | **ground already prepared** — rung 7's `resolveLayerOpacity(state, ctx, h)` (#18 D7) and the corrected raw-vs-canonical rule (#18 D8) are the vocabulary the caption producers need     | Nothing to refactor; the producers compose the factors the rung-7 contract already exposes.                                                                                       |
| `MarkerLine.ownerLabelId`              | **delete the coupling** (verified, §11.1)                                                                                                                                              | Every production line is owned by a label. The string back-reference exists only because lines travelled in a sibling array.                                                       |
| `src/services/engine/subsystems/labelProducer.ts` | **delete** (verified, §11.2)                                                                                                                                         | `export {}` plus a docblock, zero importers anywhere in `src/`, `tests/`, `tools/`. Dead since the contract went type-only.                                                       |

### 2.3 Greenfield cross-check — divergences and their adjudications

Three places where the greenfield shape differs from a literal "extract what is
there":

1. **Leader lines fold onto the label.** Greenfield puts `leader?` on the label
   and has no `lines` array and no `ownerLabelId`. Gated on the verification in
   §11.1, which **passed** — the fold is adopted. Producer output narrows to
   `{ labels, awake }` and the director's `lastOwnedLines` bookkeeping
   (`labelDirectorSubsystem.ts:122,382,397,430-432`) disappears with it.
2. **The marker descriptor stays closed.** Greenfield with one member would not
   invent a category union. Adopted as ruled: `MarkerProducer` is typed to
   `readonly StructureMarkerDescriptor[]`.
3. **Arc placement is plane-agnostic.** Greenfield would not hard-code the
   galactic basis into a shader when the placement is a circle in a plane.
   Adopted: `placement: { center, planeNormal, referenceDir, radiusMpc,
   startAngleRad }`, with the galactic basis supplied as producer data from
   `src/data/orientation/orientationFrames.ts` (`GAL_X_EQ` / `GAL_Z_EQ`, which
   already exist as TS `Vec3`s).

### 2.4 Prep list

Prep is PR A (§13). It contains exactly two mechanical changes: the renames
(§3.1) and the `lib/msdf.wesl` extraction (§9.3). Neither changes behaviour;
both are pure preconditions for PR B's diff being readable.

## 3. The four presentation contracts

Decision #6 named three mechanisms — `LabelProducer` / `MarkerProducer` /
`drawPick` — and forbade a fake-unified registry over them. That count was taken
before zone-of-avoidance (#555) landed a fourth kind of thing: text placed as
**world geometry** rather than as a screen billboard. It does not declutter, it
does not envelope, it has no leader line, and its "anchor" is an arc, not a
point. Forcing it through `LabelProducer` would be exactly the fake unification
#6 rejects. So the count becomes four, and #6 is amended accordingly:

| contract          | what it presents                                              | pipeline                                                    |
| ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| `Label2DProducer` | screen-billboard text anchored at a world point               | merge → project → declutter → envelope → lift? → flush     |
| `Label3DProducer` | text laid out as world geometry (curved, physically sized)    | merge → signature → flush                                   |
| `MarkerProducer`  | rings / halos with pre-baked per-instance alpha               | merge → flush                                               |
| `drawPick`        | the pick aspect of a `ContentLayer`                           | unchanged                                                   |

The four do not share a row type, a registry or a walker. They share a
vocabulary: a producer is `{ id, produce*(state, ctx) }`, pure of state, called
once per frame, and its output is merged and flushed by exactly one owner.

### 3.1 Renames (PR A)

Once `Label3D` exists, `Label` is an unmarked incumbent. Four renames, all
tool-assisted (`npm run refactor -- rename`, then `npm run move-files` for the
`.d.ts` and `.ts` files so the filename tracks the symbol):

| from                                                | to                                                    |
| --------------------------------------------------- | ----------------------------------------------------- |
| `src/@types/rendering/Label.d.ts` → `Label`         | `src/@types/rendering/Label2D.d.ts` → `Label2D`       |
| `@types/engine/subsystems/LabelProducer.d.ts`       | `Label2DProducer.d.ts` → `Label2DProducer`            |
| `@types/engine/subsystems/LabelProducerOutput.d.ts` | `Label2DProducerOutput.d.ts` → `Label2DProducerOutput` |
| `src/services/engine/presentation/produceFamousLabels.ts` → `produceFamousLabels` | `produceFamousGalaxyLabels.ts` → `produceFamousGalaxyLabels` |

The fourth row is a 2026-08-21 addition, not a §3-motivated one: once
`produceSceneBodyCaptions`' `famousStar` handle gives NEAR0 famous-**star**
captions (§6), "famous labels" is an ambiguous incumbent — the same
disambiguation this section already applies to `Label` → `Label2D`.

Not renamed in PR A, deliberately: `LabelRenderer`, `MarkerLine`,
`labelRenderer`, `labelsLayer`, `labelDirector`. The renderers and the
marker-line type are shared by both label families and by the Label3D path's
sibling concepts; renaming them would be churn without a disambiguation to buy.
`LabelDirectorSubsystem` → `Label2DDirector` rides PR B, where its signature
changes anyway (§4).

### 3.2 Type sketches

One type per file under `src/@types/`, `type` aliases throughout.

```ts
// @types/rendering/Label2D.d.ts — the incumbent Label, plus two fields.
export type Label2D = {
  readonly id: string;
  readonly worldPos: Vec3;
  readonly text: string;
  readonly font: FontId;
  // …colour / outline / sizing / alignment / fadeAlpha / prominencePx unchanged…

  /**
   * The connector from the labelled subject to this caption, when the label is
   * lifted off its anchor. Replaces the sibling `lines` array + `ownerLabelId`
   * back-reference: a leader belongs to exactly one label and dies with it.
   */
  readonly leader?: Label2DLeader;

  /**
   * Inputs for a director-side lift (§4.4). Present only on labels whose
   * director declares a lift policy; absent means "draw at `worldPos`".
   */
  readonly lift?: Label2DLift;
};

// @types/rendering/Label2DLeader.d.ts
export type Label2DLeader = {
  readonly fromWorld: Vec3;
  readonly toWorld: Vec3;
  /** Full pixel width; the shader halves it. */
  readonly pixelWidth: number;
  /** Straight RGBA. The owning label's fadeAlpha × envelope multiplies both. */
  readonly color: Vec4;
};

// @types/rendering/Label2DLift.d.ts
export type Label2DLift = {
  /** The labelled subject's apparent size in px — drives the proportional lift. */
  readonly subjectSizePx: number;
  /** Screen-px lift of the leader's BOTTOM off the subject. Default 0. */
  readonly lineBottomLiftPx?: number;
};

// @types/engine/subsystems/Label2DProducer.d.ts
export type Label2DProducer = {
  readonly id: string;
  produceLabels(state: EngineState, ctx: ReadyFrameContext): Label2DProducerOutput;
};

// @types/engine/subsystems/Label2DProducerOutput.d.ts
export type Label2DProducerOutput = {
  readonly labels: readonly Label2D[];
  readonly awake: boolean;
};

// @types/rendering/Label3D.d.ts
export type Label3D = {
  readonly id: string;
  readonly text: string;
  readonly font: FontId;
  readonly placement: Label3DArcPlacement;
  /** Em height in Mpc — a fixed PHYSICAL size. No pixel clamps, by design. */
  readonly emMpc: number;
  /** Copies evenly spaced around the arc; 1 = a single instance. */
  readonly repeatCount: number;
  /** Straight RGBA fill. Single-band MSDF — no outline (see §9.2). */
  readonly color: Vec4;
  /** Multiplier in [0,1]. Default 1. */
  readonly fadeAlpha?: number;
};

// @types/rendering/Label3DArcPlacement.d.ts
export type Label3DArcPlacement = {
  /** Centre of the circle the text runs along, in world space. */
  readonly center: Vec3;
  /** Unit normal of the circle's plane; also the text's local "up". */
  readonly planeNormal: Vec3;
  /** Unit in-plane direction of angle 0. MUST be perpendicular to planeNormal. */
  readonly referenceDir: Vec3;
  readonly radiusMpc: number;
  /** Angle of the first repeat's pen centre, measured from referenceDir. */
  readonly startAngleRad: number;
};

// @types/engine/subsystems/Label3DProducer.d.ts
export type Label3DProducer = {
  readonly id: string;
  produceLabels3D(state: EngineState, ctx: ReadyFrameContext): Label3DProducerOutput;
};

// @types/engine/subsystems/Label3DProducerOutput.d.ts
export type Label3DProducerOutput = {
  readonly labels: readonly Label3D[];
  readonly awake: boolean;
};

// @types/engine/subsystems/MarkerProducer.d.ts
export type MarkerProducer = {
  readonly id: string;
  produceMarkers(state: EngineState, ctx: ReadyFrameContext): readonly StructureMarkerDescriptor[];
};
```

`Label3DArcPlacement`'s handedness is load-bearing and must be stated at the
type: the renderer derives the in-plane binormal as
`cross(planeNormal, referenceDir)`. With `referenceDir = GAL_X_EQ` and
`planeNormal = GAL_Z_EQ`, that reproduces `GAL_Y_EQ` exactly
(`GAL_X × GAL_Y = GAL_Z`, right-handed) — which is what preserves the sign
derivation the current shader documents at
`shaders/zoneOfAvoidance/label/vertex.wesl:6-9` (glyphs anchor at
`angle − arcRad`, not `+`, so the text reads left-to-right rather than
mirrored).

`awake` on `Label3DProducerOutput` has exactly one member today and that member
returns `false` (§8). It is kept so both walkers have the same contract and the
wake fold has one shape; the alternative — a `void` walker — saves one field and
one `||` and would have to be reintroduced by the first producer whose text
animates. Recorded as a judgement call, not an oversight.

## 4. The Label2D director: one factory, two instances

`createLabelDirectorSubsystem()` (zero-arg, `labelDirectorSubsystem.ts:125`)
becomes `createLabel2DDirector(config: Label2DDirectorConfig)`. Two instances:

| handle                            | slab  | renderers attached                                             |
| --------------------------------- | ----- | -------------------------------------------------------------- |
| `labelDirector` (incumbent)       | COSMO | `labelRenderer`, `markerLineRenderer`                          |
| `foregroundLabelDirector` (new)   | NEAR0 | `foregroundLabelRenderer`, `foregroundMarkerLineRenderer`      |

The NEAR0 handle is named `foregroundLabelDirector`, not `captionDirector`, so
it matches the renderer pair it drives (`foregroundLabelRenderer` /
`foregroundMarkerLineRenderer`) and the layer it feeds
(`foregroundLabelsLayer`). Both are `EngineSubsystemHandles` fields, keyed in
their own domain (#12); `attachRenderers` is called from `initGpu.ts` and
re-called from `buildSwapRenderers.ts` for both, exactly as the incumbent is
today.

Capacity and occlusion mode stay renderer-side, unchanged, on the existing
`GPU_HANDLE_ROWS` entries (`gpuHandleRegistry.ts:114-176`): `labelRenderer` at
default capacity with `occludeAgainstDepth: 'coverage'`,
`foregroundLabelRenderer` at `FOREGROUND_LABEL_CAPACITY` with `'compare'`. The
director never sees either.

### 4.1 The pipeline

Five stages, one implementation, in this order:

```
merge (poll producers, concat)
  → project (one projection per label, via config.project)
  → declutter (config.declutter)
  → envelope (config.envelope)
  → lift (config.lift, when non-null)
  → signature + flush (setLabels / setLines)
```

This ordering is what both incumbents already do. COSMO:
declutter (`labelDirectorSubsystem.ts:457`) → envelope (`:462`) → flush
(`:468-473`), with the lift done inside its producers. NEAR0: declutter
(`foregroundLabelsLayer.ts:278-283`) → envelope (`:304-320`) → lift
(`:330-418`) → flush (`:420`). Running `lift` last is therefore neutral for
both: COSMO's is a no-op (`config.lift === null`), NEAR0's operates on exactly
the set it operates on today.

### 4.2 The config type

```ts
// @types/engine/subsystems/Label2DDirectorConfig.d.ts
export type Label2DDirectorConfig = {
  readonly id: string;
  /** Resolves this frame's projection for the director's slab. Memoised per ctx. */
  readonly project: (ctx: ReadyFrameContext) => Label2DProjection;
  readonly declutter: Label2DDeclutterPolicy;
  readonly envelope: Label2DEnvelopePolicy;
  /** `null` STATES the stance — not optional, so a third instance must decide. */
  readonly lift: Label2DLiftPolicy | null;
};

// @types/rendering/Label2DProjection.d.ts
export type Label2DProjection = {
  /** Placement matrix — f64 where the slab has one (NEAR0). */
  readonly vp: Float32Array | Float64Array;
  /** The same matrix narrowed for the renderer upload. */
  readonly vpF32: Float32Array;
  readonly viewportPx: Vec2;
};

// @types/engine/subsystems/Label2DDeclutterPolicy.d.ts
export type Label2DDeclutterPolicy =
  | { readonly mode: 'bboxOverlap'; readonly padPx: number }
  | { readonly mode: 'screenSeparation'; readonly minSeparationPx: number };

// @types/engine/subsystems/Label2DEnvelopePolicy.d.ts
export type Label2DEnvelopePolicy =
  | { readonly mode: 'smoothstepRamp'; readonly durationMs: number }
  | { readonly mode: 'exponentialApproach'; readonly tauMs: number; readonly settleEps: number };

// @types/engine/subsystems/Label2DLiftPolicy.d.ts
export type Label2DLiftPolicy = {
  /** Slab index whose `farMpc` the anchor clamp reads. */
  readonly slab: number;
  readonly farClampFraction: number;
};
```

Both policy unions discriminate on `mode` and carry the whole algorithm, not a
tuning parameter: each arm is one of the two implementations that exist today,
lifted into the director as data.

### 4.3 The two instance configs, and why each knob is behaviour-neutral

```ts
const COSMO_LABEL_DIRECTOR: Label2DDirectorConfig = {
  id: 'labels',
  project: cosmoLabelProjection,
  declutter: { mode: 'bboxOverlap', padPx: 8 },
  envelope: { mode: 'smoothstepRamp', durationMs: 300 },
  lift: null,
};

const FOREGROUND_LABEL_DIRECTOR: Label2DDirectorConfig = {
  id: 'foreground-labels',
  project: near0LabelProjection,
  declutter: { mode: 'screenSeparation', minSeparationPx: 48 },
  envelope: { mode: 'exponentialApproach', tauMs: 100, settleEps: 0.005 },
  lift: { slab: NEAR0, farClampFraction: NEAR0_FAR_CLAMP_FRACTION },
};
```

| knob                | COSMO value                                       | NEAR0 value                                                     | neutrality argument                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project`           | `ctx.vp`, `ctx.canvasSize`                        | `rebaseViewProj(ctx.slabs[NEAR0].vp, ctx.drawCamPos)` in f64     | Identical inputs to today: `labelDirectorSubsystem.ts:235` reads `ctx.vp`; `foregroundLabelsLayer.ts:174` rebases the slab's f64 `vp` about `view.camPos`, and `slabViewOf` derives `camPos`/`viewportPx` from `ctx.drawCamPos`/`ctx.canvasSize` (`slabs.ts:222-232`), so `ctx` alone is sufficient.       |
| `declutter.mode`    | `bboxOverlap`, pad 8 px                           | `screenSeparation`, 48 px                                        | `DECLUTTER_PAD_PX = 8` (`labelDirectorSubsystem.ts:99`) and `STAR_CAPTION_MIN_SEPARATION_PX = 48` (`foregroundLabelsLayer.ts:46`) move verbatim. Both algorithms already rank by one descending number; §4.5 pins that number.                                                                            |
| `envelope.mode`     | `smoothstepRamp`, 300 ms                          | `exponentialApproach`, τ = 100 ms, ε = 0.005                     | `ENVELOPE_MS = 300` (`:107`) and `CAPTION_ENVELOPE_TAU_MS`/`SETTLE_EPS` (`foregroundLabelsLayer.ts:51,55`) move verbatim. The arms differ in three ways, all preserved — §4.6.                                                                                                                            |
| `lift`              | `null`                                            | NEAR0 far plane × `NEAR0_FAR_CLAMP_FRACTION`                     | COSMO's producers lift inside themselves today and continue to; NEAR0's lift block moves whole, including the anchor clamp and the em rescale.                                                                                                                                                            |

**Flagged asymmetry, adjudicated.** The config is shaped 2 × 2 × 2 but only two
of the eight combinations are instantiated, and the same instance picks both
policy arms — one discriminant wearing two hats, which `entanglement-radar`
would flag on sight. Collapsing to a single `flavour: 'cosmo' | 'near0'` knob
would be smaller *today* and would re-braid the two axes: dropping one envelope
arm later (the stated future convergence) would then require touching the
declutter too. Two independent unions is the shape that lets each axis converge
on its own. The **second-special-case trigger** is a third director instance: at
that point either a combination other than the two above appears (the unions
were right) or it does not (collapse to one flavour). Recorded so it is decided
on evidence rather than re-argued.

### 4.4 The lift stage

The lift runs after the envelope, over survivors only, and does exactly what
`foregroundLabelsLayer.ts:330-418` does today:

1. Clamp the anchor's length to `slab.farMpc × farClampFraction`
   (`clampVec3Length`) — the ill-conditioned-inverse guard whose full rationale
   lives at `:343-354` and moves with the code.
2. Rescale `worldEmMpc` by the clamp ratio read off the clamp's output, so
   `em / clip.w` is preserved (`:358-373`).
3. `liftedLabelPlacement({ anchorWorldPos, vp, viewportPx, subjectSizePx,
   textBbox: renderer.measure(label), worldEmMpc, minPixelSize, maxPixelSize,
   lineBottomLiftPx })`.
4. `placement === null` (behind camera) → emit unlifted, no leader (`:395-398`).
5. Otherwise rewrite `worldPos`/`worldEmMpc` and fill `leader`.

Two consequences worth stating:

- The `label.kind === 'constellation'` branch at `:338-341` **dies**. A
  constellation caption skips the lift by not carrying `lift`, so the skip is
  the absence of data instead of a kind test inside the placement loop.
- `leader` is producer-filled on COSMO (famous, Milky Way) and director-filled
  on NEAR0. One field, one renderer path, two fill sites. That asymmetry is the
  residue of where the lift lives, and it is the thing a later rung would
  converge by moving COSMO's lift into its director too — which is possible,
  because a producer measuring through `state.gpu.labelRenderer?.measure` is
  already established (`produceFamousLabels.ts:297`). **Confirmed at the
  2026-08-21 review**: the director keeps the lift. Survivors-only
  ordering — the lift must run after declutter/envelope, across every
  producer's output, not one producer's — is the load-bearing argument over
  the producer-side counter-evidence. Nothing downstream in this spec depends
  on which way it goes beyond which file the lift code lands in.

### 4.5 One projection, one rank key

The director projects each label once per frame into
`{ screenPx: Vec2 | null; clipW: number; onScreen: boolean }` — the arithmetic
currently inlined at `labelDirectorSubsystem.ts:240-253`, which subsumes
`projectToScreenPx`. Both declutter arms read that record:

- `bboxOverlap` additionally needs `clipW` to reproduce the vertex shader's em
  clamp on the CPU (`:262-275`) before testing padded rect intersection.
- `screenSeparation` needs only `screenPx`, and feeds
  `declutterByScreenSeparation` unchanged.

Both arms sort by **`prominencePx` descending, stable on input order**. That is
already true of the COSMO arm. For the NEAR0 arm, the composed score
`CAPTION_PRIORITY[kind] × CAPTION_TIER_SCALE + min(subjectSizePx, SCALE − 1)`
(`foregroundLabelsLayer.ts:271-277`) is computed **in the caption producer** and
emitted as that label's `prominencePx`, so the tier table and the tier-dominance
composition stay producer content and the director keeps one rank contract. The
raw apparent size the lift needs travels separately, on `lift.subjectSizePx` —
the two facts are distinct today (`Entry.subjectSizePx` vs the composed
`priorityPx`) and stay distinct.

`projectToScreenPx` keeps its `starPointsLayer` pick caller. Its header claims
the caption declutter is its other caller and that the two must agree; that
claim needs re-pointing at the director's projector in the same commit — the
arithmetic is the same, the sentence is not.

### 4.6 The two envelope arms, stated precisely

They differ on three axes, and all three are preserved:

| axis           | `smoothstepRamp` (COSMO)                                                                                   | `exponentialApproach` (NEAR0)                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| target         | binary presence: 1 while emitted-and-surviving, 0 otherwise                                                | continuous: the label's own `fadeAlpha` when surviving, 0 when culled or absent                                            |
| seed           | new id starts at 0 and ramps up                                                                            | new id seeds **at** target — only changes animate (`foregroundLabelsLayer.ts:285-289`)                                       |
| absence        | remember the last emission and keep flushing it until the ramp hits 0, then drop                           | drop immediately; the producer is expected to keep emitting a caption at target 0 while it eases out                          |
| curve          | `startAlpha + (target − startAlpha) · smoothstep(elapsed / durationMs)`, closed-form on `ctx.nowMs`        | `prev + (target − prev) · (1 − exp(−dt / tauMs))`, with the settle snap at `settleEps` that lands exactly on target          |

The absence rule is why the caption producers must emit **every** candidate
caption, including ones whose target is 0 — as `entries` does today
(`foregroundLabelsLayer.ts:192-259`, where a zero-target caption is still an
entry). The director then skips flushing any label whose post-envelope alpha is
0, which is the `if (alpha > 0)` at `:312`. Getting this wrong in either
direction is a visible regression: emitting only non-zero targets makes a
caption pop out instead of easing; giving the exponential arm the smoothstep
arm's remembered-emission rule makes a constellation slot unload fade out where
it currently cuts.

The exponential arm keeps its own frame clock (`captionClockMs`, `:58`) as
director-instance state — `dt` is a delta, unlike the closed-form arm. Both are
pure functions of `ctx.nowMs`, so a stepped recorder clock still replays
identically.

## 5. Producer extraction map

### 5.1 What moves out of `foregroundLabelsLayer`

| content                                                                          | current lines | lands in                                                              |
| -------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| `sceneBodyLabels` memo on the body-state snapshot                                | `:73-85`      | `produceSceneBodyCaptions` (module-level memo, unchanged shape)       |
| per-body rebase + `apparentSizePx` + `CAPTION_FADE_RULES` target derivation      | `:192-225`    | `produceSceneBodyCaptions`                                            |
| `sgrAStarCaptionTarget` demand term                                              | `:137-139`    | `produceSceneBodyCaptions` (as emission, not as a gate)               |
| composed declutter score (`CAPTION_PRIORITY × TIER_SCALE + size`)                | `:271-277`    | `produceSceneBodyCaptions`, emitted as `prominencePx`                 |
| `LEADER_LINE_BOTTOM_GAP_PX` bottom-lift term                                     | `:386-388`    | `produceSceneBodyCaptions`, emitted as `lift.lineBottomLiftPx`        |
| `constellationCaptions` memo on artifact identity                                | `:88-108`     | `produceConstellationCaptions`                                        |
| `constellationLayerOpacity` × `resolveLayerOpacity({kind:'constellations'})`      | `:233-242`    | `produceConstellationCaptions` (unchanged composition)                |
| origin-distance vs orbit-distance distinction for the constellation band         | `:236-238`    | `produceConstellationCaptions` (the comment moves with it)            |
| the NEAR0 f64 rebase                                                             | `:167-175`    | `near0LabelProjection` (shared, memoised per `ctx`)                   |
| declutter call                                                                   | `:261-283`    | director, `screenSeparation` arm                                      |
| temporal envelope + `captionAlpha` map + id-universe prune                       | `:57-71`, `:285-328` | director, `exponentialApproach` arm                            |
| anchor far-clamp, em rescale, `liftedLabelPlacement`, leader emission            | `:330-418`    | director, lift stage                                                  |
| `scheduler.requestRender()`                                                      | `:439`        | **deleted** — the director's vote replaces it (§8)                    |

Both producers register on `foregroundLabelDirector`. Registration order sets
only the equal-`prominencePx` tiebreak, as the COSMO comment at
`engine.ts:535-540` already records; body captions register first, matching
today's entry order (`entries` gets bodies then constellations).

### 5.2 What the thin layer keeps

```ts
export const foregroundLabelsLayer: ContentLayer = {
  name: 'foreground-labels',
  slab: NEAR0,
  target: 'swap',
  blend: 'over',

  enabled(state) {
    const renderer = state.gpu.foregroundLabelRenderer;
    return renderer !== null && renderer.glyphCount() > 0;
  },

  draw(pass, view, ctx, state) {
    // …resolve the shared NEAR0 projection, the depth view, draw lines then labels…
  },
};
```

- `enabled` is the `labelsLayer` shape (`labelsLayer.ts:50-53`): non-null
  renderer AND a non-empty glyph set. The 30-line demand summary at
  `:116-155` — body gate, Sgr A* gate, constellation gate, envelope tail —
  disappears, because the director has already decided what is on screen by the
  time the layer's gate is read. The "gating on `glyphCount() === 0` latches
  false forever" landmine at `:119-122` does not survive the move and its
  comment must not be carried over: it describes a layer that uploaded inside
  its own `draw`. Under the director the upload happens in `runFrame`, before
  the frame program walks, so the gate reads this frame's real demand. **This is
  the one place where an incorrect port silently blanks every caption**; §12
  pins it with a test.
- `draw` keeps: the shared NEAR0 projection lookup (for `vpF32`), the
  `renderedTargets.has('foreground:0')` depth guard (`:426-428`), and the
  lines-before-labels draw order with its null-line-renderer tolerance
  (`:430-436`).

## 6. The fade wire (#18 D12)

Rung 7 ruled that `starCatalogLabel` and `bodyLabel` register fade handles no
production code reads, that their intent path works through the settings leaf,
and that **rung 8 owns the wire** because finishing it means teaching code rung 8
deletes. Here it is.

**Where.** In `produceSceneBodyCaptions`, per caption, composed by hand — the
per-instance-producer bucket of #18 D8 rule 3, and the same shape the three
existing per-instance producers use (#18 D10):

```
target = ruleGate × bandTarget × fades.opacityOf(handle, now) × clipFactor
```

where

- `handle` is the caption kind's fade id — `{kind:'labelLayer', layer:'body',
  item: <BodyId>}` for `sun` / `earth` / `planet` / `sgrAStar`,
  `{kind:'labelLayer', layer:'starCatalog', item:'famousStar'}` for `star`;
- `clipFactor` is `clipPlayer.clipOpacityOf('bodyLabel' | 'starCatalogLabel',
  now)`, hoisted **out** of the per-caption loop (there are exactly two literals
  and they are constant across the frame), exactly as
  `produceStructureMarkers.ts:65` and `produceFamousLabels.ts:218` hoist theirs.

**Why hand-composed and not `resolveLayerOpacity`.** The registry handle is
per-ITEM (one per body id) while the clip key is per-LAYER; the canonical helper
would re-derive and re-read the clip channel once per caption instead of once
per producer. Recession is provably absent rather than assumed: both
`RECESSION_BY_LABEL_LAYER.starCatalog` and `.body` are `undefined`
(`focusRecession.ts:47-48`), a documented stance — the near field owns its own
dimming authority — so `focusRecession` would return exactly 1. #18 D8's warning
("rung 8 must not inherit 'raw ⇒ recession is 1' as a rule") is respected: this
is a per-row read of the table, not a generalization.

**How the handle reaches the producer.** `CAPTION_FADE_RULES` grows one required
field, `fadeHandle: FadeId | null`. Required rather than optional, so a new
`CaptionKind` must state its stance — the discipline #18 D2 used for
`VISIBILITY_ACTION_ROW.writes`, and the same reason the table is already a total
`Record<CaptionKind, …>`. Five rows carry a handle; the `constellation` row is
`null` and pairs with its existing `fadeTarget: PRODUCER_SUPPLIED`, because
`produceConstellationCaptions` already composes
`resolveLayerOpacity({kind:'constellations'})` into its own target
(`foregroundLabelsLayer.ts:235`) and a second multiply would double-count. This
is not the single-row optional field #10 bans: it names a capability the family
shares, with one row declaring it does not participate.

**What changes for the user.** Two things, both sanctioned:

1. `fade(['starCatalogLabel'], …)` and `fade(['bodyLabel'], …)` in a clip now
   dim the captions. Today they are inert. No shipped clip scripts either key
   (unlike #18 D9's `cosmicFlows` case), so this arms a capability rather than
   changing a tuned beat.
2. Toggling a body's or the star map's Labels switch now rides the fade
   registry's ramp instead of cutting the caption's target to 0 and letting the
   100 ms caption envelope ease it out. The gate keeps emitting while the tail
   runs — `rule.labelEnabled(settings) || fades.opacityOf(handle, now) > 0`,
   the `produceMilkyWayLabel.ts:48` and `produceFamousLabels.ts:174-179` idiom —
   so the fade-out completes instead of truncating. This is a **feel** change of
   the toggle, not a correctness one; §14's smoke list calls it out for the
   user's eye, and per `simplicity.md`'s landing rule a "worse" verdict parks
   this commit rather than being argued past.

**What dies.** The two LANDMINE lines at `fadeLayers.ts:110,123`. Deleted, not
re-pointed — the completion record is the git log plus this spec. `FADE_LAYERS`
rows and `VisibilityLayerKey` membership are untouched (#18 D12 already ruled
against narrowing the manifest, and `LAYER_GROUPS.labels`' totality depends on
both keys existing).

## 7. Markers

`MarkerProducer` is the thinnest of the four contracts: merge and flush. No
declutter (rings are world-sized and overlap meaningfully), no envelope (alpha
is pre-baked into the descriptor by design — `StructureMarkerDescriptor.d.ts:43-47`),
no wake vote (#15 D10 already closed that half: the producer's ramps ride
`fades.isAnyAnimating` and its apparent-size fades ride camera motion).

**Registration is compile-time data, not a runtime `register` call.**

```ts
// src/services/engine/presentation/markerProducers.ts
export const MARKER_PRODUCERS: readonly MarkerProducer[] = [
  { id: 'structureMarkers', produceMarkers: produceStructureMarkers },
];
```

and a walker beside it:

```ts
// src/services/engine/frame/runMarkerProducers.ts
export function runMarkerProducers(
  state: EngineState,
  ctx: ReadyFrameContext,
): readonly StructureMarkerDescriptor[];
```

`runFrame.ts:666-669` becomes `setMarkers(runMarkerProducers(state, ctx))`
behind the same null-renderer guard.

A runtime registry (a `markerDirector` subsystem with `registerProducer`) was
considered and rejected: it would need an `EngineSubsystemHandles` field, a
teardown row, an `engine.ts` registration block and an ordering contract, for a
set that is fixed at compile time and has one member. The rungs have declined
exactly this three times (#13, #14 D4, #15 D1) on the same test. A module-level
array is plain data a hand-written walker maps over, which is the legal side of
#16 D2's line.

**The emit-all-then-discard contract survives unchanged.** The merged order must
stay `structureStore.all()` order per category, because the ring pick path
resolves `@builtin(instance_index)` through `byCategory(cat)[structureIndex]`
(`produceStructureMarkers.ts:20-29`). With one producer, concatenation preserves
it trivially; the walker must not sort, filter or dedupe, and its header says so.
A second marker producer would have to answer the index-alignment question
before it could join — that is the second-special-case trigger for opening the
descriptor type, recorded in §1's non-goals.

This closes the shadow-producer half of `current-contracts-map.md:190`'s marker
🔴 that #15 D10 left open.

## 8. Wake

One line changes at `runFrame.ts:642`:

```ts
const cosmoLabelsAnimating = state.subsystems.labelDirector.runFrame(state, ctx);
const nearLabelsAnimating = state.subsystems.foregroundLabelDirector.runFrame(state, ctx);
const label3DAnimating = runLabel3DProducers(state, ctx);
const labelsAnimating = cosmoLabelsAnimating || nearLabelsAnimating || label3DAnimating;
```

Three statements, then one OR — **not** `a() || b() || c()`. Each `runFrame`
**flushes GPU buffers** as a side effect, and `||` short-circuits, so the inline
form would skip a sibling's flush the moment the first director voted `true`.
§12 pins this with a test.

Nothing else moves. `shouldKeepTicking`'s `anim` bag already carries
`labelsAnimating` as a required field on an inline structural type
(`shouldKeepTicking.ts:121`) — no `.d.ts` exists to edit, and the field's meaning
widens from "the director" to "the label mechanisms", which its docblock at
`:66-69` records. This is the growth #15 D1 sanctioned ("the bag **is** the
seam, and extending it is growth"), and it discharges #15 D6: the caption ramp
now rides the vote rung 5 minted, rather than needing the per-row channel #15 D6
declined to build.

`runLabel3DProducers` returns `false` today (§3.2). It stays in the expression
so the walker's contract matches the directors' and the fold has one shape.

## 9. GPU

### 9.1 `label3DRenderer`

A new shared renderer at
`src/services/gpu/renderers/labels3d/label3DRenderer.ts`, with one
`GPU_HANDLE_ROWS` entry:

```ts
{ key: 'label3DRenderer',
  construct: (_state, deps) =>
    createLabel3DRenderer(deps.ctx.device, HDR_TARGET_FORMAT, deps.fontAtlases) }
```

No `rebuildOnSwapFormat` — it draws into HDR (`rgba16float`), not the swap
chain, so it is not one of the eight swap rows.

Surface, mirroring `LabelRenderer`'s shape:

```ts
export type Label3DRenderer = Renderer & {
  setLabels(labels: readonly Label3D[]): void;
  draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2): void;
  glyphCount(): number;
  destroy(): void;
};
```

Buffers, following `labelRenderer`'s proven split:

- **Per-label storage buffer** (`@group(0) @binding(1)`), one record per label:
  `center` + `radiusMpc`, `planeNormal` + `emMpc`, `referenceDir` +
  `startAngleRad`, `color`, `fadeAlpha` + `repeatCount`. This is what makes the
  renderer multi-label rather than a one-off; the current ZoA pipeline bakes all
  of it into shader constants and a construction-time uniform.
- **Per-glyph instance buffer**, rebuilt in `setLabels`: `localOffset`,
  `localSize` (both **atlas px**, converted to Mpc in the vertex stage via the
  label's `emMpc`, unlike today's construction-time bake at
  `zoneOfAvoidanceRenderer.ts:266-289`), `uvRect`, `labelIndex`, `repeatIndex`,
  `fontIndex`.
- **Shared unit-quad corner buffer** (`lib/unitQuad`) and the `texture_2d_array`
  atlas + sampler at `@group(0) @binding(2)/(3)`, the same bindings
  `labelRenderer` uses — which is what lets the fragment stage import
  `lib::msdf` (§9.3) instead of copying it. Multi-font falls out; the current
  ZoA path is hard-wired to `FONT_IDS[0]`
  (`zoneOfAvoidanceRenderer.ts:175`).

Vertex stage, generalizing `shaders/zoneOfAvoidance/label/vertex.wesl`:

```
binormal = cross(planeNormal, referenceDir)          // = GAL_Y_EQ for the ZoA instance
theta    = startAngleRad + repeatIndex · 2π/repeatCount − localOffset.x·mpcPerAtlasPx / radiusMpc
lat      = −localOffset.y·mpcPerAtlasPx / radiusMpc
dir      = cos(theta)·referenceDir + sin(theta)·binormal
tangent  = −sin(theta)·referenceDir + cos(theta)·binormal
xAxis    = −tangent ;  yAxis = planeNormal
world    = center + radiusMpc·(dir + lat·yAxis) + xAxis·cornerX − yAxis·cornerY
```

With `center = [0,0,0]`, `referenceDir = GAL_X_EQ`, `planeNormal = GAL_Z_EQ`,
`startAngleRad = 0`, `repeatCount = 3` and `emMpc = 2`, this reduces to today's
expression term for term. The per-glyph flat-basis approximation (one `bandAxes`
evaluation per glyph, not per corner) is preserved and its comment moves with
it. The three `GAL_*_EQ` constants stay in `lib/util.wesl` — `worldToGalactic`
still uses them — but the label vertex stage stops importing them; the basis
arrives as uniform data.

Blend: `ADDITIVE_BLEND`, and the reason must move with the pipeline. The
Apple-Silicon dst-alpha coherency landmine documented at
`shaders/zoneOfAvoidance/label/fragment.wesl:3-7` (OVER's dst-alpha read across
`pass.end`/`pass.begin` splits on the HDR target) is the reason this text is
additive while the 2D labels are premultiplied OVER; it belongs in the new
fragment shader's header verbatim.

### 9.2 The draw site stays pinned

`zoneOfAvoidanceUpsampleLayer`'s `postBlit` keeps drawing the lettering at full
res into HDR, after the reduced-res band blit — MSDF text at reduced res blurs
past legibility, which is why rung 2 minted the hook. State it honestly: **the
mechanism flushes, the pass draws.** The producer/director split moves the
decision of *what* text exists and *at what alpha*; it does not move *where* the
draw is recorded, and it does not try to.

The `postBlit` gets thinner, not fatter:

```ts
postBlit(pass, view, _ctx, state) {
  const r = state.gpu.label3DRenderer;
  if (r === null || r.glyphCount() === 0) return;
  r.draw(pass, view.vp, view.viewportPx);
},
```

The second `deriveZoneOfAvoidanceLiveness` call and the `settings.zoneOfAvoidance`
/ `LABEL_RADIUS_MPC` reads move into the producer. The layer header's contract —
"`postBlit` guards itself independently of the blit handle; the blit and the
caption must never suppress each other" — is preserved by the null + glyph-count
guard, and must be re-stated rather than dropped.

`LABEL_RADIUS_MPC = 40` (`zoneOfAvoidanceUpsampleLayer.ts:18`) and
`LABEL_EM_MPC = 2` (`zoneOfAvoidanceRenderer.ts:57`) move into
`produceZoneOfAvoidanceLettering` as `placement.radiusMpc` and `emMpc`. Both are
flagged in-code as visual-pass placeholders; they stay placeholders, in one file
instead of two.

### 9.3 `lib/msdf.wesl` (PR A)

`shaders/labels/fragment.wesl:43-76` holds `median3` and `shadeMsdf`, and
`fragmentOcclude.wesl` already imports `shadeMsdf` from it so glyph colour has
one source of truth. `zoneOfAvoidance/label/fragment.wesl:16-18` holds a
verbatim second `median3` and a single-band inlining of the same shading.

PR A extracts the shared body into `src/services/gpu/shaders/lib/msdf.wesl`:

```
@group(0) @binding(2) var atlas: texture_2d_array<f32>;
@group(0) @binding(3) var atlasSampler: sampler;

fn median3(r: f32, g: f32, b: f32) -> f32
fn shadeMsdf(uv: vec2<f32>, fontIndex: u32,
             color: vec4<f32>, outlineColor: vec4<f32>, outlineSdf: f32) -> vec4<f32>
```

Two constraints pinned, because both are easy to get wrong:

- **The lib module owns the bindings.** A WESL lib module may declare
  `@group`/`@binding` — `lib/sceneDepth.wesl:48` and `lib/mipBlit.wesl:25-26`
  already do, and `fragmentOcclude.wesl` already imports the former. Moving the
  atlas pair into the lib is what makes the binding slots a shared contract that
  `label3DRenderer`'s BGL must honour; leaving them in `labels/fragment.wesl`
  would force `shadeMsdf` to take a sampled `vec3` instead and split the
  function.
- **`shadeMsdf` takes scalars, not `VsOut`.** The incumbent takes
  `input: VsOut` from `labels::io`; a lib function must not import a consumer's
  IO module. `labels/fragment.wesl` keeps a one-line `fs` entry that unpacks its
  `VsOut` into the call, and `fragmentOcclude.wesl`'s two entries do the same
  after their discard gate.

ZoA's copy is **not** rewired in PR A — PR B deletes the file. Rewiring it first
would be two edits to reach the same delete.

PR A's verification is a shader-compile smoke: the linker is the only thing that
can catch a mis-scoped binding or a duplicated declaration, and the failure mode
is a runtime `Invalid ShaderModule`, not a type error. Run the app (or the tint
probe) and confirm labels still render before the commit lands.

### 9.4 What dies

- `zoneOfAvoidanceRenderer.drawLabels` and everything it owns:
  `ZONE_OF_AVOIDANCE_LABEL_UNIFORM_BUFFER_SIZE`, `LABEL_EM_MPC`,
  `LABEL_GLYPH_INSTANCE_BYTES`, the label pipeline/BGL/bind group, the
  construction-time `layoutLabel` bake, the private atlas texture + sampler +
  its `copyExternalImageToTexture`, the label uniform scratch, and the four
  label `destroy()` lines (`zoneOfAvoidanceRenderer.ts:45-46,57,60,168-334,479-511`).
- `src/services/gpu/shaders/zoneOfAvoidance/label/{vertex,fragment,io}.wesl`.
- The `atlases: LoadedFontAtlases` third constructor parameter, and with it the
  family-A outlier row that `renderer-layer-outliers.md:26` opened for
  `zoneOfAvoidanceRenderer`. Its `GPU_HANDLE_ROWS` row
  (`gpuHandleRegistry.ts:224-227`) drops `deps.fontAtlases`.
- `ZoneOfAvoidanceRenderer.drawLabels` from the `.d.ts`.
- The second copy of the atlas texture in GPU memory: the ZoA path uploads its
  own `rgba8unorm` page of `FONT_IDS[0]` today; the shared renderer binds the
  atlases `labelRenderer` already holds.

## 10. File inventory (indicative — the plan confirms exact paths)

**New**

```
src/@types/rendering/Label2DLeader.d.ts
src/@types/rendering/Label2DLift.d.ts
src/@types/rendering/Label2DProjection.d.ts
src/@types/rendering/Label3D.d.ts
src/@types/rendering/Label3DArcPlacement.d.ts
src/@types/rendering/Label3DRenderer.d.ts
src/@types/engine/subsystems/Label2DDirectorConfig.d.ts
src/@types/engine/subsystems/Label2DDeclutterPolicy.d.ts
src/@types/engine/subsystems/Label2DEnvelopePolicy.d.ts
src/@types/engine/subsystems/Label2DLiftPolicy.d.ts
src/@types/engine/subsystems/Label3DProducer.d.ts
src/@types/engine/subsystems/Label3DProducerOutput.d.ts
src/@types/engine/subsystems/MarkerProducer.d.ts
src/services/engine/presentation/produceSceneBodyCaptions.ts
src/services/engine/presentation/produceConstellationCaptions.ts
src/services/engine/presentation/produceZoneOfAvoidanceLettering.ts
src/services/engine/presentation/markerProducers.ts
src/services/engine/presentation/label3DProducers.ts
src/services/engine/frame/runMarkerProducers.ts
src/services/engine/frame/runLabel3DProducers.ts
src/services/engine/frame/near0LabelProjection.ts
src/services/engine/frame/cosmoLabelProjection.ts
src/services/gpu/renderers/labels3d/label3DRenderer.ts
src/services/gpu/shaders/labels3d/{io,vertex,fragment}.wesl
src/services/gpu/shaders/lib/msdf.wesl                     (PR A)
```

**Moved / renamed** (via `npm run move-files` + `npm run refactor -- rename`, so
the `tests/` mirror follows)

```
@types/rendering/Label.d.ts                    → Label2D.d.ts               (PR A)
@types/engine/subsystems/LabelProducer.d.ts    → Label2DProducer.d.ts       (PR A)
@types/…/LabelProducerOutput.d.ts              → Label2DProducerOutput.d.ts (PR A)
@types/…/LabelDirectorSubsystem.d.ts           → Label2DDirector.d.ts       (PR B)
services/engine/subsystems/labelDirectorSubsystem.ts → label2DDirector.ts   (PR B)
services/engine/presentation/produceFamousLabels.ts → produceFamousGalaxyLabels.ts (PR A)
```

Filenames track their exported symbol (`Label3DRenderer` → `label3DRenderer.ts`),
per the one-symbol-per-file convention. The shader package directory stays
lowercase-conventional (`labels3d`), like its `labels` and `zoneOfAvoidance`
siblings.

**Deleted**

```
src/services/engine/subsystems/labelProducer.ts            (dead, §11.2)
src/services/gpu/shaders/zoneOfAvoidance/label/{io,vertex,fragment}.wesl
```

**Substantially changed**

```
src/services/engine/frame/passes/foregroundLabelsLayer.ts  441 → ~75
src/services/engine/frame/passes/zoneOfAvoidanceUpsampleLayer.ts
src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts  523 → ~390
src/services/engine/frame/runFrame.ts                      (:642, :666-669)
src/services/engine/engine.ts                              (:408, :547-558)
src/services/engine/phases/{initGpu,buildSwapRenderers}.ts (second attach)
src/services/engine/gpuHandles/gpuHandleRegistry.ts        (+label3DRenderer, −fontAtlases)
src/services/engine/wiring/fadeLayers.ts                   (−2 LANDMINE lines)
src/services/engine/presentation/captionFadeRules.ts       (+fadeHandle)
src/@types/rendering/{Label2D,MarkerLine,LabelRenderer}.d.ts
src/@types/engine/handles/{EngineGpuHandles,EngineSubsystemHandles}.d.ts
src/@types/rendering/ZoneOfAvoidanceRenderer.d.ts          (−drawLabels)
src/utils/camera/projectToScreenPx.ts                      (header claim only)
```

## 11. Verifications performed while writing this spec

### 11.1 Leader-line fold — PASSED, the fold is adopted

Every `MarkerLine` emitted anywhere in `src/` is owned by exactly one label.
Four emission sites, exhaustive (`rg` over `lines.push` / `lines:` /
`ownerLabelId`):

| site                                | owned?                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `produceFamousLabels.ts:307-317`    | yes — `ownerLabelId: p.id`, emitted inside the per-label loop                              |
| `produceMilkyWayLabel.ts:115-130`   | yes — `ownerLabelId: 'milkyWay'`                                                            |
| `produceStructureLabels.ts:221`     | emits no lines at all (`lines: []`)                                                        |
| `foregroundLabelsLayer.ts:406-417`  | yes structurally — id is `${label.id}-anchor`, emitted inside the per-caption emit loop, and it bypasses the director entirely so it never needed the tag |

`MarkerLine.ownerLabelId`'s own docblock already says "Lines with no owner (none
today)". The `ownerLabelId === undefined` branches at
`labelDirectorSubsystem.ts:316,392-394` are production-dead, exercised only by
`labelDirectorSubsystem.test.ts:112,398`.

So: `leader` folds onto `Label2D`; `LabelProducerOutput.lines` and
`MarkerLine.ownerLabelId` are deleted; the director synthesizes the renderer's
`MarkerLine` at flush time (id `${label.id}-anchor`, `fadeAlpha` = the label's
post-envelope alpha). `MarkerLine` itself **survives** as
`markerLineRenderer.setLines`'s input type, one field lighter. The tests that
drove the dead branches go with them, per `testing.md` — they can no longer fail
on a real bug once the branch they assert against is gone.

Three simplifications fall out: `EnvelopeEntry.lastOwnedLines` and the two walks
that maintain it disappear; the declutter's line-filter pass disappears (a culled
label takes its leader with it by construction); and the flush-signature's
separate line term collapses into the label term.

### 11.2 `subsystems/labelProducer.ts` — DEAD, delete it

The file is a docblock plus `export {}` (11 lines). `rg` for
`subsystems/labelProducer` across `src/`, `tests/` and `tools/` returns nothing.
It was left behind when the contract went type-only; the docblock's content is
already on the `.d.ts` files it points at. Deleting it is listed in §10.

## 12. Testing strategy

`tests/services/engine/frame/passes/foregroundLabelsLayer.test.ts` is 1,145
lines and 25 cases. It is the best behavioural record of the caption path, so it
is **re-homed, not rewritten** — each case moves to whichever unit now owns the
behaviour it asserts, keeping its assertions:

| current cases                                                                                                              | new home                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| the six per-toggle mutes (`:498-755`), the Sun-visibility case, the descent fade (`:818`), the neighbourhood band (`:756`) | `produceSceneBodyCaptions.test.ts` — assert emitted `fadeAlpha`     |
| the two constellation cases (`:1096`, `:1114`)                                                                             | `produceConstellationCaptions.test.ts`                              |
| priority-tier collision (`:857`)                                                                                           | `produceSceneBodyCaptions.test.ts` — assert the composed `prominencePx` ordering, plus one director case for the cull itself |
| declutter-flip easing + settle-and-go-quiet (`:880`), demand-drop tail (`:970`)                                            | `label2DDirector.test.ts`, `exponentialApproach` config             |
| rebase + draw (`:403`), leader-line rebase (`:454`), null line renderer (`:1036`), null renderer (`:1046`)                 | the thin `foregroundLabelsLayer.test.ts`                            |
| the enable-gate cases (`:316-401`)                                                                                         | **retired**, replaced by one new case — see below                   |

The enable-gate cases test a gate that no longer exists. They are replaced by
one case pinning the failure mode §5.2 names: **after a frame in which the
director flushed a non-empty set, `enabled` is true; after a frame in which it
flushed an empty set, `enabled` is false, and a subsequent frame with demand
flushes again.** That is the "latch false forever" regression in its new form —
it can only pass if the upload genuinely happens outside the layer's own `draw`.

New/changed suites:

- **`label2DDirector.test.ts`** — the existing `labelDirectorSubsystem.test.ts`
  (557 lines), reparameterized: a `describe.each` over the two configs for the
  stages that are shared (merge, signature/flush skip, null-renderer guard, the
  vote), and per-config `describe`s for the arms that differ. Both envelope arms
  need their absence rule pinned explicitly — remembered-emission for
  `smoothstepRamp`, immediate-drop for `exponentialApproach` — because swapping
  them is the most plausible port error and it is invisible in a settled frame.
- **`runMarkerProducers.test.ts`** — one case: the walker preserves producer
  order and emits every descriptor unfiltered (the pick index-alignment
  contract, §7). Not a restatement of `produceStructureMarkers`' own suite,
  which stays as-is.
- **`produceZoneOfAvoidanceLettering.test.ts`** — the placement is the galactic
  plane: `planeNormal === GAL_Z_EQ`, `referenceDir === GAL_X_EQ`, and
  `fadeAlpha` tracks `deriveZoneOfAvoidanceLiveness`. The basis values are
  imported, not restated (no constant restatement).
- **`label3DRenderer.test.ts`** — one hand-computed case: a single glyph at
  `localOffset.x = 0`, `repeatIndex = 0`, `startAngleRad = 0` lands at
  `center + radiusMpc · referenceDir`. This is a WGSL/TS parity check on the
  arc math — a `testing.md` keep-rule case — computed by hand, not by a mirror
  of the shader expression.
- **`zoneOfAvoidanceUpsampleLayer.test.ts`** — the existing case asserting
  `drawLabels(pass, viewProj, viewportPx, tuning, labelRadiusMpc, opacity)` is
  rewritten against the new `label3DRenderer.draw`, and keeps its real subject:
  a null blit handle must not suppress the lettering, and vice versa.
- **The wake fold** — one case in `runFrame`'s suite: a director voting `true`
  does not prevent its sibling's flush (§8's short-circuit trap).

What is deliberately **not** written, per `testing.md`: no test that
`Label2DProducer` has an `id` (a compile-time fact); no restatement of
`CAPTION_PRIORITY`, `MARKER_PRODUCERS` or the config literals; no
`expect(FOUR_CONTRACTS).toHaveLength(4)`; no mirror test computing the expected
lift by re-running `liftedLabelPlacement`.

## 13. Packaging

**PR A — prep, mechanical, no plan needed.** Two commits:

1. The four renames (§3.1), tool-assisted, plus the `tests/` mirror the tool
   drags along. Zero behaviour, zero logic edits — a rename tool run and a
   typecheck.
2. `lib/msdf.wesl` (§9.3): extract, rewire `labels/fragment.wesl` +
   `labels/fragmentOcclude.wesl`, leave ZoA's copy alone. Verified by a
   shader-compile smoke plus the existing label suites.

Neither commit needs a written plan: there is no design left in them and no
TDD cycle to run — the tool and the compiler are the tests. They are their own
diffs so PR B's review is not 400 lines of import churn.

**PR B — the feature.** One implementation plan covers it. The plan's task
sequence follows the dependency order: contracts + types → director
parameterization (both instances, still fed by today's producers) → caption
producers + thin layer → fade wire (its own commit, last of that group, so the
checkpoint can park it) → marker walker → Label3D renderer + producer + ZoA
deletion.

The user ruled at the ground-preparation checkpoint: PR A lands as its own
PR, sequenced before PR B (§15.10).

## 14. Definition of Done

- [ ] `npm run typecheck` and `npm test` green; the suite stays at zero
      skipped.
- [ ] Behaviour-neutral except §6's fade wire. No other user-visible change is
      intended; anything else observed is a bug, not a feature.
- [ ] `npm run perf` measured **before and after** on the same branch's dev
      server (`--url http://localhost:<this worktree's port>`), and
      **perf-neutral**. The label paths run per frame; the director's
      signature-skip and the marker walk must not regress. A neutral-or-negative
      measurement halts the landing pipeline — land/park is the user's ruling.
- [ ] No `drawLabels`, no `shaders/zoneOfAvoidance/label/`, no
      `subsystems/labelProducer.ts`, no `ownerLabelId`, no
      `LabelProducerOutput.lines` anywhere in `src/`.
- [ ] `fadeLayers.ts` carries no LANDMINE line for `starCatalogLabel` or
      `bodyLabel`.
- [ ] `foregroundLabelsLayer.ts` is under 100 lines and its `enabled` reads only
      `state.gpu`.
- [ ] A `decisions.md` entry (#19) recording: the amendment of #6's count from
      three named mechanisms to four; every ruling in §15; the two verification
      outcomes (§11); and what was **not** built (no umbrella bundle, no runtime
      marker registry, no envelope convergence, no renderer merging).
      `renderer-layer-outliers.md` §1's zoneOfAvoidanceRenderer outlier cell,
      §2's `foregroundLabelsLayer` rows and §6's rung-8 row are updated in the
      same branch that acts on them (#18 D1's discipline).
- [ ] Comment audit (`/comment-audit`) over the branch — a lot of load-bearing
      commentary moves between files here, and moved comments are the easiest
      place for a stale claim to survive. Specific claims to re-check because
      they are about to become false: `foregroundLabelsLayer`'s "gating on
      `glyphCount() === 0` latches false forever" (`:119-122`),
      `projectToScreenPx`'s "its two callers" (`:11-15`),
      `MarkerLine`'s ownership paragraph, `labelDirectorSubsystem`'s "No layer
      load-in here" and "Appear/disappear envelope" headers, and
      `zoneOfAvoidanceUpsampleLayer`'s postBlit contract.
- [ ] Visual smoke, by the user, at four poses:
      1. **Solar-system descent** — Sun / Earth / planet captions with their
         leader lines, correct stagger, correct de-collision; toggle each body's
         Labels switch and confirm the new registry-ramp fade-out reads as
         intended (§6, the one feel change).
      2. **Stellar neighbourhood** — the star map's names fade in over the band,
         Sgr A* survives past the solar-system reach, constellation figure names
         dissolve in lock-step with their lines.
      3. **Cosmic zoom** — structure rings + labels, famous-galaxy captions and
         their connectors, the "You are here" marker and its stem, all
         decluttering across producers as before.
      4. **Zone of avoidance** — three copies of the lettering on the galactic
         plane, reading left-to-right (not mirrored), same size and colour as
         before, fading with the band.
- [ ] `/feature-done` audit, then the spec and its plan relocate to
      `specs/completed/` and `plans/completed/`.

## 15. Decision record

Every item below is a user ruling from the 2026-08-20 design session. The plan
cites them by number.

1. **Four named presentation contracts**, amending decision #6's count of three:
   `Label2DProducer` (screen-billboard text, decluttered + enveloped),
   `Label3DProducer` (world-geometry text, new), `MarkerProducer` (rings/halos,
   new), `drawPick` (unchanged). The amendment is recorded in `decisions.md`.
2. **Renames**, tool-assisted, as prep: `Label` → `Label2D`, `LabelProducer` →
   `Label2DProducer`, `LabelProducerOutput` → `Label2DProducerOutput`. No
   unmarked incumbent once `Label3D` exists.
3. **One parameterized director factory, two instances.**
   `createLabel2DDirector(config)` replaces the zero-arg
   `createLabelDirectorSubsystem`; instances are `labelDirector` (COSMO) and a
   new NEAR0 caption instance. Config carries the projection strategy, the
   declutter policy union, the envelope policy union (behaviour-neutral — each
   instance keeps its exact current feel), and an optional lift config (NEAR0
   only, so `liftedLabelPlacement` moves into the director's flush path).
   Renderer capacity and occlusion stay per-instance on the existing
   `gpuHandleRegistry` rows.
4. **Captions become real `Label2DProducer`s.** `produceSceneBodyCaptions` and
   `produceConstellationCaptions` are extracted from `foregroundLabelsLayer`,
   carrying `captionFadeRules`, `captionPriority`, the Sgr A* gate and the
   apparent-size math as producer content. The layer collapses to the
   `labelsLayer` shape; the `enabled`/`draw` circularity, the module-level
   `captionAlpha` map and the private `scheduler.requestRender()` all dissolve,
   the wake riding the director's returned vote.
5. **The #18 D12 fade wire lands here.** The caption producers compose the
   `starCatalogLabel` / `bodyLabel` fade factors by hand, per #18 D8 rule 3.
   This is the rung's sanctioned behaviour change; the two LANDMINE comments in
   `fadeLayers.ts` die. Everything else is behaviour-neutral.
6. **`MarkerProducer` mints thin**, typed to the closed
   `StructureMarkerDescriptor`. Generalization to open categories waits for a
   second non-structure member — recorded as the second-special-case trigger.
   The raw `runFrame` call becomes a registered-producer walk.
7. **ZoA lettering becomes a `Label3DProducer`** with plane-agnostic arc
   placement (`center`, `planeNormal`, `referenceDir`, `radiusMpc`,
   `startAngleRad`), a fixed physical `emMpc` with no pixel clamps, and
   `repeatCount`. The galactic basis becomes producer data. A shared
   `label3DRenderer` reuses `layoutLabel`, the font atlas and the extracted MSDF
   lib; `zoneOfAvoidanceRenderer.drawLabels` and
   `shaders/zoneOfAvoidance/label/*` are deleted. **The draw site stays pinned**
   at `zoneOfAvoidanceUpsampleLayer`'s `postBlit` — full-res, additive, into HDR
   — a compositing requirement, stated honestly: the mechanism flushes, the pass
   draws.
8. **`clipPathDebug` is excluded**: a pure debug line renderer with no label
   coupling.
9. **Leader lines fold onto the label**, gated on verification. The gate passed
   (§11.1): every production `MarkerLine` is label-owned, so `leader?` moves onto
   `Label2D` and the sibling `lines` array plus `ownerLabelId` are deleted.
10. **Prep PR + feature PR.** PR A = the renames + the `lib/msdf.wesl`
    extraction (ZoA's copy not rewired — the feature deletes it). PR B = the
    feature. Prep commits are their own diffs.

Decisions made while writing this spec, put to the user at the 2026-08-21
review and confirmed:

- **`foregroundLabelDirector`** as the NEAR0 handle name (the brief's example
  was `captionDirector`), matching the renderer pair and the layer it drives.
- **Marker registration is a module-level array**, not a runtime `register`
  call on a new subsystem (§7).
- **The fade wire composes two channels, not one** — the registry handle and the
  clip key — so both the "dead handle" and the inert `fade()` are fixed, which
  makes the visibility toggle ride the registry ramp (§6, consequence 2).
- **The lift-in-the-director ruling is honoured, with counter-evidence
  recorded** (§4.4): `produceFamousLabels` already measures from inside a
  producer, so the ruling's premise is not the constraint it was taken to be.

The review added one further item, outside the four above: `produceFamousLabels`
→ `produceFamousGalaxyLabels` joins PR A's renames (§3.1) — user request,
2026-08-21.

## References

- [decisions.md](../../research/engine/decisions.md) — #6 (three→four
  mechanisms), #9/#11 (the ladder, rung 8's charter), #10 (row divergence),
  #12 (rows keyed in their own domain), #13/#14/#15/#16 (four refusals to mint a
  registry), #15 D6 (the caption wake, handed here), #17 (umbrella deferred
  until after this rung), #18 D7/D8/D10/D12 (the fade vocabulary and the wire).
- [renderer-layer-outliers.md](../../research/engine/renderer-layer-outliers.md)
  — §1 family A (ZoA's third constructor param), §2 (the `enabled`/`draw`
  inversion, the god-layer row), §4 item 1 (rung 2's `postBlit`), §6 (the rung-8
  assignment).
- [current-contracts-map.md](../../research/engine/current-contracts-map.md):190
  — the marker-path 🔴 whose shadow-producer half §7 closes.
- [simplicity.md](../conventions/simplicity.md),
  [testing.md](../conventions/testing.md),
  [comments.md](../conventions/comments.md),
  [plan-style.md](../conventions/plan-style.md).
