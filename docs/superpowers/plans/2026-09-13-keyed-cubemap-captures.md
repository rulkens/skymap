# Keyed cubemap captures (PBR prep P1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Replace the Sgr A\* sky-cubemap **singleton** with a **keyed table**: a
`CubemapCapture` row per capture, a `cubemapCaptures` runtime map keyed the same,
capture `FrameStep`s that address a capture face **by capture key** instead of by
`RenderTargetId`, and a `cubemapFaceContext` whose near plane and view-slot base
come from the row rather than from module constants.

This is a **pure refactor**. No capture row is added; the lens must render
byte-for-byte as it does today. P1 exists to remove the two blockers the PBR spec
names — J1 (capture is one anchor / one target / one singleton) and J2 (a probe's
cube view is not a render-target row) — so that the solar-system sky bake and the
per-body reflection probes land as **rows**, not as special cases.

## Architecture

Today the capture is spelled out four times, once per file, each time as "the
sky cubemap":

- `renderFrame.ts` hard-codes the galactic-centre region, the lensing band, the
  0.1 au near plane, the six-face sweep and the `bakedSettings` key;
- `EngineState.skyCubemapCapture` is a single record of that bookkeeping;
- `FRAME_ORDER`'s `capture` line names the render-target id `'sky-cubemap'`, and
  `FrameStep.face` disambiguates the six steps that share it;
- `executeFrame` resolves a face's colour attachment as
  `layerViewOf('sky-cubemap', face)` and keys its per-face first-touch set on
  `` `${target}:${face}` ``.

After P1 the capture is **one row of data** (`src/data/rendering/cubemapCaptures.ts`)
read by four consumers that no longer know Sgr A\* exists:

- `scheduleCubemapCaptures` walks the table, advances each row's runtime entry and
  returns this frame's per-capture face contexts;
- `EngineState.cubemapCaptures` is a `Map` keyed by `CubemapCaptureKey`;
- a capture step carries `capture: { key, face }` and **no** `target`;
- `captureFaceAttachment` is the single site that turns a capture key + face into a
  colour attachment — the one place a later probe row's "this body's cube texture"
  arm attaches.

The lens's own band gate (which body-m slab row the `lens` line expands over) is
**not** capture business and leaves `renderFrame` with it, into `lensBodySlabs.ts`,
sharing one band-alpha helper with `sgrAStarLensingPass`.

## Tech Stack

TypeScript + raw WebGPU; Vitest. No new dependencies, no shader changes, no data
format changes.

## Spec

`docs/superpowers/specs/2026-09-12-mesh-body-pbr-design.md` — "Prep list", item
**P1**; blockers **J1** and **J2** under "Missing joints"; target shapes under
"Ideal shape (data delta first)".

Pre-reading for the implementer: `docs/RENDERER.md` (mandatory — this is frame /
executor code), `docs/superpowers/conventions/comments.md`,
`docs/superpowers/conventions/testing.md`,
`docs/superpowers/conventions/simplicity.md`.

## Global Constraints

- **Behaviour-identical lens.** Same band keying on the galactic-centre anchor
  distance, same `allocateWhen` row lifetime + hysteresis, same 0.1 au near plane,
  same all-or-nothing six-face sweep, same `bakedSettings` re-bake key, same
  per-face first-touch semantics, same merged-vs-split `(hdr, NEAR0)` step count in
  and out of band. Two deliberate, unobservable deltas are named in Task 5.
- **Frame-file purity.** Every file in `src/services/engine/frame/` (and its
  `timing/`, `passes/`) exports ONLY the symbol it is named for. Helpers go to
  `src/utils/` or their own file in `frame/`; constants go to `src/data/`.
  `tests/services/engine/frame/frameFilePurity.test.ts`'s `ALLOWED` rows are
  **exact, not ceilings** — a task that removes a stray must lower its row in the
  same commit (delete the row at 0), and rows only ever go DOWN.
- **One symbol per file** in `src/utils/` and `src/@types/`; filename = symbol.
  `src/data/` modules may carry the table plus its immediate vocabulary.
- **`type` aliases, never `interface`.** Deep relative imports, no barrels.
- **Comment budget:** module header ≤ 10 lines; comment lines ≤ half the code
  lines in the file. Comments moved with code get **shortened**, not pasted — most
  of the current `renderFrame.ts` capture commentary is rationale that belongs on
  the table row, once.
- **Every file move or rename goes through `npm run move-files`**, never `git mv`
  plus hand-edited imports. Run `--dry` first. Symbol renames go through
  `npm run refactor -- rename`. The exact invocations are spelled out in the tasks.
- **Each task ends green** — the suite passes at every commit.

## File Structure

### Created

```
src/@types/rendering/CubemapCaptureKey.d.ts        closed union of capture keys
src/@types/rendering/CubemapCapture.d.ts           one table row
src/@types/engine/frame/CaptureFaceRef.d.ts        { key, face } — what a step carries
src/@types/engine/frame/CaptureFaceContexts.d.ts   key → face → synthetic ctx
src/data/rendering/cubemapCaptures.ts              CUBEMAP_CAPTURES + ALL_CUBE_FACES
src/services/engine/frame/scheduleCubemapCaptures.ts
src/services/engine/frame/captureFaceAttachment.ts
src/services/engine/frame/lensBodySlabs.ts
src/services/engine/frame/sgrAStarBandAlpha.ts
```

### Renamed (via `npm run move-files`)

```
src/@types/engine/state/SkyCubemapCaptureRuntime.d.ts
  → src/@types/engine/state/CubemapCaptureRuntime.d.ts
src/services/engine/frame/skyCubemapFaceContext.ts
  → src/services/engine/frame/cubemapFaceContext.ts
```

### Modified

```
src/@types/engine/frame/FrameStep.d.ts          render arm: face → capture, target optional
src/@types/engine/frame/CaptureStepSpec.d.ts    target → capture key
src/@types/engine/frame/ExecuteFrameArgs.d.ts   skyCubemapFaceContexts → captureContexts
src/@types/engine/frame/PassState.d.ts          docstring: names the new field
src/@types/engine/state/EngineState.d.ts        skyCubemapCapture → cubemapCaptures (Record)
src/services/engine/engine.ts                   seeds the map from the table
src/services/gpu/renderTargets.ts               allocateWhen reads the map + the row's band
src/services/engine/frame/renderFrame.ts        capture block → two calls
src/services/engine/frame/expandFrameOrder.ts   capture arm + FrameInputs.captureFaces
src/services/engine/frame/executeFrame.ts       attachment + first-touch by capture key
src/services/engine/frame/frameOrder.ts         capture line names a capture key
src/services/engine/frame/checkFrameOrder.ts    capture arm resolves the row's target
src/services/engine/frame/slabs.ts              groupKeyOf takes the step
src/services/engine/frame/timing/timedSlotRowsOf.ts
src/services/engine/frame/timing/plainPassGroupKeys.ts
src/services/engine/frame/timing/passGroupTitles.ts
src/services/engine/frame/timing/maxFrameInputs.ts
src/services/engine/frame/passes/sgrAStarLensingPass.ts   shares the band helper
src/services/engine/frame/passes/starAggregatesPass.ts    capture viewport off ctx
docs/backlog/2026-09-09-sky-cubemap-band-memory-derived.md  field names refreshed
```

### Tests

```
tests/data/rendering/cubemapCaptures.test.ts                       NEW
tests/services/engine/frame/lensBodySlabs.test.ts                  NEW
tests/services/engine/frame/cubemapFaceContext.test.ts             renamed with its source
tests/services/engine/frame/renderFrame.cubemapCaptures.test.ts    renamed from …skyCubemapHandOff
tests/services/engine/frame/frameFilePurity.test.ts                ALLOWED rows ratcheted
tests/services/engine/frame/executeFrame.test.ts                   capture fixtures + one new
tests/services/engine/frame/expandFrameOrder.test.ts               FrameInputs fixtures
tests/services/engine/frame/checkFrameOrder.test.ts                capture-line fixture
tests/services/engine/frame/renderFrame.test.ts                    state fixture
tests/services/engine/frame/renderFrame.timing.test.ts             state fixture
tests/services/engine/frame/timing/timedSlot*.test.ts              FrameInputs fixtures
tests/services/gpu/renderTargets.test.ts                           state fixture
tests/visual/renderFrameSplitBaseline.test.ts                      state fixture
```

---

## Task 1: The capture table and the keyed runtime map

**Files:** `src/@types/rendering/CubemapCaptureKey.d.ts` (new),
`src/@types/rendering/CubemapCapture.d.ts` (new),
`src/data/rendering/cubemapCaptures.ts` (new),
`src/@types/engine/state/SkyCubemapCaptureRuntime.d.ts` (renamed),
`src/@types/engine/state/EngineState.d.ts`, `src/@types/engine/frame/PassState.d.ts`,
`src/services/engine/engine.ts`, `src/services/gpu/renderTargets.ts`,
`src/services/engine/frame/renderFrame.ts` (read site only),
`tests/data/rendering/cubemapCaptures.test.ts` (new),
`tests/services/gpu/renderTargets.test.ts`, `tests/services/engine/frame/renderFrame.test.ts`,
`tests/services/engine/frame/renderFrame.timing.test.ts`,
`tests/services/engine/frame/renderFrame.skyCubemapHandOff.test.ts`,
`tests/visual/renderFrameSplitBaseline.test.ts`

**Produces:**

```ts
// src/@types/rendering/CubemapCaptureKey.d.ts
export type CubemapCaptureKey = 'sgrAStar';

// src/@types/rendering/CubemapCapture.d.ts
export type CubemapCapture = {
  /** Render-target row whose 6 layers are this capture's faces. */
  readonly target: string;
  /** Region whose anchor the band keys on — camera distance to it, Mpc. */
  readonly anchor: BodyRegion;
  /** Outside this band nothing is captured and the target row is released. */
  readonly band: FadeBand;
  /** Capture-camera near plane, Mpc. */
  readonly nearMpc: number;
  /** First `ReadyFrameContext.viewSlot` this capture's faces claim (base … base+5). */
  readonly viewSlotBase: number;
};

// src/data/rendering/cubemapCaptures.ts
export const ALL_CUBE_FACES: readonly CubeFace[];
export const CUBEMAP_CAPTURES: Readonly<Record<CubemapCaptureKey, CubemapCapture>>;

// src/@types/engine/state/CubemapCaptureRuntime.d.ts  (renamed file)
export type CubemapCaptureRuntime = {
  lastBandActive: boolean;
  lastAnchorDistanceMpc: number;
  bakedSettings: EngineSettingsState | null;
};

// src/@types/engine/state/EngineState.d.ts
cubemapCaptures: Readonly<Record<CubemapCaptureKey, CubemapCaptureRuntime>>;
```

`Record<CubemapCaptureKey, …>` (not an array) is what makes a missing row a
typecheck error and lets `CUBEMAP_CAPTURES[key]` be total. `cubemapCaptures` is
`Readonly<Record<…>>` of mutable entries: single-writer in-place mutation,
exactly as the singleton is today.

- [ ] Rename the runtime type file:
      `npm run move-files -- --dry src/@types/engine/state/SkyCubemapCaptureRuntime.d.ts src/@types/engine/state/CubemapCaptureRuntime.d.ts`,
      then without `--dry`. Then
      `npm run refactor -- rename SkyCubemapCaptureRuntime CubemapCaptureRuntime`
      and `npm run refactor -- rename lastGcDistanceMpc lastAnchorDistanceMpc`.
      Rewrite the type's header for one capture row, not "the black-hole lens's".
- [ ] Add `CubemapCaptureKey` and `CubemapCapture`. The `nearMpc` doc carries the
      landmine currently in `skyCubemapFaceContext.ts` — it is NOT the live cosmo
      near plane (0.01 Mpc); the captured content sits at hundreds of au, inside
      it, and reusing it clips every S-star away.
- [ ] Add `src/data/rendering/cubemapCaptures.ts` with `ALL_CUBE_FACES` and the
      single `sgrAStar` row: `target: 'sky-cubemap'`,
      `anchor: regionById('galactic-centre')` (resolved at module load — the hoist
      `renderFrame.ts` documents today), `band: SCALE_FADE_BANDS.sgrAStarLensing`,
      `nearMpc: 0.1 * SCALE_UNITS.AU_TO_MPC`, `viewSlotBase: 1`. Record on the
      module header that slot 0 is the main view and that a row's six slots must
      fit under `VIEW_SLOT_COUNT` (`src/utils/gpu/createViewSlotUniformRing.ts`).
- [ ] `EngineState.skyCubemapCapture` → `cubemapCaptures`; `engine.ts` seeds one
      entry per table key (`lastBandActive: false`,
      `lastAnchorDistanceMpc: Number.POSITIVE_INFINITY`, `bakedSettings: null`) by
      mapping over `CUBEMAP_CAPTURES`, not by hand. Update `PassState`'s docstring
      (it names the refused field).
- [ ] `renderTargets.ts`: the `sky-cubemap` row's `allocateWhen` reads
      `state.cubemapCaptures.get('sgrAStar')` and takes its release margin off
      `CUBEMAP_CAPTURES.sgrAStar.band.goneAt` instead of importing
      `SCALE_FADE_BANDS` for it — same number, one home. `renderFrame.ts` reads the
      map entry at its existing call site (interim; Task 3 removes the read).
- [ ] Add `tests/data/rendering/cubemapCaptures.test.ts`: - `describe('CUBEMAP_CAPTURES')` - `it('claims six disjoint view slots per row, all inside VIEW_SLOT_COUNT')` —
      every row's `[viewSlotBase, viewSlotBase + 5]` lies in `1 … VIEW_SLOT_COUNT - 1`
      and no two rows' ranges intersect. Catches the silent
      `queue.writeBuffer` clobber (docs/RENDERER.md #1) a second row would hit. - `it('names a declared render-target row as its capture target')` — each
      row's `target` is among `renderTargetRows(<any swap format>)`'s ids.
- [ ] Update the state fixtures in the five test files listed above (mechanical:
      `skyCubemapCapture: { … }` → `cubemapCaptures: new Map([['sgrAStar', { … }]])`).
- [ ] `npm test -- cubemapCaptures renderTargets renderFrame` green; `npm run typecheck`.
- [ ] Commit.

---

## Task 2: `cubemapFaceContext` — near plane and view slot come from the row

**Files:** `src/services/engine/frame/skyCubemapFaceContext.ts` (renamed),
`tests/services/engine/frame/skyCubemapFaceContext.test.ts` (renamed),
`src/services/engine/frame/renderFrame.ts` (call site),
`tests/services/engine/frame/frameFilePurity.test.ts`

**Produces:**

```ts
export function cubemapFaceContext(input: {
  readonly state: EngineState;
  readonly eyeMpc: Readonly<Vec3>;
  readonly face: CubeFace;
  readonly faceSizePx: number;
  /** Capture-camera near plane, Mpc — `CubemapCapture.nearMpc`. */
  readonly nearMpc: number;
  /** This capture's first view slot; the face stamps `viewSlotBase + face`. */
  readonly viewSlotBase: number;
  readonly nowMs: number;
}): ReadyFrameContext | null;
```

The spec sketches this positionally (`cubemapFaceContext(eye, face, size, near,
viewSlotBase)`); the named bag is kept — `state` and `nowMs` are also required and
the existing call site already passes a bag.

- [ ] `npm run move-files -- --dry src/services/engine/frame/skyCubemapFaceContext.ts src/services/engine/frame/cubemapFaceContext.ts`,
      then without `--dry` (it drags the `tests/` mirror). Then
      `npm run refactor -- rename skyCubemapFaceContext cubemapFaceContext`.
- [ ] Delete the module-level `SKY_CAPTURE_NEAR_MPC` (its value and its landmine
      comment now live on the table row) and take `nearMpc` from the input.
- [ ] Replace the `viewSlot: face + 1` stamp with `viewSlotBase + face`; the
      existing comment about slot 0 being the main view moves to the new param's doc.
- [ ] Drop `frame/skyCubemapFaceContext` from `ALLOWED` and add
      `'frame/cubemapFaceContext': 4` — the file loses one stray
      (`SKY_CAPTURE_NEAR_MPC`), leaving `FACE_FORWARD`, `FACE_UP`, `FACE_BASES`,
      `flipClipY`. The row is exact; a wrong number fails the ratchet either way.
- [ ] In the renamed test file, add
      `it('stamps viewSlot from the given base, so a second capture cannot share the first's slots')` —
      `viewSlotBase: 7`, `face: 2` ⇒ `ctx.viewSlot === 9`. Re-point the existing
      `clips well below the S-star scale…` test at the explicit `nearMpc` argument
      rather than the deleted constant; the other four tests keep their names.
- [ ] `npm test -- cubemapFaceContext frameFilePurity` green.
- [ ] Commit.

---

## Task 3: `scheduleCubemapCaptures` — the capture block becomes a table walk

**Files:** `src/services/engine/frame/scheduleCubemapCaptures.ts` (new),
`src/@types/engine/frame/CaptureFaceContexts.d.ts` (new),
`src/services/engine/frame/renderFrame.ts`,
`tests/services/engine/frame/renderFrame.skyCubemapHandOff.test.ts` (renamed)

**Produces:**

```ts
// src/@types/engine/frame/CaptureFaceContexts.d.ts
/** Per capture, the synthetic camera each face scheduled this frame draws through. */
export type CaptureFaceContexts = ReadonlyMap<
  CubemapCaptureKey,
  ReadonlyMap<CubeFace, ReadyFrameContext>
>;

// src/services/engine/frame/scheduleCubemapCaptures.ts
export function scheduleCubemapCaptures(input: {
  readonly state: EngineState;
  readonly ctx: ReadyFrameContext;
}): CaptureFaceContexts;
```

**Consumes:** `CUBEMAP_CAPTURES`, `ALL_CUBE_FACES`, `cubemapFaceContext`,
`regionRelativeDistanceMpc`, `sceneBodyStates`, `fadeBand`,
`state.cubemapCaptures`.

One map, not the current pair (`skyCubemapFacesToCapture` + `skyCubemapFaceContexts`):
a face is scheduled **iff** it has a context, so the "all six or none" rule stops
being an invariant held between two values and becomes the shape of one. A row
whose sweep produced fewer than six contexts contributes **no** entry at all, which
is today's pre-bootstrap behaviour (leave `bakedSettings` untouched, retry next frame).

Two side effects, both today's and both documented in the module header:
it is the single writer of each row's `CubemapCaptureRuntime`, and it calls
`ctx.renderTargets.reconcile(state, ctx.canvasSize)` on a band edge — the row's
50 MB must exist on the band-entry frame, which is the frame that sweeps.

- [ ] Move the whole capture block out of `renderFrame.ts` into the new file, as a
      loop over `CUBEMAP_CAPTURES` entries: per row, distance to `row.anchor`
      (recorded unconditionally), `fadeBand(row.band, …) > 0`, the band edge
      (reconcile; clear `bakedSettings` on close), and — in band, when
      `rosterSettling || bakedSettings !== state.settings` — a sweep of
      `ALL_CUBE_FACES` through `cubemapFaceContext` with
      `faceSizePx: ctx.renderTargets.sizeOf(row.target).width`, `row.nearMpc`,
      `row.viewSlotBase`. `sceneBodyStates(state, ctx)` is evaluated once, outside
      the loop, as today.
- [ ] Shorten the moved commentary to the budget. What earns its place on the new
      module: the texel-exactness derivation for one bake per band, what is
      deliberately absent from the re-bake key (`tier`, `faceSizePx`, `selection`)
      and why, the two roster inputs that move without a settings write, and the
      reconcile-on-edge reason. What does not: the per-field restatements.
- [ ] `renderFrame.ts` calls it and derives the expansion's face lists from the
      one map inline, so there is no second list to drift:
      `captureFaces: new Map([...captureContexts].map(([key, faces]) => [key, [...faces.keys()]]))`
      (the `FrameInputs` field lands in Task 4; until then keep feeding
      `skyCubemapFacesToCapture` off the same expression).
- [ ] `starAggregatesPass.ts` stops hard-coding the capture target for its
      viewport: on a capture face (`ctx.viewSlot !== 0`) the destination size IS
      `ctx.canvasSize` — `cubemapFaceContext` builds the synthetic ctx from the
      row's `faceSizePx` — so
      `ctx.viewSlot !== 0 ? ctx.canvasSize : ctx.renderTargets.sizeOf('star-aggregates')`
      is identical today and stays right for a second capture at a different face
      size. Keep the `STAR_GLOW_MIN_PX`-floor rationale comment; drop the
      `'sky-cubemap'` half of it.
- [ ] `npm run move-files -- tests/services/engine/frame/renderFrame.skyCubemapHandOff.test.ts tests/services/engine/frame/renderFrame.cubemapCaptures.test.ts`.
      The file keeps driving `renderFrame` with `executeFrame` and the face-context
      factory mocked — it is the end-to-end wiring test and all nine of its
      assertions are the acceptance criteria for this task, unchanged in meaning.
      Update the mocked module path to `cubemapFaceContext` and the argument
      assertions to the new keyed shape. No new test: this task moves code.
- [ ] `npm test -- renderFrame frameFilePurity` green; `npm run typecheck`.
- [ ] Commit.

---

## Task 4: `FRAME_ORDER`'s capture line names a capture, not a target

**Files:** `src/@types/engine/frame/CaptureFaceRef.d.ts` (new),
`src/@types/engine/frame/FrameStep.d.ts`,
`src/@types/engine/frame/CaptureStepSpec.d.ts`,
`src/services/engine/frame/frameOrder.ts`,
`src/services/engine/frame/expandFrameOrder.ts`,
`src/services/engine/frame/checkFrameOrder.ts`,
`src/services/engine/frame/timing/maxFrameInputs.ts`,
`tests/services/engine/frame/{expandFrameOrder,checkFrameOrder}.test.ts`,
`tests/services/engine/frame/timing/timedSlot*.test.ts`

**Produces:**

```ts
// src/@types/engine/frame/CaptureFaceRef.d.ts
export type CaptureFaceRef = {
  readonly key: CubemapCaptureKey;
  readonly face: CubeFace;
};

// CaptureStepSpec — the authored FRAME_ORDER line
export type CaptureStepSpec = {
  readonly kind: 'capture';
  readonly capture: CubemapCaptureKey;
  readonly cosmoPasses: readonly string[];
  readonly near0Passes: readonly string[];
};

// FrameStep, render arm — exactly one of target / capture
| ({
    kind: 'render';
    slab: number;
    passes: readonly ContentPass[];
    depthLoad?: 'clear' | 'load';
    slot?: string;
  } & (
    | { target: string; capture?: undefined }
    | { target?: undefined; capture: CaptureFaceRef }
  ))

// expandFrameOrder
export type FrameInputs = {
  …
  readonly captureFaces: ReadonlyMap<CubemapCaptureKey, readonly CubeFace[]>;
  …  // replaces skyCubemapFacesToCapture; `lensBodySlabs` unchanged
};
```

`captureFaces` stays separate from `CaptureFaceContexts` on purpose: `MAX_FRAME_INPUTS`
must enumerate every face that could ever be stepped, with no camera to derive —
so the expansion's input cannot be the context map.

The roster stays on the `FRAME_ORDER` line rather than moving onto the table row:
order and roster are the same artifact, so a second capture that draws a different
roster is a second `capture` **line**, expanded against its own key.

- [ ] `FrameStep`'s render arm: delete `face`, add the two-arm destination union
      and `capture`. Keep the union inline in the file (one exported type per
      `@types` file). The `capture?: undefined` member is what lets
      `step.capture === undefined ? step.target : step.capture.key` narrow to
      `string` in both directions.
- [ ] `slabs.ts`: `groupKeyOf(target, slab)` → `groupKeyOf(step)`, deriving its
      base name from that same ternary. Three call sites (`executeFrame`,
      `timedSlotRowsOf`, `plainPassGroupKeys`) then cannot disagree about a capture
      step's group key — which is the reason the current signature is shared at all.
      `slabs.ts`'s `ALLOWED` row is unchanged (18).
- [ ] `expandFrameOrder`'s `capture` arm: expand
      `frame.captureFaces.get(spec.capture) ?? []` into the COSMO + NEAR0 step pair
      per face, each carrying `capture: { key: spec.capture, face }` and
      `target: CUBEMAP_CAPTURES[spec.capture].target`. (Task 5 drops the `target`.)
      `sameGroup` compares `capture?.key` and `capture?.face` alongside `target`.
- [ ] `frameOrder.ts`: the capture line becomes `capture: 'sgrAStar'`. Its comment
      keeps the two-roster and ordering rationale, loses "the black-hole lens's
      sky-cubemap bake" as the line's identity — the row is.
- [ ] `checkFrameOrder`'s capture arm returns
      `targets: [CUBEMAP_CAPTURES[spec.capture].target]`, so the boot check still
      proves the capture lands in a declared render-target row. A bogus key is a
      typecheck error, so no runtime key check is added.
- [ ] `timedSlotRowsOf` / `plainPassGroupKeys` / `passTimingSlotName` /
      `renderStepTimingSlotName` take `step.capture?.face` where they took
      `step.face`. `passGroupTitles`' two rows become `'sgrAStar·COSMO'` /
      `'sgrAStar·NEAR0'` (still titled `'Sky capture'`). **Named delta:** GPU-timing
      slot names change from `sky-cubemap·…` to `sgrAStar·…` — DebugPanel and perf
      harness row labels, not render behaviour.
- [ ] `MAX_FRAME_INPUTS.captureFaces` is built from the table
      (`Object.keys(CUBEMAP_CAPTURES)` → `ALL_CUBE_FACES`), sized off the registry
      the way `foregroundChain` is off `BODY_SLAB_CAPACITY`, so a second row gets
      its timing slots without an edit here.
- [ ] Existing tests keep their names; update fixtures. In
      `expandFrameOrder.test.ts` the two capture assertions —
      `emits a COSMO capture step alongside NEAR0 per requested face` and
      `emits no capture steps when no faces are requested (Q6 zero-dispatch)` —
      now drive `captureFaces` and assert `step.capture`.
- [ ] `npm test -- expandFrameOrder checkFrameOrder timedSlot renderFrame` green;
      `npm run typecheck`.
- [ ] Commit.

---

## Task 5: a capture face's attachment resolves through the table

**Files:** `src/services/engine/frame/captureFaceAttachment.ts` (new),
`src/services/engine/frame/executeFrame.ts`,
`src/services/engine/frame/expandFrameOrder.ts`,
`src/@types/engine/frame/FrameStep.d.ts`,
`src/@types/engine/frame/ExecuteFrameArgs.d.ts`,
`tests/services/engine/frame/executeFrame.test.ts`

**Produces:**

```ts
// src/services/engine/frame/captureFaceAttachment.ts
/** The colour attachment one capture face writes: the capture row owns the texture. */
export function captureFaceAttachment(
  capture: CaptureFaceRef,
  targets: RenderTargets,
): { readonly view: GPUTextureView; readonly clearValue: GPUColor };

// ExecuteFrameArgs
/** Per-capture, per-face camera override for capture steps. */
captureContexts?: CaptureFaceContexts;   // was skyCubemapFaceContexts
```

This is J2: the **one** site that turns a capture key into a texture. Today it
resolves `layerViewOf(row.target, face)` plus `specOf(row.target).clearValue`;
a per-body probe later resolves that body's own cube texture from the same key,
in this function and nowhere else.

- [ ] Add `captureFaceAttachment`. `expandFrameOrder`'s capture arm stops setting
      `target` (and stops importing `CUBEMAP_CAPTURES`); `FrameStep`'s union is
      already shaped for it.
- [ ] `executeFrame`'s render arm resolves the destination once:
      `step.capture === undefined` ⇒ `{ view: viewFor(step.target, ctx, swapView), clearValue: ctx.renderTargets.specOf(step.target).clearValue }`,
      else `captureFaceAttachment(step.capture, ctx.renderTargets)`. `viewFor`
      loses its `face` parameter and the paragraph about it. `colorAttachment` takes
      `(view, clearValue, touched)` instead of `(ctx, target, view, touched)` so
      both strategies in `renderGroup` can rebuild it per-layer. `renderGroup` takes
      the resolved `dest` plus an optional `depthTarget` (absent for capture steps —
      capture rows are depthless) and no longer takes `swapView`.
      `executeFrame`'s `ALLOWED` row stays **7**.
- [ ] Per-face first touch keys on the capture: `` `${step.capture.key}:${step.capture.face}` ``.
      With one row this is byte-identical to today's `` `${target}:${face}` ``;
      it is what keeps two captures' face 0 apart.
- [ ] Capture steps no longer add to `touched` / `ctx.renderedTargets`, and no
      longer consult `depthLoadOpFor`. **Named delta, unobservable:** the only
      reader of `renderedTargets` is the `'foreground:0'` guard in four overlay
      passes, and no composite step sources a capture target — so `'sky-cubemap'`'s
      membership was never read. State this in the code comment where the branch is.
- [ ] `ExecuteFrameArgs.skyCubemapFaceContexts` → `captureContexts`; the lookup
      becomes `captureContexts?.get(step.capture.key)?.get(step.capture.face)`, and
      a missing entry still skips the step cleanly. `renderFrame` passes the map
      from Task 3 straight through.
- [ ] `executeFrame.test.ts`: the six capture fixtures become
      `capture: { key: 'sgrAStar', face: N }` with no `target`. The four existing
      capture tests keep their names and meaning. Rewrite the attachment one as
      `it('resolves each capture face through the capture row's target layer view, never viewOf')` —
      six faces, six distinct views, none equal to `viewOf('sky-cubemap')`.
- [ ] `npm test -- executeFrame expandFrameOrder renderFrame frameFilePurity` green;
      `npm run typecheck`.
- [ ] Commit.

---

## Task 6: the lens's band gate leaves `renderFrame`

**Files:** `src/services/engine/frame/sgrAStarBandAlpha.ts` (new),
`src/services/engine/frame/lensBodySlabs.ts` (new),
`src/services/engine/frame/renderFrame.ts`,
`src/services/engine/frame/passes/sgrAStarLensingPass.ts`,
`tests/services/engine/frame/frameFilePurity.test.ts`,
`tests/services/engine/frame/lensBodySlabs.test.ts` (new),
`docs/backlog/2026-09-09-sky-cubemap-band-memory-derived.md`

**Produces:**

```ts
// src/services/engine/frame/sgrAStarBandAlpha.ts
/** This frame's `sgrAStarLensing` fade-band alpha — the lens's zero-dispatch gate. */
export function sgrAStarBandAlpha(state: PassState, ctx: ReadyFrameContext): number;

// src/services/engine/frame/lensBodySlabs.ts
/** Sgr A*'s body-m slab row(s) to expand the `lens` line over; empty outside the band. */
export function lensBodySlabs(state: EngineState, ctx: ReadyFrameContext): readonly number[];
```

Which slab the lens draws on is lens business, not capture business — it rode the
same `if (bandActive)` only because both lived in `renderFrame`. Extracting it
leaves `renderFrame` declaring nothing but itself, and `sgrAStarBandAlpha` keeps
P1 from minting a **third** copy of the band computation beside the pass's own.

The gate must stay: outside the band the `lens` line has to expand to nothing, or
`mergeAdjacent` can no longer fold the two `(hdr, NEAR0)` lines and every
out-of-band frame pays an extra `rgba16float` pass boundary.

- [ ] Extract `bandAlphaFor` and `GALACTIC_CENTRE_REGION` out of
      `sgrAStarLensingPass.ts` into `sgrAStarBandAlpha.ts`; the pass imports it.
      Lower its `ALLOWED` row from 5 to **3**.
- [ ] The pass's own cube read becomes
      `ctx.renderTargets.cubeViewOf(CUBEMAP_CAPTURES.sgrAStar.target)` — the lens
      knows WHICH capture it samples, not which texture that capture happens to own.
- [ ] Add `lensBodySlabs.ts` — `sgrAStarBandAlpha(...) > 0` then the
      `ctx.slabs.find(slab => slab.frame.kind === 'body-m' && slab.frame.bodyId === SGR_A_STAR.id)`
      lookup, returning `[]` or `[index]`. Keep the "resolve here, hand data down"
      note (the row's painter-order index comes from `deriveSlabs`).
- [ ] `renderFrame.ts` calls it; delete `GALACTIC_CENTRE_REGION` and
      `ALL_CUBE_FACES` from the file, and **delete** its `ALLOWED` row (now 0).
      Trim the module header: the `state.skyCubemapCapture` paragraph is stale, and
      the file's remaining job is the focus write, the encoder lifecycle and the
      timing window.
- [ ] `tests/services/engine/frame/lensBodySlabs.test.ts`: - `it('resolves Sgr A*'s body-m slab index inside the lensing band')` - `it('resolves nothing outside the band, so the two hdr·NEAR0 lines still merge')` —
      assert `[]`, and that `expandFrameOrder` with that empty list yields ONE
      `(hdr, NEAR0)` render step.
- [ ] Refresh `docs/backlog/2026-09-09-sky-cubemap-band-memory-derived.md` to the
      new names (`cubemapCaptures`, `lastAnchorDistanceMpc`,
      `scheduleCubemapCaptures`). The item is **not** consumed by P1 — the
      last-frame memory is still stored, just per capture row.
- [ ] `npm test` (full) green; `npm run typecheck`.
- [ ] Commit.

---

## Out of scope (deferred)

- **The solar-system sky bake row** and **per-body reflection probes** — each is a
  `CUBEMAP_CAPTURES` row plus, for a probe, the second arm in
  `captureFaceAttachment`. They land with the PBR feature, not here.
- **The `probe` variant of `CubemapCapture`.** The spec's ideal shape sketches
  `CubemapCapture` as a `kind: 'sky' | 'probe'` union; with no probe row in P1 that
  arm is dead code, so P1 ships the single row shape. The union arrives with its
  first row.
- **`CaptureRuntime`'s `pending` / `facesDone`.** The spec's sketch is
  probe-shaped (one face per frame, one refresh in flight). The lens bakes all six
  faces in one frame keyed on a settings reference; P1 keeps exactly those three
  fields per row and adds the async-refresh fields when a probe needs them.
- **Deriving `VIEW_SLOT_COUNT` from the table.** One row, seven slots, unchanged;
  the cross-file invariant is pinned by Task 1's test instead.
- **`docs/backlog/2026-09-09-sky-cubemap-band-memory-derived.md`** — the
  `lastBandActive` / `lastAnchorDistanceMpc` last-frame memory and the
  edge-triggered `reconcile` survive P1 unchanged, per capture row. Still a backlog
  item.
- **P2–P5 and the feature** — the `meshBodyRenderer` global group, `pbrDirect`'s
  `vec3` f0, the prebake `BAKE_PASSES` table, `meshFetcher` /
  `MESH_TEXTURE_SLOTS`, the BRDF LUT, GGX prefilter, and every shader change.
- **Any `ContentPass` change.** Roster selection stays on the `FRAME_ORDER` capture
  line (a second capture with a different roster is a second line), so the
  `ContentPass.skyCapture` field the spec's growth list anticipates is not needed.

## Definition of Done

**Deliverable inventory**

- `src/data/rendering/cubemapCaptures.ts` exports `CUBEMAP_CAPTURES` (a
  `Record<CubemapCaptureKey, CubemapCapture>`, one `sgrAStar` row) and `ALL_CUBE_FACES`.
- `EngineState.cubemapCaptures` is a `Readonly<Record<CubemapCaptureKey, CubemapCaptureRuntime>>`;
  `EngineState.skyCubemapCapture` and `SkyCubemapCaptureRuntime` no longer exist
  anywhere in `src/` or `tests/`.
- `scheduleCubemapCaptures`, `captureFaceAttachment`, `cubemapFaceContext`,
  `lensBodySlabs`, `sgrAStarBandAlpha` each exist as their own file exporting one symbol.
- A capture `FrameStep` carries `capture: CaptureFaceRef` and **no** `target`;
  `FrameStep.face` is gone. `FRAME_ORDER`'s capture line names `capture: 'sgrAStar'`.
- `frameFilePurity`'s `ALLOWED` carries `frame/cubemapFaceContext: 4`,
  `frame/passes/sgrAStarLensingPass: 3`, and **no** `frame/renderFrame` row.
- No `skyCubemap*` identifier survives in `src/` or `tests/`
  (`skyCubemapCapture`, `SkyCubemapCaptureRuntime`, `skyCubemapFaceContext`,
  `skyCubemapFacesToCapture`, `skyCubemapFaceContexts`), and the literal
  `'sky-cubemap'` appears only in `renderTargets.ts`'s row and the
  `CUBEMAP_CAPTURES` row that names it.

**Named observable behaviours (manual smoke — the lens must look untouched)**

Run the dev server, focus Sgr A\* and descend into the lensing band (inside
~500 au of the galactic-centre anchor):

1. The lensed disc renders with a **star field and galaxies warped around it** —
   not black, not a stale-looking ring. A black ring means the capture never ran or
   wrote the wrong layer.
2. Move the camera **within** the band: the lensed sky stays stable and does not
   re-bake or flicker (one bake per band entry).
3. Drag the DebugPanel's cubemap-resolution knob (256 → 2048): the lensed sky
   visibly re-sharpens within a frame or two, with no black frame in between.
4. Leave the band and re-enter: the lens comes back fully baked on the first
   in-band frame, not one frame late.
5. Toggle a source's visibility while in band (a roster ramp): the lensed sky
   picks the change up and settles.
6. With `?gpuTimings`, the capture rows appear under **Sky capture** as
   `sgrAStar·COSMO·FACE[0…5]` and `sgrAStar·NEAR0·FACE[0…5]` — 12 rows on a bake
   frame, and **no** capture pass at all while the band is closed.
7. Out of band, the GPU-timing list shows a **single** `hdr·NEAR0` group (the two
   roster lines still merge); the lens step is absent.

**Perf gate**

Paired A/B with `npm run perf` (read `.claude/skills/perf/SKILL.md`; in a worktree
pass `--url http://localhost:<this server's port>`), before and after the branch,
at one in-band Sgr A\* pose and one out-of-band pose. Expected: neutral. A
regression at the out-of-band pose means the `(hdr, NEAR0)` merge was lost.

**Deferral boundary**

No second capture row, no probe union arm, no async refresh fields, no shader,
renderer or data-format change, and no change to what the lens draws. Everything
under "Out of scope (deferred)" stays untouched.
