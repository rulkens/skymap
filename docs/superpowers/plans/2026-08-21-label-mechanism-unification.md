# Label mechanism unification (ladder rung 8) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

> **Precondition — PR A has already landed.** This plan covers **PR B only**.
> PR A (spec §13) is two mechanical commits needing no plan: the four renames
> (§3.1) and the `lib/msdf.wesl` extraction (§9.3). Every task below is written
> as if they are already on the branch, so the plan spells `Label2D`,
> `Label2DProducer`, `Label2DProducerOutput`, `produceFamousGalaxyLabels`, and
> assumes `src/services/gpu/shaders/lib/msdf.wesl` exists **with the atlas
> texture + sampler bindings (`@group(0) @binding(2)/(3)`) declared inside it**.
> If any of those five facts is false in the worktree, stop — PR A did not land.

**Goal:** Collapse the five unrelated mechanisms skymap uses to draw
world-anchored text and marker geometry down to four named, registered
contracts. `foregroundLabelsLayer`'s private re-implementation of the label
director becomes two `Label2DProducer`s behind a second instance of one
parameterized director; `runFrame`'s hand-written marker call becomes a
`MarkerProducer` walk; `zoneOfAvoidanceRenderer`'s private MSDF glyph pipeline
becomes a `Label3DProducer` feeding a shared `label3DRenderer`. Adding a label,
a marker or a piece of world lettering becomes writing a producer, not growing a
layer.

**Architecture:** `createLabelDirectorSubsystem()` becomes
`createLabel2DDirector(config)` — one five-stage pipeline (merge → project →
declutter → envelope → lift → flush) whose declutter policy, envelope policy,
projection and lift are config data, instantiated twice (COSMO's
`labelDirector`, NEAR0's new `foregroundLabelDirector`) with each instance
keeping its exact current feel. Markers and Label3D get the thinnest possible
treatment instead: a module-level producer array plus a hand-written walker
each, no runtime registry and no new subsystem handle. Leader lines fold onto
`Label2D` as an optional `leader` field, deleting the sibling `lines` array and
`MarkerLine.ownerLabelId`.

**Tech Stack:** TypeScript (Vite/Vitest), raw WebGPU + WGSL/WESL via
`wesl-plugin`, `wgpu-matrix` for the f64 NEAR0 rebase seam.

**Spec:**
[docs/superpowers/specs/2026-08-20-label-mechanism-unification-design.md](../specs/2026-08-20-label-mechanism-unification-design.md)
— the requirements authority, user-reviewed 2026-08-21, with every ruling
recorded in its §15. This plan argues from it and does not re-derive it.

## Global Constraints

Quoted verbatim from the spec, binding for every task below:

- **Behaviour-neutral except §6 (spec §1):** "Everything else is
  behaviour-neutral. The fade wire is the single sanctioned behaviour change
  (§6)." And from §14: "Behaviour-neutral except §6's fade wire. No other
  user-visible change is intended; anything else observed is a bug, not a
  feature."
- **Zero-skipped suite (spec §14):** "`npm run typecheck` and `npm test` green;
  the suite stays at zero skipped."
- **Renderer capacity/occlusion stay renderer-side (spec §4):** "Capacity and
  occlusion mode stay renderer-side, unchanged, on the existing
  `GPU_HANDLE_ROWS` entries … The director never sees either."
- **No fake unification (spec §3):** "The four do not share a row type, a
  registry or a walker. They share a vocabulary."
- **What the diff must NOT contain (spec §2.1):** "A registry with one row. A
  new subsystem handle for markers. A `LabelKind` discriminant that both the
  declutter and the envelope branch on. A `postBlit` special case. New `.d.ts`
  surface for the wake."
- **Perf-halt rule (spec §14):** "`npm run perf` measured **before and after**
  on the same branch's dev server … A neutral-or-negative measurement halts the
  landing pipeline — land/park is the user's ruling."

Plus the house-wide rules this plan inherits:

- Comment budget: module header ≤ 10 lines, comment lines ≤ half the code lines
  in the file.
- `type` aliases, never `interface`.
- One exported symbol per file in `src/utils/` and `src/@types/`; the filename
  matches the export.
- **Any file move or rename goes through `npm run move-files -- <from> <to>`
  (or `npm run refactor -- move <from> <to>`), never `git mv` + hand-edited
  imports.** ts-morph rewrites every relative import project-wide and drags the
  `tests/` mirror along; run `--dry` first. It does **not** cover `.wesl`
  `package::` imports or string-literal paths — grep for the old path
  afterwards.
- Every `.wesl` task instructs the executor to load the `wesl-shaders` skill
  before touching a shader file.
- `npm run typecheck` (both tsconfigs) and `npm test` stay green after every
  task.

---

## Strategy

The task order is spec §13's dependency order, with two refinements.

Tasks 1–2 are the "contracts + types" stage for the **Label2D** family: the
leader fold (the one data-shape change that touches all three shipped COSMO
producers) then the director's config surface and its move to `label2DDirector`.
Task 3 adds the second declutter arm, the second envelope arm and the lift
stage, and stands the `foregroundLabelDirector` instance up — an interim frame
in which it is registered and polled but has no producers. Tasks 4–5 extract the
two caption producers and collapse the layer onto them; Task 6 is the fade wire
alone, deliberately last of that group so the visual checkpoint can park one
commit without unpicking the extraction. Task 7 is the marker walk. Tasks 8–9
are Label3D: renderer + shaders first, then producer + walker + the
`zoneOfAvoidanceRenderer` deletion. Task 10 is the docs gate.

**The `MarkerProducer`, `Label3D*` and `Label3DRenderer` contract types are
minted in the tasks that first consume them (7, 8, 9), not up front with the
Label2D contracts.** Minting them in Task 1 would put eight tasks' worth of
unconsumed `.d.ts` surface on the branch, which is the speculative generality
`simplicity.md` calls a review finding. The contracts are still pinned here —
their exact shapes are quoted in the tasks below, straight from spec §3.2.

## Definition of Done

- **Deliverable inventory.** New: `src/@types/rendering/{Label2DLeader,
  Label2DLift, Label2DProjection, Label3D, Label3DArcPlacement,
  Label3DRenderer}.d.ts`; `src/@types/engine/subsystems/{Label2DDirectorConfig,
  Label2DDeclutterPolicy, Label2DEnvelopePolicy, Label2DLiftPolicy,
  Label3DProducer, Label3DProducerOutput, MarkerProducer}.d.ts`;
  `src/services/engine/presentation/{produceSceneBodyCaptions,
  produceConstellationCaptions, produceZoneOfAvoidanceLettering,
  markerProducers, label3DProducers}.ts`;
  `src/services/engine/frame/{runMarkerProducers, runLabel3DProducers,
  near0LabelProjection, cosmoLabelProjection}.ts`;
  `src/services/gpu/renderers/labels3d/label3DRenderer.ts`;
  `src/services/gpu/shaders/labels3d/{io,vertex,fragment}.wesl`. Renamed:
  `labelDirectorSubsystem.ts` → `label2DDirector.ts`,
  `LabelDirectorSubsystem.d.ts` → `Label2DDirector.d.ts`. Deleted:
  `src/services/engine/subsystems/labelProducer.ts`,
  `src/services/gpu/shaders/zoneOfAvoidance/label/{io,vertex,fragment}.wesl`.
  Two new `EngineSubsystemHandles`/`EngineGpuHandles` fields:
  `foregroundLabelDirector`, `label3DRenderer`.
- **Zero-skipped suite (spec §14).** `npm test` reports **0 skipped** — not just
  green. Several suites are re-homed here; a case that silently became `it.skip`
  during a move is the failure this gate catches. (The green/typecheck halves are
  `/feature-done`'s standing audit and are not restated.)
- **Grep gates (spec §14).** No `drawLabels`, no `shaders/zoneOfAvoidance/label/`,
  no `subsystems/labelProducer.ts`, no `ownerLabelId`, no
  `LabelProducerOutput.lines` (nor `Label2DProducerOutput.lines`) anywhere in
  `src/`. `fadeLayers.ts` carries no LANDMINE line for `starCatalogLabel` or
  `bodyLabel`. `foregroundLabelsLayer.ts` is under 100 lines and its `enabled`
  reads only `state.gpu`.
- **Docs (spec §14).** `decisions.md` entry #19 recording: the amendment of #6's
  count from three named mechanisms to four; every ruling in spec §15; the two
  verification outcomes (spec §11); and what was **not** built (no umbrella
  bundle, no runtime marker registry, no envelope convergence, no renderer
  merging). `renderer-layer-outliers.md` §1's `zoneOfAvoidanceRenderer` outlier
  cell, §2's `foregroundLabelsLayer` rows and §6's rung-8 row updated in the
  same branch that acts on them.
- **Comment audit.** `/comment-audit` over the branch. Specific claims to
  re-check because they are about to become false: `foregroundLabelsLayer`'s
  "gating on `glyphCount() === 0` latches false forever" (`:119-122`),
  `projectToScreenPx`'s "its two callers" (`:11-15`), `MarkerLine`'s ownership
  paragraph, `labelDirectorSubsystem`'s "No layer load-in here" and
  "Appear/disappear envelope" headers, and `zoneOfAvoidanceUpsampleLayer`'s
  postBlit contract.
- **Perf.** `npm run perf` before and after, on **this worktree's** dev-server
  port (`--url http://localhost:<port>` read off *your* server's `Local:` line;
  omitting it silently measures another branch's server). Read the `perf` skill
  first. Neutral-or-negative halts the pipeline — land/park is the user's call.
- **Named observable behaviours — visual smoke, by the user, at four poses
  (spec §14, verbatim):**
  1. **Solar-system descent** — Sun / Earth / planet captions with their leader
     lines, correct stagger, correct de-collision; toggle each body's Labels
     switch and confirm the new registry-ramp fade-out reads as intended (§6,
     the one feel change).
  2. **Stellar neighbourhood** — the star map's names fade in over the band,
     Sgr A* survives past the solar-system reach, constellation figure names
     dissolve in lock-step with their lines.
  3. **Cosmic zoom** — structure rings + labels, famous-galaxy captions and
     their connectors, the "You are here" marker and its stem, all
     decluttering across producers as before.
  4. **Zone of avoidance** — three copies of the lettering on the galactic
     plane, reading left-to-right (not mirrored), same size and colour as
     before, fading with the band.
- **The deferral boundary (spec §1 non-goals).** Out of scope, do not chase:
  `clipPathDebugLayer` (debug line geometry, no glyphs); generalizing
  `MarkerProducer` beyond `StructureMarkerDescriptor`; converging the two
  envelope policies; merging the `labelRenderer`/`foregroundLabelRenderer` or
  `markerLineRenderer`/`foregroundMarkerLineRenderer` pairs; the umbrella
  `SubsystemBundle` (#17); any `drawPick` change, including
  `zoneOfAvoidanceRenderer.ts:70`'s shared `draw`/`drawPick` uniform buffer.
- **Close-out.** `/feature-done` audit, then this plan and the spec relocate to
  `plans/completed/` and `specs/completed/`.

---

## Task 1: Fold leader lines onto `Label2D`

Spec §2.3 item 1, §3.2, §11.1. The verification passed: every `MarkerLine`
emitted in `src/` is owned by exactly one label, so the sibling array and the
string back-reference are pure coupling.

**Files:**

- Create: `src/@types/rendering/Label2DLeader.d.ts`,
  `src/@types/rendering/Label2DLift.d.ts`
- Modify: `src/@types/rendering/Label2D.d.ts` (+`leader?`, +`lift?`),
  `src/@types/rendering/MarkerLine.d.ts` (−`ownerLabelId` + its docblock
  paragraph), `src/@types/engine/subsystems/Label2DProducerOutput.d.ts`
  (−`lines`)
- Modify: `src/services/engine/presentation/produceFamousGalaxyLabels.ts`
  (`:307-317`), `src/services/engine/presentation/produceMilkyWayLabel.ts`
  (`:115-130`), `src/services/engine/presentation/produceStructureLabels.ts`
  (`:221`, the `lines: []` term)
- Modify: `src/services/engine/subsystems/labelDirectorSubsystem.ts` —
  `EnvelopeEntry.lastOwnedLines` (`:122`) and the two walks that maintain it
  (`:382`, `:397`, `:430-432`); `signatureOf` (`:150-203`); `declutter`'s
  line-filter pass (`:315-317`); `applyEnvelope`'s lines walk (`:391-399`);
  `runFrame`'s merge (`:445-453`) and flush (`:468-473`)
- Test: `tests/services/engine/subsystems/labelDirectorSubsystem.test.ts`
- Test: the three producers' existing suites under
  `tests/services/engine/presentation/`

**Interfaces (spec §3.2, verbatim):**

```ts
// src/@types/rendering/Label2DLeader.d.ts
export type Label2DLeader = {
  readonly fromWorld: Vec3;
  readonly toWorld: Vec3;
  /** Full pixel width; the shader halves it. */
  readonly pixelWidth: number;
  /** Straight RGBA. The owning label's fadeAlpha × envelope multiplies both. */
  readonly color: Vec4;
};

// src/@types/rendering/Label2DLift.d.ts
export type Label2DLift = {
  /** The labelled subject's apparent size in px — drives the proportional lift. */
  readonly subjectSizePx: number;
  /** Screen-px lift of the leader's BOTTOM off the subject. Default 0. */
  readonly lineBottomLiftPx?: number;
};

// src/@types/rendering/Label2D.d.ts — two added fields, nothing removed
readonly leader?: Label2DLeader;
readonly lift?: Label2DLift;

// src/@types/engine/subsystems/Label2DProducerOutput.d.ts — `lines` deleted
export type Label2DProducerOutput = {
  readonly labels: readonly Label2D[];
  readonly awake: boolean;
};
```

**Flush contract (pins the director's side of the fold):** at flush time the
director synthesizes one `MarkerLine` per surviving label that carries a
`leader` — `id` = `` `${label.id}-anchor` ``, `fromWorld`/`toWorld`/`pixelWidth`/
`color` from the leader, `fadeAlpha` = the label's **post-envelope** alpha. The
`lift?` field is added here but stays **unread** until Task 3; nothing emits it
yet.

**Landmine — three simplifications must actually fall out.** If any of these
survives the task, the fold was done wrong: `EnvelopeEntry.lastOwnedLines` and
both walks that maintain it are gone; `declutter` no longer filters lines (a
culled label takes its leader with it by construction); `signatureOf`'s separate
line term collapses into the label term (the leader's `toWorld` must still key
the signature — the camera-derived-endpoint reason at `:182-188` is why, and
that reasoning moves onto the label term rather than being deleted).

**Steps:**

- [ ] In `labelDirectorSubsystem.test.ts`, **delete** the two cases that drive
      the `ownerLabelId === undefined` branches (`:112`, `:398`). Per
      `testing.md`, a test asserting a branch that no longer exists cannot fail
      on a real bug; the default is delete, not port.
- [ ] Add the failing test `flushes a leader as a MarkerLine id'd
      \`${label.id}-anchor\` at the label's post-envelope alpha` — asserts the
      line handed to `lineRenderer.setLines` for a mid-envelope label carries
      the envelope-multiplied alpha, not the raw producer alpha.
- [ ] Add the failing test `drops a culled label's leader with it` — a label
      losing a declutter overlap contributes no line at all.
- [ ] Add the failing test `re-flushes when a leader's toWorld moves at fixed
      id and alpha` — pins that the leader's endpoint still keys the signature
      after the collapse (the camera-derived-endpoint freeze this term exists to
      prevent).
- [ ] `npm test -- labelDirectorSubsystem` → the three new cases fail.
- [ ] Mint the two `.d.ts` files, edit the three modified ones, port the three
      producers to emit `leader` on the label, and rework the director per the
      flush contract + the three fall-outs above.
- [ ] `npm test` and `npm run typecheck` → green; `rg 'ownerLabelId' src/ tests/`
      → no hits.
- [ ] Commit: `refactor(engine): fold leader lines onto Label2D, delete the sibling lines array`
      with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Task 2: Parameterize the director — config surface + the COSMO instance

Spec §4, §4.1, §4.2, §4.3, §4.5. Behaviour-neutral: the COSMO instance's config
is today's hard-wiring, restated as data.

**Files:**

- Create: `src/@types/rendering/Label2DProjection.d.ts`,
  `src/@types/engine/subsystems/Label2DDeclutterPolicy.d.ts`,
  `src/@types/engine/subsystems/Label2DEnvelopePolicy.d.ts`,
  `src/@types/engine/subsystems/Label2DLiftPolicy.d.ts`,
  `src/@types/engine/subsystems/Label2DDirectorConfig.d.ts`
- Create: `src/services/engine/frame/cosmoLabelProjection.ts`
- Move (tool): `src/services/engine/subsystems/labelDirectorSubsystem.ts` →
  `src/services/engine/subsystems/label2DDirector.ts`;
  `src/@types/engine/subsystems/LabelDirectorSubsystem.d.ts` →
  `src/@types/engine/subsystems/Label2DDirector.d.ts`
- Delete: `src/services/engine/subsystems/labelProducer.ts` (spec §11.2 — a
  docblock plus `export {}`, zero importers in `src/`, `tests/`, `tools/`)
- Modify: `src/services/engine/engine.ts` (`:408` construction site),
  `src/@types/engine/handles/EngineSubsystemHandles.d.ts`
- Test: `tests/services/engine/subsystems/label2DDirector.test.ts` (the tool
  drags the mirror across; adapt to the factory's new arity)

**File moves — spell it out, do not hand-edit imports:**

```bash
npm run move-files -- --dry src/services/engine/subsystems/labelDirectorSubsystem.ts src/services/engine/subsystems/label2DDirector.ts
npm run move-files --       src/services/engine/subsystems/labelDirectorSubsystem.ts src/services/engine/subsystems/label2DDirector.ts
npm run move-files --       src/@types/engine/subsystems/LabelDirectorSubsystem.d.ts src/@types/engine/subsystems/Label2DDirector.d.ts
npm run refactor -- rename createLabelDirectorSubsystem createLabel2DDirector
npm run refactor -- rename LabelDirectorSubsystem Label2DDirector
```

**Interfaces (spec §4.2, verbatim):**

```ts
// src/@types/engine/subsystems/Label2DDirectorConfig.d.ts
export type Label2DDirectorConfig = {
  readonly id: string;
  /** Resolves this frame's projection for the director's slab. Memoised per ctx. */
  readonly project: (ctx: ReadyFrameContext) => Label2DProjection;
  readonly declutter: Label2DDeclutterPolicy;
  readonly envelope: Label2DEnvelopePolicy;
  /** `null` STATES the stance — not optional, so a third instance must decide. */
  readonly lift: Label2DLiftPolicy | null;
};

// src/@types/rendering/Label2DProjection.d.ts
export type Label2DProjection = {
  /** Placement matrix — f64 where the slab has one (NEAR0). */
  readonly vp: Float32Array | Float64Array;
  /** The same matrix narrowed for the renderer upload. */
  readonly vpF32: Float32Array;
  readonly viewportPx: Vec2;
};

// src/@types/engine/subsystems/Label2DDeclutterPolicy.d.ts
export type Label2DDeclutterPolicy =
  | { readonly mode: 'bboxOverlap'; readonly padPx: number }
  | { readonly mode: 'screenSeparation'; readonly minSeparationPx: number };

// src/@types/engine/subsystems/Label2DEnvelopePolicy.d.ts
export type Label2DEnvelopePolicy =
  | { readonly mode: 'smoothstepRamp'; readonly durationMs: number }
  | { readonly mode: 'exponentialApproach'; readonly tauMs: number; readonly settleEps: number };

// src/@types/engine/subsystems/Label2DLiftPolicy.d.ts
export type Label2DLiftPolicy = {
  /** Slab index whose `farMpc` the anchor clamp reads. */
  readonly slab: number;
  readonly farClampFraction: number;
};

// src/services/engine/subsystems/label2DDirector.ts
export function createLabel2DDirector(config: Label2DDirectorConfig): Label2DDirector;

// src/services/engine/frame/cosmoLabelProjection.ts
export function cosmoLabelProjection(ctx: ReadyFrameContext): Label2DProjection;
```

**The COSMO instance config (spec §4.3, verbatim):**

```ts
const COSMO_LABEL_DIRECTOR: Label2DDirectorConfig = {
  id: 'labels',
  project: cosmoLabelProjection,
  declutter: { mode: 'bboxOverlap', padPx: 8 },
  envelope: { mode: 'smoothstepRamp', durationMs: 300 },
  lift: null,
};
```

`DECLUTTER_PAD_PX = 8` (`labelDirectorSubsystem.ts:99`) and `ENVELOPE_MS = 300`
(`:107`) move into that literal verbatim; their docblocks move with them.

**The projection stage (spec §4.5).** The director projects each label **once**
per frame into `{ screenPx: Vec2 | null; clipW: number; onScreen: boolean }` —
the arithmetic currently inlined at `labelDirectorSubsystem.ts:240-253`. The
`bboxOverlap` arm additionally reads `clipW` to reproduce the vertex shader's em
clamp on the CPU (`:262-275`) before the padded-rect intersection test. Both
arms sort by **`prominencePx` descending, stable on input order** — one rank
contract for the director, whatever the arm.

`cosmoLabelProjection` reads `ctx.vp` and `ctx.canvasSize` (identical inputs to
`:235` today) and must be **memoised per `ctx`** so a second caller in the same
frame does not recompute it.

**Steps:**

- [ ] Run the four move/rename commands above (`--dry` first on the file moves).
      `npm run typecheck` → green with zero hand-edited imports.
- [ ] `rg 'subsystems/labelProducer' src/ tests/ tools/` → confirm zero hits,
      then delete `src/services/engine/subsystems/labelProducer.ts`.
- [ ] In `label2DDirector.test.ts`, add the failing test `projects each label
      exactly once per frame` — asserts a spy-instrumented `measure`/projection
      path is entered once per label per `runFrame`, so the declutter and any
      later stage share one record rather than re-projecting.
- [ ] Add the failing test `sorts by prominencePx descending with a stable
      input-order tiebreak` against the `bboxOverlap` arm — two equal-prominence
      overlapping labels resolve in registration order.
- [ ] `npm test -- label2DDirector` → both fail.
- [ ] Mint the five `.d.ts` files and `cosmoLabelProjection.ts`; convert the
      factory to `createLabel2DDirector(config)`; extract the projection stage;
      route the existing declutter + envelope behind the `bboxOverlap` /
      `smoothstepRamp` arms; wire `engine.ts:408` to `COSMO_LABEL_DIRECTOR`.
- [ ] `npm test` and `npm run typecheck` → green.
- [ ] Commit: `refactor(engine): parameterize the label director, COSMO instance on config`
      with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Task 3: The NEAR0 arms, the lift stage, and the second instance

Spec §4.1, §4.3, §4.4, §4.6, §8. Still behaviour-neutral: the new instance has
no producers yet.

**Files:**

- Create: `src/services/engine/frame/near0LabelProjection.ts`
- Modify: `src/services/engine/subsystems/label2DDirector.ts` (add the
  `screenSeparation` declutter arm, the `exponentialApproach` envelope arm, the
  lift stage)
- Modify: `src/services/engine/engine.ts` (+`foregroundLabelDirector` in the
  subsystems literal), `src/@types/engine/handles/EngineSubsystemHandles.d.ts`
- Modify: `src/services/engine/phases/initGpu.ts` (`:91`),
  `src/services/engine/phases/buildSwapRenderers.ts` (`:52`) — a second
  `attachRenderers` call each, with `foregroundLabelRenderer` +
  `foregroundMarkerLineRenderer`
- Modify: `src/services/engine/frame/runFrame.ts` (`:642`)
- Test: `tests/services/engine/subsystems/label2DDirector.test.ts`
- Test: `tests/services/engine/frame/runFrame.test.ts` (or the runFrame suite
  that owns the wake fold)

**Interfaces:**

```ts
// src/services/engine/frame/near0LabelProjection.ts
export function near0LabelProjection(ctx: ReadyFrameContext): Label2DProjection;
```

Derives `rebaseViewProj(ctx.slabs[NEAR0].vp, ctx.drawCamPos)` in **f64**, keeps
that as `vp`, narrows it to `vpF32`, and takes `viewportPx` from
`ctx.canvasSize` — identical inputs to `foregroundLabelsLayer.ts:167-175`
combined with `slabs.ts:222-232`. Memoised per `ctx`, like its COSMO sibling.

**The NEAR0 instance config (spec §4.3, verbatim):**

```ts
const FOREGROUND_LABEL_DIRECTOR: Label2DDirectorConfig = {
  id: 'foreground-labels',
  project: near0LabelProjection,
  declutter: { mode: 'screenSeparation', minSeparationPx: 48 },
  envelope: { mode: 'exponentialApproach', tauMs: 100, settleEps: 0.005 },
  lift: { slab: NEAR0, farClampFraction: NEAR0_FAR_CLAMP_FRACTION },
};
```

`STAR_CAPTION_MIN_SEPARATION_PX = 48` (`foregroundLabelsLayer.ts:46`),
`CAPTION_ENVELOPE_TAU_MS = 100` (`:51`) and `CAPTION_ENVELOPE_SETTLE_EPS = 0.005`
(`:55`) move verbatim, docblocks included.

**LANDMINE — the two envelope arms differ on three axes and all three must be
preserved (spec §4.6).** Getting either direction wrong is a visible regression
that a settled frame cannot show:

| axis    | `smoothstepRamp` (COSMO)                                                            | `exponentialApproach` (NEAR0)                                                                    |
| ------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| target  | binary presence: 1 while emitted-and-surviving, 0 otherwise                         | continuous: the label's own `fadeAlpha` when surviving, 0 when culled or absent                  |
| seed    | new id starts at 0 and ramps up                                                     | new id seeds **at** target — only changes animate                                                 |
| absence | remember the last emission and keep flushing it until the ramp hits 0, then drop    | drop immediately; the producer is expected to keep emitting a caption at target 0 while it eases  |

The exponential arm keeps its own frame clock (`captionClockMs`,
`foregroundLabelsLayer.ts:58`) as **director-instance state**, because `dt` is a
delta; the smoothstep arm stays closed-form on `ctx.nowMs`. Both remain pure
functions of `ctx.nowMs` so a stepped recorder clock replays identically. The
exponential arm's post-envelope `alpha > 0` check (`:312`) is what skips
flushing a zero-target caption.

**LANDMINE — the wake fold is three statements, not `a() || b()` (spec §8).**
Each `runFrame` **flushes GPU buffers as a side effect** and `||`
short-circuits, so the inline form skips a sibling's flush the moment the first
director votes `true`:

```ts
const cosmoLabelsAnimating = state.subsystems.labelDirector.runFrame(state, ctx);
const nearLabelsAnimating = state.subsystems.foregroundLabelDirector.runFrame(state, ctx);
const labelsAnimating = cosmoLabelsAnimating || nearLabelsAnimating;
```

(Task 9 inserts `label3DAnimating` as a third statement into the same fold.)
Nothing else moves: `shouldKeepTicking`'s `anim` bag already carries
`labelsAnimating` on an inline structural type (`shouldKeepTicking.ts:121`) —
**no `.d.ts` exists to edit**, and the field's meaning widens from "the
director" to "the label mechanisms", which its docblock at `:66-69` records.

**The lift stage (spec §4.4).** Runs **after** the envelope, over survivors
only, gated on `config.lift !== null`, and does exactly what
`foregroundLabelsLayer.ts:330-418` does today:

1. Clamp the anchor's length to `slab.farMpc × farClampFraction`
   (`clampVec3Length`) — the ill-conditioned-inverse guard whose full rationale
   at `:343-354` moves with the code.
2. Rescale `worldEmMpc` by the clamp ratio **read off the clamp's output**
   (`:358-373`), so `em / clip.w` is preserved.
3. `liftedLabelPlacement({ anchorWorldPos, vp, viewportPx, subjectSizePx,
   textBbox: renderer.measure(label), worldEmMpc, minPixelSize, maxPixelSize,
   lineBottomLiftPx })`, reading `subjectSizePx` and `lineBottomLiftPx` off the
   label's `lift` field.
4. `placement === null` (behind camera) → emit unlifted, no leader (`:395-398`).
5. Otherwise rewrite `worldPos` / `worldEmMpc` and fill `leader`.

**The `label.kind === 'constellation'` branch at `:338-341` must NOT be
ported.** A caption skips the lift by **not carrying `lift`** — absence of data,
not a kind test inside the placement loop. A `kind` discriminant reappearing
inside the director is an explicit spec §2.1 prohibition.

**Interim state, stated so it is not read as a bug.** After this task
`foregroundLabelDirector` is constructed, attached and polled every frame with
**zero producers**, so it flushes an empty set. That is harmless because
`foregroundLabelsLayer.draw` still calls `setLabels`/`setLines` afterwards
(`runFrame`'s director block runs before the GPU dispatch). Task 5 removes the
layer's upload and the interim ends.

**Steps:**

- [ ] Add the failing test `exponentialApproach seeds a new id AT its target,
      not at 0` — a first-frame caption at `fadeAlpha` 0.4 flushes at 0.4.
- [ ] Add the failing test `exponentialApproach drops an absent id immediately`
      — an id the producer stops emitting contributes nothing on the very next
      frame (no remembered-emission tail).
- [ ] Add the failing test `smoothstepRamp keeps flushing a remembered emission
      until the ramp hits 0` — the mirror-image assertion, pinning that the two
      absence rules did not get swapped. (Spec §12: "Both envelope arms need
      their absence rule pinned explicitly … because swapping them is the most
      plausible port error and it is invisible in a settled frame.")
- [ ] Add the failing test `the lift stage runs after the envelope, over
      survivors only` — a label culled by `screenSeparation` produces no lifted
      placement call.
- [ ] Add the failing test `a label without a lift field is emitted unlifted` —
      the constellation-shaped case, asserted through data absence.
- [ ] Add the failing test in the runFrame suite: `a director voting true does
      not prevent its sibling's flush` — spec §12's short-circuit trap.
- [ ] `npm test -- label2DDirector runFrame` → all six fail.
- [ ] Implement: `near0LabelProjection.ts`, the two new policy arms, the lift
      stage, `FOREGROUND_LABEL_DIRECTOR`, the handle + type field, both
      `attachRenderers` call sites, and the three-statement wake form.
- [ ] `npm test` and `npm run typecheck` → green.
- [ ] Commit: `refactor(engine): add the NEAR0 director arms, lift stage, and foregroundLabelDirector instance`
      with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Task 4: Extract `produceSceneBodyCaptions` and `produceConstellationCaptions`

Spec §5.1. The producers are created and unit-tested here but **not yet
registered** — Task 5 flips the layer onto them. Splitting the extraction from
the switchover keeps the switchover's diff reviewable as "the layer's content is
gone", not "the layer's content moved and changed".

**Files:**

- Create: `src/services/engine/presentation/produceSceneBodyCaptions.ts`
- Create: `src/services/engine/presentation/produceConstellationCaptions.ts`
- Test: `tests/services/engine/presentation/produceSceneBodyCaptions.test.ts`
  (new)
- Test: `tests/services/engine/presentation/produceConstellationCaptions.test.ts`
  (new)

**Interfaces (both satisfy `Label2DProducer`, spec §3.2):**

```ts
export function produceSceneBodyCaptions(
  state: EngineState,
  ctx: ReadyFrameContext,
): Label2DProducerOutput;

export function produceConstellationCaptions(
  state: EngineState,
  ctx: ReadyFrameContext,
): Label2DProducerOutput;
```

**What moves where (spec §5.1's map, by current line):**

| content                                                                   | from                 | to                                                              |
| ------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------- |
| `sceneBodyLabels` memo on the body-state snapshot                         | `:73-85`             | `produceSceneBodyCaptions` (module-level memo, unchanged shape) |
| per-body rebase + `apparentSizePx` + `CAPTION_FADE_RULES` target           | `:192-225`           | `produceSceneBodyCaptions`                                      |
| `sgrAStarCaptionTarget` demand term                                       | `:137-139`           | `produceSceneBodyCaptions` (as **emission**, not as a gate)     |
| composed declutter score `CAPTION_PRIORITY × TIER_SCALE + size`           | `:271-277`           | `produceSceneBodyCaptions`, emitted as `prominencePx`           |
| `LEADER_LINE_BOTTOM_GAP_PX` bottom-lift term                              | `:386-388`           | `produceSceneBodyCaptions`, emitted as `lift.lineBottomLiftPx`  |
| `constellationCaptions` memo on artifact identity                         | `:88-108`            | `produceConstellationCaptions`                                  |
| `constellationLayerOpacity` × `resolveLayerOpacity({kind:'constellations'})` | `:233-242`         | `produceConstellationCaptions` (unchanged composition)          |
| origin-distance vs orbit-distance distinction for the constellation band  | `:236-238`           | `produceConstellationCaptions` (the comment moves with it)      |

**LANDMINE — `prominencePx` is composed in the producer (spec §4.5).** The
NEAR0 rank score `CAPTION_PRIORITY[kind] × CAPTION_TIER_SCALE +
min(subjectSizePx, CAPTION_TIER_SCALE − 1)` is computed **in
`produceSceneBodyCaptions`** and emitted as that label's `prominencePx`, so the
tier table and the tier-dominance composition stay producer content and the
director keeps one rank contract. The **raw** apparent size the lift needs
travels separately on `lift.subjectSizePx`. The two facts are distinct today
(`Entry.subjectSizePx` vs the composed `priorityPx`) and stay distinct — do not
collapse them.

**LANDMINE — producers emit zero-target captions (spec §4.6).** Both producers
must emit **every** candidate caption, including ones whose target is 0, exactly
as `entries` does today (`foregroundLabelsLayer.ts:192-259`, where a zero-target
caption is still an entry). The `exponentialApproach` arm's absence rule is
"drop immediately", so a producer that emits only non-zero targets makes a
caption **pop** instead of easing out. Every caption becoming an entry is also
what makes the entry set the id universe the envelope prunes against
(`:325-328`).

Constellation captions carry **no** `lift` field (their anchor is empty space at
a figure centroid); body captions carry one.

**Steps (test names re-homed from
`tests/services/engine/frame/passes/foregroundLabelsLayer.test.ts` per spec
§12 — each case keeps its assertions, re-pointed at the producer's emitted
`fadeAlpha` instead of the drawn label set):**

- [ ] Move into `produceSceneBodyCaptions.test.ts`, assertions intact: the six
      per-toggle mutes (`:498`, `:541`, `:600`, `:644`, `:677`, `:699` and the
      combined `:718`), the Sun-visibility case (`:566`), the descent fade
      (`:818`), and the neighbourhood band (`:756`).
- [ ] Move the priority-tier collision case (`:857`) into
      `produceSceneBodyCaptions.test.ts`, re-pointed to assert the **composed
      `prominencePx` ordering** rather than the cull outcome. (The cull itself
      gets its own director case in Task 5.)
- [ ] Add `emits a zero-target caption rather than omitting it` — a body whose
      rule gates are closed still appears in the output at `fadeAlpha` 0. This
      is the absence-rule landmine in test form.
- [ ] Move the two constellation cases (`:1096`, `:1114`) into
      `produceConstellationCaptions.test.ts`, assertions intact.
- [ ] `npm test -- produceSceneBodyCaptions produceConstellationCaptions` → all
      fail (the modules do not exist).
- [ ] Implement both producers by moving the content per the table above. Do not
      change any formula; this task is a move.
- [ ] `npm test` and `npm run typecheck` → green. (The layer's own suite is
      still green too — its code is untouched this task.)
- [ ] Commit: `refactor(engine): extract the two foreground caption producers`
      with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Task 5: Register the producers; collapse `foregroundLabelsLayer`

Spec §5.1 (registration), §5.2 (the thin layer), §4.5 (`projectToScreenPx`).

**Files:**

- Modify: `src/services/engine/engine.ts` (register both producers on
  `foregroundLabelDirector`, beside the existing COSMO registration block at
  `:533-558`)
- Modify: `src/services/engine/frame/passes/foregroundLabelsLayer.ts` (441 →
  under 100 lines)
- Modify: `src/utils/camera/projectToScreenPx.ts` (header claim only)
- Test: `tests/services/engine/frame/passes/foregroundLabelsLayer.test.ts`
  (retire the enable-gate cases, keep four draw cases, add one new gate case)
- Test: `tests/services/engine/subsystems/label2DDirector.test.ts` (one added
  cull case)

**Registration (spec §5.1).** Both producers register on
`foregroundLabelDirector`. **Body captions register first**, matching today's
entry order (`entries` gets bodies then constellations). Registration order sets
only the equal-`prominencePx` tiebreak, as `engine.ts:535-540` already records
for the COSMO set.

**The thin layer (spec §5.2, verbatim):**

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

`draw` keeps exactly three things: the shared NEAR0 projection lookup (for
`vpF32` — call `near0LabelProjection(ctx)`, which is memoised, rather than
re-rebasing), the `renderedTargets.has('foreground:0')` depth guard (`:426-428`),
and the lines-before-labels draw order with its null-line-renderer tolerance
(`:430-436`).

**Everything else in the file is deleted**, not moved: the 30-line demand
summary at `:116-155` (body gate, Sgr A* gate, constellation gate, envelope
tail), the module-level `captionAlpha` map and `captionClockMs` (`:57-58`),
`anyCaptionAlive` (`:60-71`), both memo caches (`:76-108`, now the producers'),
and the in-`draw` `scheduler.requestRender()` at `:439` (the director's vote
replaces it, spec §8).

**LANDMINE — the enabled-gate port is the one place an incorrect move silently
blanks every caption (spec §5.2).** The comment at `:119-122` — "gating on
`renderer.glyphCount() === 0` latches false FOREVER once every target hits 0 in
one frame" — describes a layer that uploaded inside its own `draw`. Under the
director the upload happens in `runFrame`, **before** the frame program walks, so
the gate reads this frame's real demand. **The comment must NOT be carried
over.** Delete it; do not re-point it, do not soften it, do not keep a "used
to" note. The `enabled` body is the `labelsLayer.ts:50-53` shape and nothing
more.

**The `projectToScreenPx` header re-point (spec §4.5).** The function keeps its
`starPointsLayer` pick caller. Its header at `:11-15` claims "its two callers are
the caption declutter and `starPointsLayer`'s pick" — after this task the
caption declutter goes through the director's own projector instead. Re-point the
sentence at the director's projector **in this commit**: the arithmetic is the
same and must still agree, but the sentence naming the caller is wrong.

**Steps:**

- [ ] Delete the three enable-gate cases (`:316`, `:353`, `:365`) — they test a
      gate that no longer exists.
- [ ] Delete the fourth enable-gate case, `runs the row past the body-caption
      gate while a figure name could show` (`:1064`). **The spec's §12 map does
      not list it** — it sits inside the `— constellation captions` describe
      block rather than the `.enabled` one, but it is an enable-gate case of the
      same class: it asserts the demand summary admits the row past the body
      gate, and that summary is deleted. Its real subject — that constellation
      captions survive past the body-caption reach — is already covered by the
      producer cases re-homed in Task 4, so it is retired, not ported.
- [ ] Add the replacement failing case in
      `foregroundLabelsLayer.test.ts`: `enabled tracks the director's last
      flush, and re-opens when demand returns` — after a frame in which the
      director flushed a non-empty set, `enabled` is true; after a frame in
      which it flushed an empty set, `enabled` is false; and a subsequent frame
      with demand flushes again and `enabled` returns true. This is the
      "latch false forever" regression in its new form — it can only pass if the
      upload genuinely happens outside the layer's own `draw`.
- [ ] Keep, adapted to the thin layer: `rebase + draw` (`:403`), `leader-line
      rebase` (`:454`), `null line renderer` (`:1036`), `null renderer`
      (`:1046`).
- [ ] Move into `label2DDirector.test.ts` (`exponentialApproach` config): the
      declutter-flip easing + settle-and-go-quiet case (`:880`) and the
      demand-drop tail case (`:970`); plus one new case for the cull itself —
      `the higher CAPTION_PRIORITY tier survives a screenSeparation collision`,
      driven by the `prominencePx` the producer composed.
- [ ] `npm test -- foregroundLabelsLayer label2DDirector` → the new gate case
      and the cull case fail.
- [ ] Register both producers in `engine.ts` (bodies first); collapse the layer;
      re-point the `projectToScreenPx` header sentence.
- [ ] `npm test` and `npm run typecheck` → green. `wc -l
      src/services/engine/frame/passes/foregroundLabelsLayer.ts` → under 100.
- [ ] Commit: `refactor(engine): collapse foregroundLabelsLayer onto the foreground director`
      with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Task 6: The fade wire (#18 D12) — the one sanctioned behaviour change

Spec §6. **This commit is separable on purpose.** Everything before it is
behaviour-neutral; this one arms `fade(['starCatalogLabel'])` /
`fade(['bodyLabel'])` and changes how a Labels toggle eases out. Per
`simplicity.md`'s landing rule, a "worse" verdict at the visual checkpoint
**parks this commit** rather than being argued past — which is only possible if
it is its own commit, last of the caption group.

**Files:**

- Modify: `src/services/engine/presentation/captionFadeRules.ts` (+`fadeHandle`
  on `CaptionFadeRule`, six rows)
- Modify: `src/services/engine/presentation/produceSceneBodyCaptions.ts` (the
  composition + the keep-emitting gate)
- Modify: `src/services/engine/wiring/fadeLayers.ts` (delete the two LANDMINE
  lines at `:110` and `:123`)
- Test: `tests/services/engine/presentation/produceSceneBodyCaptions.test.ts`

**Interface delta:**

```ts
// src/services/engine/presentation/captionFadeRules.ts
export type CaptionFadeRule = {
  readonly labelEnabled: (settings: EngineSettingsState) => boolean;
  readonly subjectVisible: (settings: EngineSettingsState) => boolean;
  readonly fadeTarget: (distanceMpc: number, camDistMpc: number) => number;
  /** Required, not optional: a new CaptionKind must STATE its stance. */
  readonly fadeHandle: FadeId | null;
};
```

Five rows carry a handle — `{kind:'labelLayer', layer:'body', item: <BodyId>}`
for `sun` / `earth` / `planet` / `sgrAStar`, and `{kind:'labelLayer', layer:
'starCatalog', item:'famousStar'}` for `star`. The `constellation` row is
`null`, pairing with its existing `fadeTarget: PRODUCER_SUPPLIED`, because
`produceConstellationCaptions` already composes
`resolveLayerOpacity({kind:'constellations'})` into its own target and a second
multiply would double-count.

**The composition (spec §6, per caption, hand-composed):**

```
target = ruleGate × bandTarget × fades.opacityOf(handle, now) × clipFactor
```

`clipFactor` is `clipPlayer.clipOpacityOf('bodyLabel' | 'starCatalogLabel',
now)`, **hoisted out of the per-caption loop** — there are exactly two literals
and both are constant across the frame, exactly as `produceStructureMarkers.ts:65`
and `produceFamousGalaxyLabels.ts:218` hoist theirs.

**Why hand-composed and not `resolveLayerOpacity` (spec §6).** The registry
handle is per-ITEM (one per body id) while the clip key is per-LAYER; the
canonical helper would re-derive and re-read the clip channel once per caption
instead of once per producer. Recession is provably absent rather than assumed:
both `RECESSION_BY_LABEL_LAYER.starCatalog` and `.body` are `undefined`
(`focusRecession.ts:47-48`), a documented stance, so `focusRecession` would
return exactly 1. **This is a per-row read of the table, not a
generalization** — #18 D8's warning ("rung 8 must not inherit 'raw ⇒ recession
is 1' as a rule") is respected by not writing that rule down anywhere.

**The keep-emitting gate.** The emission condition becomes
`rule.labelEnabled(settings) || fades.opacityOf(handle, now) > 0` — the
`produceMilkyWayLabel.ts:48` and `produceFamousGalaxyLabels.ts:174-179` idiom —
so a toggled-off caption keeps being emitted while its registry ramp runs and
the fade-out completes instead of truncating.

**What dies.** The two LANDMINE lines at `fadeLayers.ts:110,123`. **Deleted, not
re-pointed** — the completion record is the git log plus the spec. `FADE_LAYERS`
rows and `VisibilityLayerKey` membership are untouched (#18 D12 ruled against
narrowing the manifest, and `LAYER_GROUPS.labels`' totality depends on both keys
existing).

**Steps:**

- [ ] Add the failing test `a body caption dims with its fade-registry handle`
      — with the settings toggle on and the registry opacity at 0.5, the emitted
      `fadeAlpha` is half the band target.
- [ ] Add the failing test `a body caption keeps being emitted while its
      registry ramp runs after the toggle goes off` — with `labelEnabled` false
      and `opacityOf` still > 0, the caption is still in the output (at the
      ramped alpha), and disappears only once the ramp reaches 0.
- [ ] Add the failing test `the star-map captions dim with the
      starCatalogLabel clip channel` — `clipOpacityOf('starCatalogLabel')` at
      0.25 scales the `star`-kind captions and leaves the body kinds alone.
- [ ] Add the failing test `constellation captions do not double-count the
      registry` — the `constellation` row's `null` handle means its emitted
      alpha equals its producer-supplied target unchanged.
- [ ] `npm test -- produceSceneBodyCaptions produceConstellationCaptions` → the
      four fail.
- [ ] Add `fadeHandle` to `CaptionFadeRule` and all six rows; implement the
      composition + keep-emitting gate in `produceSceneBodyCaptions`; delete the
      two LANDMINE lines.
- [ ] `npm test` and `npm run typecheck` → green. `rg -n 'LANDMINE'
      src/services/engine/wiring/fadeLayers.ts` → no `starCatalogLabel` /
      `bodyLabel` hits.
- [ ] Commit: `feat(engine): wire the starCatalogLabel and bodyLabel fade channels to the captions`
      with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Task 7: `MarkerProducer` — compile-time array plus a walker

Spec §7. The thinnest of the four contracts: merge and flush, no declutter, no
envelope, no wake vote.

**Files:**

- Create: `src/@types/engine/subsystems/MarkerProducer.d.ts`
- Create: `src/services/engine/presentation/markerProducers.ts`
- Create: `src/services/engine/frame/runMarkerProducers.ts`
- Modify: `src/services/engine/frame/runFrame.ts` (the hand-written marker block
  currently at `:666-669`)
- Test: `tests/services/engine/frame/runMarkerProducers.test.ts` (new)

**Interfaces (spec §3.2 / §7, verbatim):**

```ts
// src/@types/engine/subsystems/MarkerProducer.d.ts
export type MarkerProducer = {
  readonly id: string;
  produceMarkers(state: EngineState, ctx: ReadyFrameContext): readonly StructureMarkerDescriptor[];
};

// src/services/engine/presentation/markerProducers.ts
export const MARKER_PRODUCERS: readonly MarkerProducer[] = [
  { id: 'structureMarkers', produceMarkers: produceStructureMarkers },
];

// src/services/engine/frame/runMarkerProducers.ts
export function runMarkerProducers(
  state: EngineState,
  ctx: ReadyFrameContext,
): readonly StructureMarkerDescriptor[];
```

`runFrame.ts:666-669` becomes `setMarkers(runMarkerProducers(state, ctx))` behind
the same null-renderer guard.

**LANDMINE — the walker must not sort, filter or dedupe (spec §7).** The merged
order must stay `structureStore.all()` order per category, because the ring pick
path resolves `@builtin(instance_index)` through `byCategory(cat)[structureIndex]`
(`produceStructureMarkers.ts:20-29`). With one producer, concatenation preserves
it trivially. **The walker's module header says so explicitly**, and a second
marker producer would have to answer the index-alignment question before it
could join.

**Not built, deliberately (spec §7).** No `markerDirector` subsystem, no
`registerProducer`, no `EngineSubsystemHandles` field, no teardown row, no
`engine.ts` registration block. The rungs have declined exactly this three times
(#13, #14 D4, #15 D1) on the same test: a set fixed at compile time with one
member is plain data a hand-written walker maps over. `MarkerProducer` stays
typed to the closed `StructureMarkerDescriptor` — opening it to a category union
waits for a second, non-structure member.

**Steps:**

- [ ] Add the failing test `preserves producer order and emits every descriptor
      unfiltered` in `runMarkerProducers.test.ts` — the pick index-alignment
      contract. Assert the walker's output is the concatenation of its
      producers' outputs, element-for-element, including alpha-0 descriptors.
      (This is **not** a restatement of `produceStructureMarkers`' own suite,
      which stays as-is; drive the walker with stub producers.)
- [ ] `npm test -- runMarkerProducers` → fails.
- [ ] Mint the type, the array and the walker; replace the `runFrame` block.
- [ ] `npm test` and `npm run typecheck` → green.
- [ ] Commit: `refactor(engine): route structure markers through a MarkerProducer walk`
      with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Task 8: `label3DRenderer` — the shared world-text renderer

Spec §3.2 (types), §9.1 (renderer + shaders). **Load the `wesl-shaders` skill
before touching any `.wesl` file in this task** — the linker constraints
(`?static` + `package::`, symlink-at-leaf, duplicate `@builtin(position)` being
a RUNTIME-only failure) are not documented upstream.

**Files:**

- Create: `src/@types/rendering/Label3D.d.ts`,
  `src/@types/rendering/Label3DArcPlacement.d.ts`,
  `src/@types/rendering/Label3DRenderer.d.ts`
- Create: `src/services/gpu/renderers/labels3d/label3DRenderer.ts`
- Create: `src/services/gpu/shaders/labels3d/{io,vertex,fragment}.wesl`
- Modify: `src/services/engine/gpuHandles/gpuHandleRegistry.ts` (+one row),
  `src/@types/engine/handles/EngineGpuHandles.d.ts`
- Test: `tests/services/gpu/renderers/labels3d/label3DRenderer.test.ts` (new)

**Interfaces (spec §3.2 / §9.1, verbatim):**

```ts
// src/@types/rendering/Label3D.d.ts
export type Label3D = {
  readonly id: string;
  readonly text: string;
  readonly font: FontId;
  readonly placement: Label3DArcPlacement;
  /** Em height in Mpc — a fixed PHYSICAL size. No pixel clamps, by design. */
  readonly emMpc: number;
  /** Copies evenly spaced around the arc; 1 = a single instance. */
  readonly repeatCount: number;
  /** Straight RGBA fill. Single-band MSDF — no outline. */
  readonly color: Vec4;
  /** Multiplier in [0,1]. Default 1. */
  readonly fadeAlpha?: number;
};

// src/@types/rendering/Label3DArcPlacement.d.ts
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

// src/@types/rendering/Label3DRenderer.d.ts
export type Label3DRenderer = Renderer & {
  setLabels(labels: readonly Label3D[]): void;
  draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2): void;
  glyphCount(): number;
  destroy(): void;
};
```

**LANDMINE — `Label3DArcPlacement`'s handedness is load-bearing and must be
stated at the type (spec §3.2).** The renderer derives the in-plane binormal as
`cross(planeNormal, referenceDir)`. With `referenceDir = GAL_X_EQ` and
`planeNormal = GAL_Z_EQ` that reproduces `GAL_Y_EQ` exactly (`GAL_X × GAL_Y =
GAL_Z`, right-handed) — which is what preserves the sign derivation the current
shader documents at `shaders/zoneOfAvoidance/label/vertex.wesl:6-9`: glyphs
anchor at `angle − arcRad`, **not** `+`, so the text reads left-to-right rather
than mirrored. Get the cross-product order backwards and the lettering renders
mirrored; the type's docblock is where a future producer author learns this.

**GPU handle row (spec §9.1, verbatim):**

```ts
{ key: 'label3DRenderer',
  construct: (_state, deps) =>
    createLabel3DRenderer(deps.ctx.device, HDR_TARGET_FORMAT, deps.fontAtlases) }
```

**No `rebuildOnSwapFormat`** — it draws into HDR (`rgba16float`), not the swap
chain, so it is not one of the eight swap rows.

**Buffers (spec §9.1), following `labelRenderer`'s proven split:**

- **Per-label storage buffer** at `@group(0) @binding(1)`, one record per label:
  `center` + `radiusMpc`, `planeNormal` + `emMpc`, `referenceDir` +
  `startAngleRad`, `color`, `fadeAlpha` + `repeatCount`. This is what makes the
  renderer multi-label rather than a one-off.
- **Per-glyph instance buffer**, rebuilt in `setLabels`: `localOffset`,
  `localSize` (both **atlas px**, converted to Mpc in the vertex stage via the
  label's `emMpc` — *not* baked at construction, unlike
  `zoneOfAvoidanceRenderer.ts:266-289`), `uvRect`, `labelIndex`, `repeatIndex`,
  `fontIndex`.
- **Shared unit-quad corner buffer** (`lib/unitQuad`) and the
  `texture_2d_array` atlas + sampler at `@group(0) @binding(2)/(3)` — the same
  bindings `labelRenderer` uses, which is what lets the fragment stage
  `import package::lib::msdf::…` (PR A) instead of copying `median3`.
  Multi-font falls out; the ZoA path was hard-wired to `FONT_IDS[0]`
  (`zoneOfAvoidanceRenderer.ts:175`).

Reuse `layoutLabel` (`src/services/gpu/labelLayout/labelLayout.ts`) with
`'center'`/`'center'` alignment, as the ZoA path does at `:267`.

**Vertex stage (spec §9.1), generalizing
`shaders/zoneOfAvoidance/label/vertex.wesl`:**

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
`startAngleRad = 0`, `repeatCount = 3` and `emMpc = 2` this reduces to today's
expression term for term. **Preserve the per-glyph flat-basis approximation**
(one basis evaluation per glyph, not per corner) and move its comment with it.
The three `GAL_*_EQ` constants stay in `lib/util.wesl` (`worldToGalactic` still
uses them) but the new vertex stage does **not** import them — the basis arrives
as uniform/storage data.

**LANDMINE — `ADDITIVE_BLEND`, and the reason moves with the pipeline (spec
§9.1).** The Apple-Silicon dst-alpha coherency landmine documented at
`shaders/zoneOfAvoidance/label/fragment.wesl:3-7` (OVER's dst-alpha read across
`pass.end`/`pass.begin` splits on the HDR target) is the reason this text is
additive while the 2D labels are premultiplied OVER. **Copy that header into the
new `labels3d/fragment.wesl` verbatim**, re-pointed only where it names the old
file. Losing it means a future reader "fixes" the blend to OVER and reintroduces
a platform-specific bug that does not reproduce on the dev machine.

**Steps:**

- [ ] Add the failing test `a glyph at localOffset.x = 0, repeatIndex = 0,
      startAngleRad = 0 lands at center + radiusMpc · referenceDir` in
      `label3DRenderer.test.ts`. **Hand-compute** the expected world position
      (a `testing.md` WGSL/TS-parity keep-rule case) — do **not** re-run the
      shader's expression to build the expectation, which would be a mirror
      test.
- [ ] `npm test -- label3DRenderer` → fails.
- [ ] Mint the three `.d.ts` files (handedness docblock included), the three
      `.wesl` files, the renderer, the `GPU_HANDLE_ROWS` row and the
      `EngineGpuHandles` field.
- [ ] `npm test` and `npm run typecheck` → green.
- [ ] Shader-compile smoke: run the app (dev server already running — do not
      restart it) or the tint probe, and confirm no `Invalid ShaderModule`. The
      linker is the only thing that catches a mis-scoped binding, and the
      failure is a runtime error, not a type error.
- [ ] Commit: `feat(gpu): add the shared label3DRenderer for world-geometry text`
      with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Task 9: `produceZoneOfAvoidanceLettering`, the walker, and the ZoA deletion

Spec §3.2, §8, §9.2, §9.4. This is where the private glyph pipeline dies.

**Files:**

- Create: `src/@types/engine/subsystems/Label3DProducer.d.ts`,
  `src/@types/engine/subsystems/Label3DProducerOutput.d.ts`
- Create: `src/services/engine/presentation/produceZoneOfAvoidanceLettering.ts`
- Create: `src/services/engine/presentation/label3DProducers.ts`
- Create: `src/services/engine/frame/runLabel3DProducers.ts`
- Modify: `src/services/engine/frame/passes/zoneOfAvoidanceUpsampleLayer.ts`
  (thin `postBlit`; `LABEL_RADIUS_MPC` at `:18` moves out)
- Modify: `src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts`
  (523 → ~390)
- Modify: `src/@types/rendering/ZoneOfAvoidanceRenderer.d.ts` (−`drawLabels`)
- Modify: `src/services/engine/gpuHandles/gpuHandleRegistry.ts` (`:224-227`
  drops `deps.fontAtlases`)
- Modify: `src/services/engine/frame/runFrame.ts` (third wake statement)
- Delete: `src/services/gpu/shaders/zoneOfAvoidance/label/{io,vertex,fragment}.wesl`
- Test: `tests/services/engine/presentation/produceZoneOfAvoidanceLettering.test.ts`
  (new)
- Test: `tests/services/engine/frame/passes/zoneOfAvoidanceUpsampleLayer.test.ts`
  (rewrite the `drawLabels` case against `label3DRenderer.draw`)

**Interfaces (spec §3.2, verbatim):**

```ts
// src/@types/engine/subsystems/Label3DProducer.d.ts
export type Label3DProducer = {
  readonly id: string;
  produceLabels3D(state: EngineState, ctx: ReadyFrameContext): Label3DProducerOutput;
};

// src/@types/engine/subsystems/Label3DProducerOutput.d.ts
export type Label3DProducerOutput = {
  readonly labels: readonly Label3D[];
  readonly awake: boolean;
};

// src/services/engine/presentation/label3DProducers.ts
export const LABEL_3D_PRODUCERS: readonly Label3DProducer[];

// src/services/engine/frame/runLabel3DProducers.ts
export function runLabel3DProducers(state: EngineState, ctx: ReadyFrameContext): boolean;
```

`runLabel3DProducers` merges, then calls `state.gpu.label3DRenderer?.setLabels`,
and returns the folded `awake`. Its one member returns `false` today; `awake` is
kept so both walkers have the same contract and the wake fold has one shape —
recorded in the spec as a judgement call, not an oversight, so do **not** "clean
it up" to a `void` walker.

**The wake fold's third statement (spec §8):**

```ts
const label3DAnimating = runLabel3DProducers(state, ctx);
const labelsAnimating = cosmoLabelsAnimating || nearLabelsAnimating || label3DAnimating;
```

Same rule as Task 3: **three statements, then one OR**. The walker flushes GPU
buffers as a side effect, so an inline `a() || b() || c()` would skip it.

**The producer.** `produceZoneOfAvoidanceLettering` reads
`deriveZoneOfAvoidanceLiveness(state, ctx)` (null → emit no labels),
`state.settings.zoneOfAvoidance` (for `labelColor`), and the two constants that
move here from GPU-side homes:

- `LABEL_RADIUS_MPC = 40` (`zoneOfAvoidanceUpsampleLayer.ts:18`) →
  `placement.radiusMpc`
- `LABEL_EM_MPC = 2` (`zoneOfAvoidanceRenderer.ts:57`) → `emMpc`

Both are flagged in-code as visual-pass placeholders; **they stay placeholders**,
in one file instead of two, and the docblocks move with them. The placement is
`center: [0,0,0]`, `planeNormal: GAL_Z_EQ`, `referenceDir: GAL_X_EQ`,
`startAngleRad: 0`, imported from `src/data/orientation/orientationFrames.ts`.
Text and repeat count come from
`src/data/zoneOfAvoidance/zoneOfAvoidanceLabelText.ts` as today. `fadeAlpha` is
the liveness opacity.

**The thin `postBlit` (spec §9.2, verbatim):**

```ts
postBlit(pass, view, _ctx, state) {
  const r = state.gpu.label3DRenderer;
  if (r === null || r.glyphCount() === 0) return;
  r.draw(pass, view.vp, view.viewportPx);
},
```

**The draw site stays pinned.** Full-res, additive, into HDR, after the
reduced-res band blit — MSDF text at reduced res blurs past legibility, which is
why rung 2 minted the hook. The producer/director split moves the decision of
*what* text exists and *at what alpha*; it does not move *where* the draw is
recorded. The layer header's contract — "`postBlit` guards itself independently
of the blit handle; the blit and the caption must never suppress each other" —
is preserved by the null + glyph-count guard and **must be re-stated, not
dropped**.

**What dies (spec §9.4), all of it:** `zoneOfAvoidanceRenderer.drawLabels`;
`ZONE_OF_AVOIDANCE_LABEL_UNIFORM_BUFFER_SIZE`, `LABEL_EM_MPC`,
`LABEL_GLYPH_INSTANCE_BYTES`; the label pipeline/BGL/bind group; the
construction-time `layoutLabel` bake; the private atlas texture + sampler + its
`copyExternalImageToTexture`; the label uniform scratch; the four label
`destroy()` lines (`:45-46,57,60,168-334,479-511`); the three
`shaders/zoneOfAvoidance/label/*.wesl` files; the `atlases: LoadedFontAtlases`
third constructor parameter and `deps.fontAtlases` from its registry row
(`gpuHandleRegistry.ts:224-227`); and `drawLabels` from the `.d.ts`. That third
parameter's removal is what returns the renderer to the family-A constructor
norm `(device, targetFormat)` and retires the outlier row Task 10 updates. The
second copy of the atlas in GPU memory goes with it.

**Untouched, explicitly (spec §1 non-goals):** `zoneOfAvoidanceRenderer.ts:70`'s
shared `draw`/`drawPick` uniform buffer. This rung does not fix it and does not
make it worse — the band uniform is not the label uniform.

**Steps:**

- [ ] Add the failing test `places the lettering on the galactic plane` in
      `produceZoneOfAvoidanceLettering.test.ts` — `planeNormal === GAL_Z_EQ`,
      `referenceDir === GAL_X_EQ`, with the basis values **imported** from
      `orientationFrames.ts`, not restated (no constant restatement).
- [ ] Add the failing test `fadeAlpha tracks deriveZoneOfAvoidanceLiveness` —
      a liveness of `null` emits no labels; a liveness of 0.3 emits one label at
      `fadeAlpha` 0.3.
- [ ] Rewrite the existing `zoneOfAvoidanceUpsampleLayer.test.ts` case against
      `label3DRenderer.draw`, keeping its real subject: **a null blit handle
      must not suppress the lettering, and vice versa.**
- [ ] `npm test -- produceZoneOfAvoidanceLettering zoneOfAvoidanceUpsampleLayer`
      → fails.
- [ ] Implement the two types, the producer, the array, the walker, the third
      wake statement, and the thin `postBlit`.
- [ ] Delete everything in the "what dies" list; run the grep gates:
      `rg -n 'drawLabels|shaders/zoneOfAvoidance/label' src/ tests/` → no hits.
      (`.wesl` `package::` imports are outside the refactor tool's reach — grep
      is the check.)
- [ ] `npm test` and `npm run typecheck` → green; shader-compile smoke in the
      running dev server → no `Invalid ShaderModule`, lettering still on screen.
- [ ] Commit: `refactor(gpu): make the ZoA lettering a Label3DProducer and delete the private glyph pipeline`
      with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Task 10: Docs — `decisions.md` #19 and the outliers-doc updates

Spec §14. #18 D1's discipline: the research docs are updated in the same branch
that acts on them.

**Files:**

- Modify: `docs/research/engine/decisions.md` (append item **19** to the
  `## Decisions (in order made)` numbered list, after item 18 at `:836`)
- Modify: `docs/research/engine/renderer-layer-outliers.md` (`:26` family-A
  cell, `:59` and `:75` `foregroundLabelsLayer` rows, `:100` fade-consumption
  row, `:214` rung-8 assignment row)

**`decisions.md` #19 must record, at minimum:**

- The amendment of **#6's count from three named mechanisms to four** —
  `Label2DProducer`, `Label3DProducer`, `MarkerProducer`, `drawPick` — and why
  the fourth exists (world-geometry text does not declutter, does not envelope,
  has no leader, and its anchor is an arc, so forcing it through
  `Label2DProducer` would be exactly the fake unification #6 rejects).
- Every ruling in spec §15 (items 1–10 plus the four 2026-08-21 review
  confirmations and the `produceFamousGalaxyLabels` rename).
- The two verification outcomes of spec §11: the leader-line fold **passed**
  (every production `MarkerLine` is label-owned), and
  `subsystems/labelProducer.ts` was **dead** and deleted.
- What was **not** built: no umbrella `SubsystemBundle` (#17 stays deferred), no
  runtime marker registry, no envelope convergence, no renderer-pair merging,
  no `clipPathDebug` fold, no `drawPick` change.
- The two recorded **second-special-case triggers**: a third director instance
  decides whether the 2×2 policy unions were right or should collapse to one
  `flavour` knob (spec §4.3); a second, non-structure marker producer decides
  whether `StructureMarkerDescriptor` opens to a category union (spec §7).

**`renderer-layer-outliers.md` updates:**

- `:26` (§1 family A) — the `zoneOfAvoidanceRenderer` outlier cell is **retired**:
  the third `atlases` parameter is gone and the renderer is back on the family-A
  norm `(device, targetFormat)`.
- `:59` and `:75` (§2) — the `foregroundLabelsLayer` `enabled()`-purity row and
  the god-layer row are both **resolved**: the layer is under 100 lines, its
  `enabled` reads only `state.gpu`, and the in-`draw` `requestRender` is gone.
- `:100` (§3) — `starCatalogLabel` and `bodyLabel` leave the
  "registered handles with no consumer" count; the three registration-only rows
  (#18 D13) stay.
- `:214` (§6) — the rung-8 assignment row is marked done for its three named
  items (foregroundLabels private director, structureMarkers shadow path,
  zoneOfAvoidanceRenderer's private MSDF pipeline) and records that
  **`clipPathDebug` bypass was deliberately excluded**, so a future reader does
  not read the omission as an oversight.

**Do not** strike through resolved rows — delete or rewrite them. The completion
record is the git log plus `specs/completed/`.

**Steps:**

- [ ] Write the `decisions.md` #19 entry covering all five bullets above,
      matching the numbered-list style of items 1–18.
- [ ] Update the five `renderer-layer-outliers.md` sites.
- [ ] Re-read both edits against the branch's actual diff — every claim must be
      true of the code as landed, not of the spec's intent.
- [ ] Commit: `docs(engine): record decision #19 and close the rung-8 outlier rows`
      with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Spec coverage

Every section of the spec maps to a task (or to an explicit non-goal):

| spec §                          | task(s)                                    |
| ------------------------------- | ------------------------------------------ |
| §1 goals / non-goals            | DoD deferral boundary; Task 10             |
| §2 ground preparation           | Tasks 1, 2 (the prep verdicts are enacted) |
| §3 four contracts               | Tasks 1, 2, 7, 8, 9                        |
| §3.1 renames                    | **PR A** (precondition, not this plan)     |
| §3.2 type sketches              | Tasks 1, 2, 7, 8, 9 (quoted verbatim)      |
| §4 director factory + instances | Tasks 2, 3                                 |
| §4.1 pipeline order             | Tasks 2, 3                                 |
| §4.2 config type                | Task 2                                     |
| §4.3 instance configs           | Tasks 2, 3                                 |
| §4.4 lift stage                 | Task 3                                     |
| §4.5 projection + rank key      | Tasks 2 (projection), 4 (`prominencePx`), 5 (`projectToScreenPx` header) |
| §4.6 envelope arms              | Task 3                                     |
| §5.1 producer extraction map    | Tasks 4, 5                                 |
| §5.2 thin layer                 | Task 5                                     |
| §6 fade wire                    | Task 6                                     |
| §7 markers                      | Task 7                                     |
| §8 wake                         | Tasks 3, 9                                 |
| §9.1 label3DRenderer            | Task 8                                     |
| §9.2 pinned draw site           | Task 9                                     |
| §9.3 `lib/msdf.wesl`            | **PR A** (consumed by Task 8)              |
| §9.4 what dies                  | Tasks 2 (`labelProducer.ts`), 9 (the rest) |
| §10 file inventory              | DoD deliverable inventory                  |
| §11 verifications               | Tasks 1, 2; recorded in Task 10            |
| §12 testing strategy            | Tasks 1, 3, 4, 5, 7, 8, 9                  |
| §13 packaging                   | plan structure                             |
| §14 definition of done          | DoD above                                  |
| §15 decision record             | Task 10                                    |
