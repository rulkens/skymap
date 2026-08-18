# Target contributions — rung 2 of the engine-composition ladder

**Status.** Plan. **Date.** 2026-08-18.
**Scope.** Rung 2 of the ladder in
[`docs/research/engine/decisions.md`](../../research/engine/decisions.md)
(decision #9): _"**2** target contributions (`clearValue` onto the spec row,
`scale` as `number | (state)=>number`, blend/format-parity validation; deletes
the `mwAggregateDivisor` param + `runFrame` rebuild branch)"_, widened by
decision #11: _"rung 2 grows the aggregate→upsample shared primitive
(copy-paste ×4 confirmed … its bolted-on caption draw means the shared
primitive needs an optional post-blit hook to fit it without a per-row
exception)"_. Every claim below is cited by `file:line`, verified against this
checkout (`refactor/target-contributions`, base `67bf9d291`) on 2026-08-18.

**Ground preparation.** None needed — resolves against decisions.md, which is
this rung's spec. Decision #9 states the ladder itself _is_ the ground-prep
programme; rung 1 (the GPU-handle registry, merged as #571) is this rung's
prerequisite and has landed. No separate spec exists or is wanted for a rung.

**Behaviour-neutral.** Every task preserves rendered pixels, the frame's step
list, and the derived timing-slot names. See "How parity is demonstrated"
below — it is part of the rung's definition, not an afterthought.

## What this rung does and does not touch

**In scope** — the render-target contribution family:

- The 12-row target table and its `RenderTargetSpec` shape
  (`renderTargets.ts:216-244`, `RenderTargetSpec.d.ts:20-29`).
- `TARGET_CLEAR_VALUES` (`renderTargets.ts:167-191`) — the second table beside
  the specs, read independently by two consumers (`executeFrame.ts:110`,
  `runBloom.ts:61`). Contracts-map §8 item 1 ("kill the drift pair").
- The `mwAggregateDivisor` construction parameter
  (`renderTargets.ts:218,250`) and the bespoke rebuild branch inside the frame
  loop (`runFrame.ts:211-246`) — contracts-map §2 loose spot 🔴.
- The verbatim-quadruplicate downscaled-viewport derivation in the four
  producer layers (`scalarVolumeLayer.ts:61-63`, `starAggregatesLayer.ts:59-61`,
  `milkyWayAggregateLayer.ts:68-70`, `zoneOfAvoidanceLayer.ts:42-44`) — and the
  sizing rule they duplicate, which **already exists** as
  `src/utils/gpu/reducedTargetSize.ts:12-14`, whose docblock says "Must match
  `renderTargets.ts`'s `allocate` — same formula, same clamp". Counting that
  helper and `allocate` itself (`renderTargets.ts:275-276`), the expression is
  written **six** times today and `src/` calls the helper **zero** times. Task 3
  makes `allocate` its first `src/` caller. The helper is not inlined away: it
  has a live cross-project consumer
  (`tools/galaxy-renderer/src/engine/gpu/createGalaxyRenderTargets.ts:147-148`).
- The four copy-pasted upsample layers (`volumeUpsampleLayer.ts:44-62`,
  `starAggregateUpsampleLayer.ts:40-55`, `milkyWayUpsampleLayer.ts:49-68`,
  `zoneOfAvoidanceUpsampleLayer.ts:19-49`) → one shared primitive with an
  optional post-blit hook (decision #11).
- Format parity between the target rows and the pipeline-format literals baked
  into `GPU_HANDLE_ROWS` (`gpuHandleRegistry.ts:280-285` admits the invariant
  is "convention + this comment only").
- Two carried items from rung 1's final review — see the next two sections.

**Out of scope, with reasons:**

- **Blend parity.** `ContentLayer.blend` is advisory and unchecked
  (`ContentLayer.d.ts:41-54`: "This value must match the profile baked into the
  renderer pipeline its `draw` calls, but nothing enforces that today"). No
  renderer handle exposes its baked blend state, so a check written today could
  only compare the layer's declaration against itself — a mirror test by
  `testing.md`'s definition. Making it checkable means adding a `blend`
  accessor to ~41 renderer handle types: that is renderer-contract work
  (rung 1's family), not target-contribution work. Recorded here as the
  prerequisite, deferred with it. The FORMAT half of #9's
  "blend/format-parity validation" IS delivered, structurally, by Task 6.
- **The `foreground:0` gate ×8 → step-level gate** (decisions #7; outliers §6
  lists it as "rides rung 2 or the eventual frame-step work"). Deferred:
  `fieldStarSphereLayer` is the one `foreground:0` row WITHOUT the gate
  (outliers §5 bug-suspect), so hoisting the gate to the frame step would
  newly gate that layer — a behaviour change, possibly a bug fix, which a
  behaviour-neutral rung must not smuggle in. It belongs with the `FrameStep`
  family plus a deliberate verify-then-fix of that suspect.
- **Fullscreen-triangle dedup ×5 + fade-scratch ×4 + grow-buffer ×7 + hypot
  ×10.** Outliers §6 assigns "shader dedup" to rung 2, but decisions #11 —
  written later, and the ratifying decision — puts `fullscreen-tri ×5` in the
  **hygiene basket, "PR-anytime"**. Ruled: hygiene basket, not this rung. WGSL
  edits carry their own landmine surface and would blur this rung's parity
  story.
- **Compositor's dead `swapFormat`/`hdrFormat` constructor arguments**
  (`compositor.ts:178-190`) — adjacent cleanup, already ruled RESOLVED
  NEGATIVE as a bug by decisions #11; backlog-bound, not this rung.
- **Rungs 3+** — generated-artifact staleness (the MW `starCount` branch at
  `runFrame.ts:247-280` stays exactly as it is), volume ingest, wake votes,
  debug derivation, fade-manifest derivation.
- **Pick targets** stay outside `RenderTargets` (`pickProgram.ts:37-106`,
  `RenderTargetSpec.d.ts:16-17`) — a documented divergence, unchanged.

## Carried items from rung 1's final review (in scope)

1. **Filter uniformity.** The two phase filters test membership, not value:
   `initGpu.ts:82` (`!('constructPhase' in row)`) and `wireInput.ts:113`
   (`'constructPhase' in row`). Rung 2 touches both files, so this lands as
   Task 1. `buildSwapRenderers.ts:45-47` is folded in for the same idiom.
2. **Finding 4.5 — registry-key vs subsystem-key naming.** Decided below.

## Decisions this rung takes

**4.5 — how rows are keyed.** Decision #9's anti-drift line ("every family's
rows are keyed by the same subsystem `key: string` from rung 1") is refined,
because the code does not support the literal reading:

- Rung 1's `key` is **not** a subsystem key. It is the `EngineGpuHandles` field
  name (`GpuHandleKey.d.ts`), and one subsystem owns several: `milkyWay` alone
  has `milkyWayCloud`, `milkyWayCloudRenderer`, `milkyWayPickRenderer`,
  `milkyWayAggregateUpsample` (`gpuHandleRegistry.ts:236-268`). A shared
  subsystem key would collide across rows within one family.
- 6 of the 12 target rows (`hdr`, `swap`, `foreground:0`, `bloom0..4`) belong to
  **no** subsystem — decision #8 keeps them engine-core. A `key` field would
  force a fake subsystem name onto them.

**Ruling:** a row is identified in its own domain — the handle row by its
`EngineGpuHandles` field name, the target row by its `RenderTargetSpec.id`, the
upsample layer row by its `ContentLayer.name`. **Subsystem attribution is
carried by the contributing bundle, not duplicated onto each row** — exactly
the settled contract sketch (`SubsystemBundle.key` + `targets: readonly
RenderTargetContribution[]`, decisions.md §"The contract"). When the umbrella is
reassessed, target rows get **grouped** under a bundle key, never **re-keyed**.
This is binding for rungs 3–7: do not add a `key: string` to a family row whose
identity already exists in its own domain.

This ruling overturns decision #9's anti-drift sentence (`decisions.md:83-85`),
which rungs 3–7 will be written against long after this plan file has moved to
`plans/completed/`. So it does **not** live here alone: the same ruling is
recorded in `docs/research/engine/decisions.md` as **decision #12**, with #9's
sentence amended in place to point at it. That docs change ships in this PR
(house rule: docs land with the code they describe) — see the DoD.

Corollary — target ids are **not** renamed. `'mw-aggregate'`, `'zoa'`,
`'star-aggregates'`, `'foreground:0'` are cross-file contracts already read by
`ContentLayer.target`, `FrameStep.target`, `groupKeyOf` (`slabs.ts`),
`PASS_GROUP_TITLES` (`frameProgram.ts:222-238`), the derived timing-slot names,
and the perf harness's slot list. Renaming would be behaviour-visible churn in
the debug HUD for zero gain.

**The row type keeps its incumbent name.** decisions.md's sketch writes
`RenderTargetContribution` as a comment gloss ("`RenderTargetSpec` + `scale: n
| (s) => n`"), not as a second type. Per decision #6 (adopt incumbents),
`RenderTargetSpec` grows the two fields; no `RenderTargetContribution` type is
minted.

**Upsample layers stay explicit rows in `CONTENT_LAYERS`.** A tempting reading
of "target contribution" would derive the upsample layer FROM the reduced-res
target row. Rejected: layer draw order is array position in
`passes/index.ts` (`:263, :267, :290, :308`) and is load-bearing —
`milky-way-upsample` must precede `milkyWayLayer`'s multiplicative dust
(`milkyWayUpsampleLayer.ts:30-35`), `volume-upsample` sits between flow and
horizon-shell. Deriving the rows would destroy that hand-authored ordinal,
which decisions #4/#6 protect. The four layers keep their files and their
positions; only their bodies collapse onto the shared factory.

**The post-blit hook is decisions #11's ruling, adopted as-is.** The
alternative — registering ZoA's caption as a 5th `ContentLayer` right after
the upsample row — was considered and rejected here because it adds a timing
slot, changing `TIMED_SLOTS` and the DebugPanel's row list: not behaviour-
neutral. Worth revisiting at **rung 8** (label-mechanism unification), which
already owns ZoA's private MSDF path.

Say it plainly rather than leaving the next reviewer to re-litigate it:
`postBlit?` **is** a decision-#10 exception — an optional field exactly one row
sets, the literal shape `decisions.md:100-109` bans. Its licence is that
decision #11 mandates the hook by name (`decisions.md:113-118`), and the
un-exceptional alternative is measurably not behaviour-neutral. The revisit
trigger is already written: rung 8. A second row wanting `postBlit` before then
is the signal that the row shape, not the row, was wrong.

## Findings the executor must know before writing code

1. **Boot divisor is already identical.** `state.settings.milkyWay` spreads
   `MILKY_WAY_TUNING_DEFAULTS` (`initialState.ts:154-158`), and today's target
   table is constructed from `MILKY_WAY_TUNING_DEFAULTS.aggregateDivisor`
   (`gpuHandleRegistry.ts:97`). Moving the row's scale onto
   `state.settings.milkyWay.aggregateDivisor` therefore changes nothing at
   boot; it only deletes the first-frame reconcile that today's `runFrame`
   branch would perform if the two ever diverged. `state.settings` is a getter
   over the store (`engine.ts:204-206`), live from engine construction — safe
   to read inside a `GPU_HANDLE_ROWS` `construct`.
2. **`spec.scale` has SEVEN readers, and every one of them must be off it before
   the union exists.** They are: the four producer layers
   (`scalarVolumeLayer.ts:61`, `starAggregatesLayer.ts:59`,
   `milkyWayAggregateLayer.ts:68`, `zoneOfAvoidanceLayer.ts:42` — Task 3 moves
   them to `sizeOf`), the `runFrame` divisor branch (`runFrame.ts:233` — Task 4
   deletes it), `allocate` (`renderTargets.ts:275-276` — stays, it is the
   resolver), and **`bloomSrcTexelSize.ts:29`**, which does ARITHMETIC on it
   (`scale / viewportPx[0]`) and is the sole texel-size path for all five
   `bloomN` rows (called twice from `runBloom.ts:115,133`). That last one is
   easy to miss and breaks `tsc` with TS2362 the moment `scale` widens — Task 4
   owns it. After those moves the union is contained in one module rather than
   leaking to the other six sites, and **Task 3 must land before Task 4**: after
   the union exists, a `specs.find(…).scale` site no longer typechecks.
3. **`runFrame` reassigns a registry-owned handle.** `runFrame.ts:238` writes
   `state.gpu.renderTargets = createRenderTargets(...)` — a second construction
   site for a `GPU_HANDLE_ROWS` row, bypassing rung 1's walker. Task 4 deletes
   it; after this rung, `renderTargets` is constructed in exactly one place.
4. **The "no last-applied mirror" claim moves house.** `renderTargets.ts:83-92`
   argues the divisor in force is readable off the spec row, so no mirror
   exists. After Task 4 the spec row holds a _function_, and the record of what
   was applied is the allocated texture size itself (exposed by `sizeOf`). Still
   no mirror — but the header paragraph must be rewritten, not left lying.
5. **Per-row reallocation is strictly safer than today's full-table rebuild.**
   Nothing caches a view across frames — this is the exhaustive list, not a
   sample: the upsample passes rebuild their bind group per draw
   (`additiveUpsample.ts:109`, `starAggregateUpsample.ts:78`),
   `occlusionDepthGroup.ts:21` rebuilds on resize by design, and every other
   `viewOf`/`depthViewOf` call site in `src/` resolves at draw time — the four
   upsample layers (`volumeUpsampleLayer.ts:60`,
   `starAggregateUpsampleLayer.ts:53`, `milkyWayUpsampleLayer.ts:66`,
   `zoneOfAvoidanceUpsampleLayer.ts:33`), the three depth-sampling label/marker
   layers (`labelsLayer.ts:62`, `markerLinesLayer.ts:61`,
   `selectionRingLayer.ts:88`, plus `foregroundLabelsLayer.ts:792`),
   `executeFrame.ts:100/138`, and `runBloom.ts:84`'s per-call `viewOf`.
   Reconciling
   row-by-row reallocates a **subset** of what `resize` reallocates today, so
   any consumer that survives today survives this.
6. **Three comments name `renderTargets.resize()`** (`occlusionDepthGroup.ts:21`,
   `additiveUpsample.ts:109`, `starAggregateUpsample.ts:78`). Task 9 updates
   them; a fourth (`runFrame.ts:196`) sits inside the resize comment Task 4
   rewrites. Grep for the string rather than trusting this list.
7. **ZoA's post-blit runs even when the blit handle is null.**
   `zoneOfAvoidanceUpsampleLayer.ts:30-38` guards the blit and the caption
   draw **separately** ("either handle can be null on its own"). The shared
   primitive must preserve that, and Task 7 pins it with a test — it is the
   single most likely silent regression in this rung.
8. **Widening `RenderTargets` / `RenderTargetSpec` hits a fixture surface far
   wider than the tests named after the module.** `tsconfig.json:17` is
   `"include": ["src", "tests"]`, so a typed stub missing a new member fails
   `npm run typecheck`, and an `as any`/`as unknown as` stub missing it fails at
   RUNTIME inside whatever test drives the frame. The standing list — each of
   Tasks 2, 3 and 4 revisits it for the member it adds (`specOf`, `sizeOf`,
   `reconcile`):
   - typed (breaks `tsc`): `tests/utils/gpu/hdrActiveOf.test.ts:8-17`
     (`makeStub` returns a typed `RenderTargets`),
     `tests/services/engine/frame/passes/volumeUpsampleLayer.test.ts:34-70`
     (`makeCtx(): ReadyFrameContext`, uncast `renderTargets` literal),
     `tests/services/engine/phases/applySwapFormat.test.ts:21`
     (`makeSwapSpec(): RenderTargetSpec`).
   - cast (breaks at runtime, silently green under a name-filtered run):
     `applySwapFormat.test.ts:28`, `renderFrame.test.ts:140-145`,
     `renderFrame.timing.test.ts:140-145`,
     `tests/visual/renderFrameSplitBaseline.test.ts:174-179`,
     `runBloom.test.ts:84-94`, and the three producer-layer fixtures
     (`scalarVolumeLayer.test.ts:63-71`, `starAggregatesLayer.test.ts:42`,
     `zoneOfAvoidanceLayer.test.ts:44-51`). `milkyWayAggregateLayer` has **no**
     dedicated fixture — verified, don't go looking for one.
     Consequence for the workflow: Tasks 2, 3 and 4 each gate on the **full**
     `npm test`, not a name filter. A task that edits a type 30+ fixtures satisfy
     cannot prove itself with a filtered run.

No task in this plan moves or renames a `.ts` file, so `npm run move-files`
is not needed; if that changes, use it (`npm run move-files -- <from> <to>`,
`--dry` first) rather than `git mv` + hand-edited imports.

## The contract

```ts
// src/@types/engine/frame/RenderTargetSpec.d.ts — two fields added
export type RenderTargetSpec = {
  id: string;
  format: GPUTextureFormat;
  depth: GPUTextureFormat | null;
  /**
   * Downsample divisor. A function when the divisor is a live knob — resolved
   * against `state` by `renderTargets` alone; no consumer outside that module
   * reads this field (they read `sizeOf(id)`, the allocated truth).
   */
  scale: number | ((state: EngineState) => number);
  /** First-touch clear colour. Read by executeFrame and runBloom via `specOf`. */
  clearValue: GPUColor;
};
```

```ts
// src/@types/rendering/RenderTargets.d.ts — `resize` replaced, two accessors added
export type RenderTargets = {
  readonly specs: readonly RenderTargetSpec[];
  viewOf(id: string): GPUTextureView;
  depthViewOf(id: string): GPUTextureView;
  /** The declared row for `id`. Throws for an unknown id (a wiring bug). */
  specOf(id: string): RenderTargetSpec;
  /**
   * Allocated pixel size of an OFFSCREEN row — read out of the size map
   * `allocate` records beside `textures`/`views`, NEVER re-derived from
   * `canvasSize / scale`. That is what makes "viewport == texture size" true by
   * construction, and it is the same record `reconcile` compares against.
   * Throws for `swap` and unknown ids, like `viewOf`.
   */
  sizeOf(id: string): Size;
  /**
   * Reallocate every offscreen row whose desired allocation —
   * `reducedTargetSize(size, resolvedScale)` — differs from what it currently
   * holds. The ONE seam for both canvas resize and a live scale knob: two
   * inputs to one question, answered once. Rows already at their desired size
   * are left untouched (their views keep identity). Unrelated to
   * `store/effects/ReconcileEffects.ts`, which owns the word for the
   * store→engine callback surface: this one reconciles TEXTURES against a size.
   */
  reconcile(state: EngineState, size: Size): void;
  setSwapFormat(next: GPUTextureFormat): void;
  destroy(): void;
};
```

```ts
// src/services/gpu/renderTargets.ts — exported table + factory signature
export function renderTargetRows(swapFormat: GPUTextureFormat): readonly RenderTargetSpec[];
export function createRenderTargets(
  device: GPUDevice,
  swapFormat: GPUTextureFormat,
  size: Size,
  state: EngineState,
): RenderTargets;
```

```ts
// src/@types/rendering/Upsample.d.ts
/** The shape `AdditiveUpsample` and `StarAggregateUpsample` both satisfy. */
export type Upsample = { draw(pass: GPURenderPassEncoder, srcView: GPUTextureView): void };
```

```ts
// src/@types/engine/frame/UpsampleLayerRow.d.ts
/**
 * One reduced-res-accumulation → HDR composite. `target: 'hdr'` and
 * `blend: 'additive'` are the primitive's constants, not row data.
 */
export type UpsampleLayerRow = {
  readonly name: string;
  readonly slab: number;
  /** The reduced-res `RenderTargetSpec.id` this row composites. */
  readonly sourceTargetId: string;
  /** Handle accessor rather than a `state.gpu` key — no index cast, exact types. */
  readonly handleOf: (state: EngineState) => Upsample | null;
  readonly enabled: ContentLayer['enabled'];
  /**
   * Full-res content drawn into HDR after the blit, under the same gate —
   * MSDF captions that cannot ride a reduced-res target. Runs INDEPENDENTLY
   * of the blit handle's nullity (see finding 7).
   */
  readonly postBlit?: ContentLayer['draw'];
};
```

```ts
// src/services/engine/frame/passes/createUpsampleLayer.ts
export function createUpsampleLayer(row: UpsampleLayerRow): ContentLayer;
```

```ts
// src/data/renderTargetFormats.ts
export const HDR_TARGET_FORMAT: GPUTextureFormat = 'rgba16float';
export const FOREGROUND_DEPTH_FORMAT: GPUTextureFormat = 'depth32float';
```

## How parity is demonstrated

Behaviour-neutrality is the rung's definition, so it is checked four ways, not
asserted:

1. **No test ASSERTION changes.** Every existing test in
   `executeFrame.test.ts` (esp. `clears a target on its first pass of the frame
and loads on later passes`, `:299`), `runBloom.test.ts` (esp. `opens each
pass against the level it writes, clearing producers and loading folds`,
   `:147`), `renderTargets.test.ts`, and `passes.test.ts` must pass with their
   **assertions** unmodified. What DOES change, widely, is stubs: every
   `RenderTargets` / `ReadyFrameContext` fixture gains the members the tasks
   add (`clearValue` on spec rows; `specOf` / `sizeOf` / `reconcile` on the
   handle), across the surface finding 8 enumerates, and each task's file list
   names the fixtures it must touch. An **assertion** that needs editing is
   still the stop signal — except where a task names a RELOCATION (the subject
   of the assertion moved modules, so the test follows it): the two
   producer-layer clamp tests (`scalarVolumeLayer.test.ts:133`,
   `zoneOfAvoidanceLayer.test.ts:114`) in Task 3, and `runFrame.test.ts`'s
   divisor test in Task 4 (gate 2). Anything else: stop and re-read.
2. **Migrated coverage, not deleted coverage.** `runFrame.test.ts:734-772`
   (`rebuilds the offscreen table when the divisor setting moves, and leaves it
alone when it does not`) moves to `renderTargets.test.ts` as two `reconcile`
   tests, carrying its bug-history comment (`:736-742`). Its second half — "or
   every steady-state frame would throw away and re-allocate every offscreen
   target" — is the regression that matters most; it must survive verbatim in
   intent.
3. **Derived-artifact identity.** `TIMED_SLOTS`, `TIMED_SLOT_GROUPS`, and
   `PASS_GROUP_KEYS` (`frameProgram.ts:364-390`) are pure functions of the step
   list + `CONTENT_LAYERS`; this rung changes neither, so the DebugPanel's slot
   names and grouping must be **identical** before and after. Task 10 checks
   this by eye in the HUD; `timedSlotsGroupKeys.test.ts` covers it in CI.
4. **Visual smoke over the named behaviours** in the DoD, including the one
   dynamic-scale row (the aggregate-divisor slider) and the swap-format row
   (HDR toggle) — the two paths with no automated pixel assertion.

## Tasks

**Execution order (binding).** Tasks 2–6 all mutate
`src/services/gpu/renderTargets.ts` and must run **strictly sequentially, in
number order** — no pipelined execution, even though the SDD workflow pipelines
_reviews_. Three of those orderings are load-bearing, not just file-contention:

- **T3 → T4** — the four producer layers must be off `spec.scale` before it
  becomes a union (finding 2), and `reconcile` compares against the size record
  T3 introduces.
- **T4 → T5** — Task 5's exported signature `renderTargetRows(swapFormat)` has
  ONE parameter, which only exists after Task 4 deletes `mwAggregateDivisor`
  from `buildSpecs` (`renderTargets.ts:216-219`).
- **T5 → T6** — Task 6 edits the format literals inside the very rows whose
  enclosing function Task 5 renames.

T2 → T3 and T4 → T6 are additive; sequencing alone is enough. Task 1 is
genuinely independent of the target family (`initGpu`/`wireInput`/
`buildSwapRenderers` only) and may ship first or separately. Task 7 → Task 8 is
produce→consume. Task 9 runs **last** of the code tasks: it rewrites docblocks
Tasks 2–4 shape. Task 10 is the gate.

Tasks 2, 3 and 4 each gate on the **full** `npm test`, not a name filter — see
finding 8. The suite must be green at every commit, not merely the filtered run.

### Task 1 — Phase filters test the value, not the key (carried item 1)

**Files:** `src/services/engine/phases/initGpu.ts`,
`src/services/engine/phases/wireInput.ts`,
`src/services/engine/phases/buildSwapRenderers.ts` (modify)

`GPU_HANDLE_ROWS` is `as const satisfies` (`gpuHandleRegistry.ts:71,420`), so
its element type is a union of literal object types and a bare
`row.constructPhase` is TS2339 on the members that omit the field — which is
why the `in` idiom was reached for. The fix is to annotate the predicate
parameter with the wider declared row type; TS accepts a callback whose
parameter is a supertype of the element type, and `filter` still returns the
literal-union element type, so `constructGpuHandles`' argument type is
unaffected.

- [x] `initGpu.ts:82` → `GPU_HANDLE_ROWS.filter((row: GpuHandleRow) => row.constructPhase !== 'wireInput')`.
- [x] `wireInput.ts:113` → `GPU_HANDLE_ROWS.filter((row: GpuHandleRow) => row.constructPhase === 'wireInput')`.
- [x] `buildSwapRenderers.ts:45-47` → `GPU_HANDLE_ROWS.filter((row: GpuHandleRow) => row.rebuildOnSwapFormat === true)`,
      replacing the two-clause `in`-plus-truthiness guard. Its 6-line
      explanatory comment (`:41-44`) shrinks accordingly — the
      `exactOptionalPropertyTypes` hazard it warns about is answered by the
      `=== true` value test itself.
- [x] Import `GpuHandleRow` as a type where not already imported.
- [x] `npm run typecheck` + `npm test -- initGpu wireInput buildSwapRenderers`.
- [x] Commit.

### Task 2 — `clearValue` onto the row; `specOf` replaces the `find`s

**Files:** `src/@types/engine/frame/RenderTargetSpec.d.ts`,
`src/@types/rendering/RenderTargets.d.ts`,
`src/services/gpu/renderTargets.ts`,
`src/services/engine/frame/executeFrame.ts`,
`src/services/engine/frame/runBloom.ts`,
`src/services/engine/phases/applySwapFormat.ts`,
`src/utils/gpu/hdrActiveOf.ts` (modify),
`tests/services/gpu/renderTargets.test.ts`,
`tests/services/engine/frame/executeFrame.test.ts`,
`tests/services/engine/frame/runBloom.test.ts`,
`tests/utils/gpu/hdrActiveOf.test.ts`,
`tests/services/engine/phases/applySwapFormat.test.ts`,
`tests/services/engine/frame/passes/volumeUpsampleLayer.test.ts`,
`tests/services/engine/frame/renderFrame.test.ts`,
`tests/services/engine/frame/renderFrame.timing.test.ts`,
`tests/visual/renderFrameSplitBaseline.test.ts` (modify)

**Signature:** `specOf(id: string): RenderTargetSpec` — returns the declared
row; throws `` `renderTargets: no spec row for target '${id}'` `` for an
unknown id (same loud-failure discipline as `viewOf`).

- [x] Add `clearValue: GPUColor` to `RenderTargetSpec`. Note in its docblock
      that the "locked cross-plan contract" caveat at `renderTargets.ts:151-155`
      is what this rung deliberately unlocks (decisions #9), so a future reader
      doesn't re-lock it.
- [x] Move all **12** `TARGET_CLEAR_VALUES` entries onto the matching row in
      `buildSpecs` (`renderTargets.ts:220-243`): the **7 named** ones — `hdr`
      (`:168`), `volume` (`:169`), `zoa` (`:173`), `star-aggregates` (`:174`),
      `mw-aggregate` (`:178`), `foreground:0` (`:179`), `swap` (`:190`) — plus
      the 5 generated `bloomN` (`:187-189`), one per row, no row left over.
      `hdr` and `swap` are the two that clear to **a=1**; WebGPU defaults an
      omitted `clearValue` to `{0,0,0,0}`, so dropping either is a silent
      visual change no current test would catch. **Carry the rationale comments
      with them** (`:151-191`) — they explain why each row clears a=0 vs a=1 and
      are the load-bearing half. The `bloom` rows keep their
      `Array.from(BLOOM_LEVELS)` generation; the clear value rides the same
      generated row. Delete `TARGET_CLEAR_VALUES`.
- [x] The depth-clear paragraph (`renderTargets.ts:161-165`) belongs to no row —
      it is the standing answer to "why isn't there a `depthClearValue` field
      too?" (the depth clear is the slab's far-plane convention, supplied by
      `depthClearValueFor`). Rehome it explicitly onto
      `RenderTargetSpec.clearValue`'s docblock, next to `executeFrame`'s
      `depthAttachment` pointer. Do not let it fall off the edit.
- [x] Add `specOf` to the type + implementation.
- [x] `executeFrame.ts:104-115` reads `ctx.renderTargets.specOf(target).clearValue`;
      drop the `TARGET_CLEAR_VALUES` import (`:72`) and the now-dead
      "no clear value" throw (`specOf` throws first). Also route
      `depthAttachment`'s row lookup (`:134`) and the composite's `dstFormat`
      (`:247`) through `specOf`, deleting both `specs.find(...)` expressions.
      Note in passing: `depthAttachment` today TOLERATES an unknown target
      (`specs.find(...)` → `undefined` → `{}`) and will now throw. Unreachable
      in production — `viewFor` throws first at `:285` — so this is a
      tightening, not a behaviour change; say so rather than leaving a reviewer
      to re-derive it.
- [x] `runBloom.ts:52-68` reads the clear value the same way; drop its import
      (`:41`). Name the one real behaviour delta in this task: `runBloom.ts:61`
      is `TARGET_CLEAR_VALUES[target]!`, and under `noUncheckedIndexedAccess`
      (`tsconfig.json:7`) a missing key silently became WebGPU's `{0,0,0,0}`.
      `specOf` throws instead. Better behaviour, but a behaviour-neutral rung
      states its exceptions — put it in the commit message.
- [x] `applySwapFormat.ts:22` reads `renderTargets.specOf('swap').format`.
- [x] `hdrActiveOf.ts:12` reads `renderTargets.specOf('swap').format ===
    'rgba16float'`. With `applySwapFormat` and `executeFrame`'s two, that is 4
      of the 11 `specs.find(...)` sites in `src/` gone; Task 3 takes the four
      producer layers and Task 4 the last three (see the DoD).
- [x] Fixtures (finding 8 — none of these is optional, all fail `tsc` or fail at
      runtime): spec rows gain `clearValue` wherever they are typed
      (`hdrActiveOf.test.ts:21-28`, `applySwapFormat.test.ts:21-23`,
      `volumeUpsampleLayer.test.ts:56-70`) or actually read
      (`executeFrame.test.ts:159-176`, `runBloom.test.ts:86-93` — the bloom rows
      are the ones `openBloomPass` clears through); every
      `RenderTargets`-shaped stub gains
      `specOf` (`hdrActiveOf.test.ts:8-17`, `applySwapFormat.test.ts:28,58,76,
    94,139,160`, `volumeUpsampleLayer.test.ts:56-70`,
      `renderFrame.test.ts:140-145`, `renderFrame.timing.test.ts:140-145`,
      `renderFrameSplitBaseline.test.ts:174-179`, `runBloom.test.ts:84-94`).
      The three `renderFrame*` stubs are `as any`/`as never` — they typecheck
      and then throw at runtime through `executeFrame`'s `colorAttachment`, so
      they are invisible to a filtered run. **Assertions stay as they are** —
      parity gate 1.
- [x] Add test `specOf returns the declared row and throws for an unknown id`
      to `renderTargets.test.ts`.
- [x] Add test `every declared row carries a clearValue` to
      `renderTargets.test.ts`. This is a structural check, not a registry
      restatement: two independently maintained tables are being merged, and a
      row that loses its clear value in the merge is otherwise silent.
- [x] `npm run typecheck` + **`npm test`** (full suite — a filtered run cannot
      prove this task; see finding 8).
- [x] Commit.

### Task 3 — `sizeOf` kills the quadruplicated viewport derivation

**Files:** `src/@types/rendering/RenderTargets.d.ts`,
`src/services/gpu/renderTargets.ts`,
`src/services/engine/frame/passes/scalarVolumeLayer.ts`,
`src/services/engine/frame/passes/starAggregatesLayer.ts`,
`src/services/engine/frame/passes/milkyWayAggregateLayer.ts`,
`src/services/engine/frame/passes/zoneOfAvoidanceLayer.ts` (modify),
`tests/services/gpu/renderTargets.test.ts`,
`tests/services/engine/frame/passes/scalarVolumeLayer.test.ts`,
`tests/services/engine/frame/passes/starAggregatesLayer.test.ts`,
`tests/services/engine/frame/passes/zoneOfAvoidanceLayer.test.ts`,
`tests/utils/gpu/hdrActiveOf.test.ts`,
`tests/services/engine/frame/passes/volumeUpsampleLayer.test.ts` (modify)

**Signature:** `sizeOf(id: string): Size` — the allocated pixel dimensions of
an offscreen row. Throws for `'swap'` and unknown ids, matching `viewOf`.

This must land BEFORE Task 4 (finding 2): these four sites read `spec.scale` as
a number today and stop typechecking once the union exists.

- [x] `allocate` records `sizes.set(spec.id, { width, height })` beside
      `textures`/`views`, and `sizeOf` reads THAT map, throwing on a miss the
      way `viewOf` does. Do **not** implement it as `textures.get(id)!.width`:
      the test mocks return `{ createView, destroy }` with no dimensions
      (`renderTargets.test.ts:15-20`, `runFrame.test.ts:747`), so that reading
      returns `undefined` and looks like a plan error. The size record is also
      what Task 4's `reconcile` compares against, so it is needed either way.
- [x] `allocate` computes those dimensions by calling
      `reducedTargetSize(s.width, s.height, resolvedScale)`
      (`src/utils/gpu/reducedTargetSize.ts:12-14`) instead of writing the
      `Math.max(1, Math.floor(...))` pair inline. That helper's docblock
      currently asserts "Must match `renderTargets.ts`'s `allocate` — same
      formula, same clamp"; calling it makes the claim structural and lets that
      sentence shrink to "the sizing rule for every reduced-resolution target".
      Same move Task 3 makes for the producer layers, one level down.
- [x] Replace the `specs.find(...).scale` + `Math.max(1, Math.floor(...))` pair
      in each of the four producer layers with one
      `ctx.renderTargets.sizeOf('<id>')` call. Collapse each site's copy of the
      shared rationale to a one-line pointer at `sizeOf`; keep only the part
      that is genuinely per-layer — `starAggregatesLayer.ts:50-58`'s
      `STAR_GLOW_MIN_PX`-is-in-target-pixels note and
      `milkyWayAggregateLayer.ts:65-67`'s px-sprite-clamp note earn their
      keep; the "divisor read off the spec row keeps it single-homed" sentence
      does not, once the divisor is no longer read here at all.
- [x] One line, in the module that gains the seam (not four times over): the
      viewport now comes from the ALLOCATED size rather than from
      `ctx.canvasSize / scale`. The two can disagree only in the window between
      a canvas-size change and that frame's reconcile — which `runFrame` makes
      unreachable (reconcile precedes `deriveFrameContext`). That is the actual
      content of "true by construction"; write it once instead of asserting it.
- [x] Fixtures: the three producer-layer stubs
      (`scalarVolumeLayer.test.ts:63-71`, `starAggregatesLayer.test.ts:42`,
      `zoneOfAvoidanceLayer.test.ts:44-51`) gain a `sizeOf` returning **exactly
      the size their `specs` row implied**, so the existing viewport assertions
      (`scalarVolumeLayer.test.ts:129`, `starAggregatesLayer.test.ts:133`) stay
      byte-identical. `milkyWayAggregateLayer` has no dedicated fixture —
      verified; don't hunt for one. The two typed stubs
      (`hdrActiveOf.test.ts:8-17`, `volumeUpsampleLayer.test.ts:56-70`) gain
      `sizeOf` too or `tsc` fails (finding 8).
- [x] **Relocate the clamp coverage; do not just delete it.**
      `scalarVolumeLayer.test.ts:133` and `zoneOfAvoidanceLayer.test.ts:114`
      (`clamps the downsampled viewport to a minimum of 1 px`) assert a clamp
      that after this task is not in those layers at all — left in place they
      would only assert what the stub returns. Move ONE of them to
      `renderTargets.test.ts` as a `sizeOf` case (2×2 canvas, `volume` at scale
      3 → 1×1) and delete the other; that relocation is the only thing keeping
      the min-1px clamp under test on the reader path. Note
      `renderTargets.test.ts:102` already covers the clamp on the ALLOCATION
      path (the `createTexture` descriptor) — the new case is the `sizeOf`
      reader, not a duplicate of it.
- [x] Add test `sizeOf returns the allocated pixel size of an offscreen row and throws for swap`
      — hand-computed: a 900×600 canvas gives `volume` (scale 3) 300×200 and
      `zoa` (scale 5) 180×120.
- [x] `npm run typecheck` + **`npm test`** (full suite — finding 8).
- [x] Commit.

### Task 4 — `scale` as `number | (state) => number`; `reconcile` replaces `resize`

**Files:** `src/@types/engine/frame/RenderTargetSpec.d.ts`,
`src/@types/rendering/RenderTargets.d.ts`,
`src/services/gpu/renderTargets.ts`,
`src/services/engine/gpuHandles/gpuHandleRegistry.ts`,
`src/services/engine/frame/runFrame.ts`,
`src/services/engine/frame/passes/bloomSrcTexelSize.ts`,
`src/services/engine/frame/runBloom.ts` (modify),
`tests/services/gpu/renderTargets.test.ts`,
`tests/services/engine/frame/runFrame.test.ts`,
`tests/services/engine/frame/runBloom.test.ts`,
`tests/utils/gpu/hdrActiveOf.test.ts`,
`tests/services/engine/frame/passes/volumeUpsampleLayer.test.ts` (modify)

This is the task decision #9 names: it deletes the `mwAggregateDivisor`
parameter and the `runFrame` rebuild branch.

Prior art worth reading before writing `reconcile`: the galaxy tool already
implements exactly these semantics —
`tools/galaxy-renderer/src/engine/gpu/createGalaxyRenderTargets.ts:54-59`,
_"Reallocate whichever reduced targets these divisors no longer describe. Safe
to call on every render-bag push: the comparison is against the live textures'
pixel sizes, so an unmoved divisor is a no-op."_ Independent evidence that the
design is sound and that a per-frame call is cheap. Don't re-derive it; don't
import it either (the tool keeps its own table).

- [x] Widen `RenderTargetSpec.scale` to `number | ((state: EngineState) => number)`
      (importing `EngineState` — precedent: `GpuHandleRow.d.ts:4`).
- [x] `buildSpecs` loses its `mwAggregateDivisor` parameter; the `mw-aggregate`
      row becomes
      `scale: (state) => state.settings.milkyWay.aggregateDivisor`
      (`renderTargets.ts:225`).
- [x] `createRenderTargets`' 4th parameter becomes `state: EngineState`
      (`renderTargets.ts:246-254`); `allocate` resolves the scale through a
      module-private helper.
- [x] Replace `resize(size)` (`:338-340`) with `reconcile(state, size)` per the
      contract: recompute each offscreen row's desired `(width, height)`,
      reallocate only rows whose desired size differs from what they hold, and
      reallocate a depth-bearing row's depth texture in lockstep with its
      colour texture.
- [x] Rewrite the module header's mw-divisor paragraph (`:83-92`): the record of
      the divisor in force is now the allocated texture size (`sizeOf`), not the
      spec row — still no last-applied mirror, but for a different reason
      (finding 4). Respect the comment budget: this paragraph should shrink.
- [x] `bloomSrcTexelSize.ts` (finding 2 — the reader that breaks `tsc`): its
      body becomes `const [w, h] = ctx.renderTargets.sizeOf(srcId); return [1 /
    w, 1 / h];`, and the now-unused `viewportPx` parameter goes, along with
      its two call sites' argument (`runBloom.ts:115,133`) and the
      `viewportPx` local they read it from (`runBloom.ts:83`, which has no other
      consumer). Chosen over threading `state` into a `resolveScale(spec,
    state)` export because it keeps the module's "one derivation" purpose,
      needs no new export, and removes the last `specs.find(...)` in `src/`.
      Rewrite the module header: the derivation is no longer `scale /
    viewportPx` but `1 / allocated-source-pixels`, read from the size the
      texture actually has. Name the one numeric consequence in the commit
      message: on a viewport not divisible by the divisor the two differ by the
      floor's remainder (a sub-texel tap offset), and the new value is the
      correct one — the pyramid's textures are `floor`ed, not exact.
- [x] `runBloom.test.ts`'s ctx stub gains `sizeOf` over the five `bloomN` rows
      (and `hdr`), returning `floor(1920/scale) × floor(1080/scale)` for the
      table it already declares (`:83-94`) — otherwise every bloom test throws.
- [x] `gpuHandleRegistry.ts:90-99` passes `state` instead of
      `MILKY_WAY_TUNING_DEFAULTS.aggregateDivisor`; its `construct` parameter is
      `(_state: EngineState, deps)` today (`:92`) and the underscore must go
      when the row starts using it (lint gate). Keep the
      `MILKY_WAY_TUNING_DEFAULTS` import — `milkyWayCloud` (`:236-239`) still
      needs it — and add one line to that row's comment noting the target row
      now reads settings directly, and that this is not a second path to the
      same answer: the scale function IS the reconcile path.
- [x] `runFrame.ts`: delete the whole mw-divisor branch and its comment
      (`:211-246`) and the now-unused `createRenderTargets` import (`:68`).
      Replace the in-branch `resize` call (`:208`) with an unconditional
      `state.gpu.renderTargets?.reconcile(state, { width: deps.canvas.width, height: deps.canvas.height })`
      placed immediately after the `resizeCanvasToDisplay` branch — the aspect
      write stays inside that branch. Trim the resize comment (`:189-204`) to
      match: it is now one seam answering two inputs.
- [x] `renderTargets.test.ts`: every `createRenderTargets(...)` call in the file
      passes a stub `EngineState` (a `{ settings: { milkyWay: {
    aggregateDivisor } } } as unknown as EngineState` is enough) in place of
      the `MW_DIVISOR` 4th argument, and the `MW_DIVISOR` comment (`:25-28`)
      becomes "the divisor arrives off `state`". Then: rename/adapt
      `resize reallocates offscreen textures at size/scale` (`:47`) to
      `reconcile reallocates every offscreen row when the canvas size changes`.
      Add `reconcile reallocates a row whose state-driven scale moved and leaves the other rows' views untouched`
      and `reconcile allocates nothing when neither the canvas size nor a resolved scale moved`
      (assert `device.createTexture` call count is unchanged across a second
      call — carrying the migrated comment from `runFrame.test.ts:736-742`
      about steady-state frames).
- [x] `runFrame.test.ts`: delete the `runFrame — mw-aggregate divisor` describe
      (`:734-772`) and the now-unused `createRenderTargets` import; add
      `runFrame reconciles the render targets against the live canvas size every frame`
      asserting a `reconcile` spy is called with the canvas dimensions — the
      wiring the deleted test used to protect.
- [x] The two typed stubs gain `reconcile` and lose `resize`
      (`hdrActiveOf.test.ts:8-17`, `volumeUpsampleLayer.test.ts:56-70`), or
      `tsc` fails (finding 8). Grep `resize: vi.fn()` across `tests/` for
      stragglers rather than trusting this list.
- [x] `npm run typecheck` + **`npm test`** (full suite — finding 8).
- [x] Commit.

### Task 5 — Export the row table; add the target-parity checks

**Files:** `src/services/gpu/renderTargets.ts` (modify),
`tests/services/engine/frame/targetParity.test.ts` (new)

**Depends on Task 4.** The single-parameter signature below only exists once
Task 4 has deleted `mwAggregateDivisor` from `buildSpecs`
(`renderTargets.ts:216-219`). Executing this task first would either mint a
two-parameter export or delete that parameter out from under Task 4.

**Signature:** `renderTargetRows(swapFormat: GPUTextureFormat): readonly RenderTargetSpec[]`
— today's module-private `buildSpecs`, exported under a name that says "the
declared table". `createRenderTargets` calls it.

The checks below are the buildable half of #9's "blend/format-parity
validation": they cross-check two independently maintained lists, so they are
structural invariants, not registry restatements (`testing.md`). A typo'd
`ContentLayer.target` today produces an empty group and the layer silently
never draws (`executeFrame.ts:193`) — no throw, no test failure.

- [x] Export `renderTargetRows`; keep the runtime swap format as its parameter.
- [x] Test `every CONTENT_LAYERS target names a declared render-target row`.
- [x] Test `every frameProgram step names a declared render-target row` —
      covering `render` steps' `target` and `composite` steps' `source` + `dest`
      (build the program with any tone + `bloomEnabled: true`).
- [x] Test `render-target row ids are unique`.
- [x] `npm run typecheck` + `npm test -- targetParity renderTargets`.
- [x] Commit.

### Task 6 — Single-source the target formats (the format half of parity)

**Files:** `src/data/renderTargetFormats.ts` (new),
`src/services/gpu/renderTargets.ts`,
`src/services/engine/gpuHandles/gpuHandleRegistry.ts` (modify)

**Depends on Tasks 4 and 5.** It edits the format literals inside the very rows
whose enclosing function Task 5 renames (`buildSpecs` → `renderTargetRows`),
and Task 4 has already reshaped the `mw-aggregate` row and the
`gpuHandleRegistry` `renderTargets` row this task also touches.

Per decision #10, the misfit is fixed at the contract rather than papered over
with a check: `gpuHandleRegistry.ts:280-285` states that the ~37
`'rgba16float'` / `'depth32float'` literals in renderer constructions (32 lines
in that one file) "MUST match that row's format/depth in renderTargets.ts —
nothing imports renderTargets to enforce it". Sharing one constant makes the
parity structural, which no runtime check could achieve.

- [x] Add the two constants (contract above) with a short header naming both
      consumers: the offscreen spec rows and every renderer pipeline that draws
      into them.
- [x] `renderTargets.ts`' offscreen rows use `HDR_TARGET_FORMAT`;
      `foreground:0`'s `depth` uses `FOREGROUND_DEPTH_FORMAT`. The `swap` row's
      format stays the runtime parameter.
- [x] Every `'rgba16float'` / `'depth32float'` literal in `GPU_HANDLE_ROWS`'
      `construct` bodies uses the constants — with ONE exemption: the
      `compositor` row's `hdrFormat: 'rgba16float'` argument
      (`gpuHandleRegistry.ts:82-89`). `compositor.ts:175-192` documents
      `swapFormat`/`hdrFormat` as accepted for call-site stability and no longer
      read (decisions #11 records the same fact as RESOLVED NEGATIVE), so
      substituting the shared constant there would assert a live
      target↔pipeline contract that does not exist. Leave the literal and say
      why in one clause; the argument's removal is backlog-bound, not this rung.
- [x] Rewrite the `gpuHandleRegistry.ts:280-285` comment: it no longer describes
      an unenforced convention, so it shrinks to a pointer at the shared
      constant.
- [x] No test — this is a compile-time single-sourcing, and a test asserting
      "the constant equals `'rgba16float'`" is exactly the constant restatement
      `testing.md` forbids.
- [x] `npm run typecheck` + `npm test -- renderTargets gpuHandle`.
- [x] Commit.

### Task 7 — `createUpsampleLayer` primitive (TDD)

**Files:** `src/@types/rendering/Upsample.d.ts`,
`src/@types/engine/frame/UpsampleLayerRow.d.ts`,
`src/services/engine/frame/passes/createUpsampleLayer.ts` (new),
`tests/services/engine/frame/passes/createUpsampleLayer.test.ts` (new)

**Signature:** `createUpsampleLayer(row: UpsampleLayerRow): ContentLayer` —
returns `{ name, slab, target: 'hdr', blend: 'additive', enabled, draw }` where
`draw` blits `ctx.renderTargets.viewOf(row.sourceTargetId)` through
`row.handleOf(state)` when that handle is non-null, then calls `row.postBlit`
if present. The types are contract-only; write the tests first.

- [x] Test `createUpsampleLayer blits the source target's view through the row's handle`
      — assert the handle's `draw` spy received the pass and the view `viewOf`
      returned for `sourceTargetId`.
- [x] Test `createUpsampleLayer skips the blit when the handle is null`
      — no throw, no draw (the defensive null-check every one of the four
      layers carries today).
- [x] Test `createUpsampleLayer runs postBlit after the blit, into the same pass`
      — one shared order array; assert `['blit', 'postBlit']` and that both saw
      the same pass object.
- [x] Test `createUpsampleLayer still runs postBlit when the blit handle is null`
      — the load-bearing one (finding 7): it preserves
      `zoneOfAvoidanceUpsampleLayer.ts:30-38`'s independent guards. Getting this
      wrong silently drops the ZoA caption whenever its upsample handle is
      absent.
- [x] Implement. The module header carries the rationale now shared by all four
      rows (screen-space blit ignores the `SlabView`; producer and consumer must
      share one liveness gate); keep it inside the ≤10-line budget.
- [x] `npm run typecheck` + `npm test -- createUpsampleLayer`.
- [x] Commit.

### Task 8 — Migrate the four upsample layers onto the primitive

**Files:** `src/services/engine/frame/passes/volumeUpsampleLayer.ts`,
`starAggregateUpsampleLayer.ts`, `milkyWayUpsampleLayer.ts`,
`zoneOfAvoidanceUpsampleLayer.ts` (modify)

Each file keeps its name, its export, and its position in
`passes/index.ts` (`:263, :267, :290, :308` — do not reorder). Only the body
collapses to a `createUpsampleLayer({ ... })` call.

- [x] `volumeUpsampleLayer`: `name: 'volume-upsample'`, `slab: COSMO`,
      `sourceTargetId: 'volume'`, `handleOf: (state) => state.gpu.volumeUpsample`,
      `enabled` unchanged (`deriveVolumeLiveness(...) !== null`).
- [x] `starAggregateUpsampleLayer`: `'star-upsample'`, `NEAR0`,
      `'star-aggregates'`, `state.gpu.starAggregateUpsample`,
      `enabled: starCatalogVisible`.
- [x] `milkyWayUpsampleLayer`: `'milky-way-upsample'`, `NEAR0`,
      `'mw-aggregate'`, `state.gpu.milkyWayAggregateUpsample`, `enabled`
      unchanged (`deriveMilkyWayCloudAlpha(...) !== null`).
- [x] `zoneOfAvoidanceUpsampleLayer`: `'zone-of-avoidance-upsample'`, `COSMO`,
      `'zoa'`, `state.gpu.zoneOfAvoidanceUpsample`, `enabled` unchanged, plus
      `postBlit` carrying the existing caption draw verbatim
      (`zoneOfAvoidanceUpsampleLayer.ts:36-47`) — including its own null-check,
      its liveness re-derivation, and the module-local `LABEL_RADIUS_MPC`.
- [x] Trim each header to what is NOT now in the factory's header: the
      per-layer position rationale and the per-layer "why this handle / why not
      the other upsample" notes stay (`milkyWayUpsampleLayer.ts:23-35` is the
      clearest example); the four copies of "draw ignores the SlabView" and
      "defensive null-check, same pattern as…" go.
- [x] Existing `passes.test.ts` layer-name/uniqueness assertions and the four
      liveness test files must pass unmodified.
- [x] `npm run typecheck` + `npm test -- passes upsample zoneOfAvoidance volumeLiveness`.
- [x] Commit.

### Task 9 — Docblock sweep

**Files:** `src/@types/rendering/RenderTargets.d.ts`,
`src/@types/engine/handles/EngineGpuHandles.d.ts`,
`src/services/gpu/renderers/labels/occlusionDepthGroup.ts`,
`src/services/gpu/passes/additiveUpsample.ts`,
`src/services/gpu/passes/starAggregateUpsample.ts` (modify)

Runs LAST of the code tasks: it rewrites docblocks Tasks 2–4 shape.

- [x] `RenderTargets.d.ts`: the `viewOf`/`depthViewOf` docblocks say views are
      "Stable until the next `resize()`" (`:43,:50`) — now "until the next
      `reconcile()` that changes this row's size", which is a stronger and more
      useful guarantee (a reconcile that changes nothing keeps view identity).
- [x] Confirm `reconcile`'s own docblock (written in Task 4) carries the
      one-clause disambiguation from the contract above: `ReconcileEffects.ts`
      already owns "reconcile" for the store→engine callback surface, and a
      reader grepping the word now meets two unrelated concepts. Incumbent name
      kept (decision #6); the clause is what pays for it.
- [x] Grep for `renderTargets.resize` and update the three comment sites
      (finding 6) — none of them is wrong about the mechanism, only about the
      method name.
- [x] `EngineGpuHandles.d.ts` carries five more copies of the
      "(`'rgba16float'`, `'depth32float'`) matches the `foreground:0` row" prose
      (`:415`, `:431`, `:462`, `:470-471`, `:483`) — the invariant Task 6 made
      structural. Each shrinks to a pointer at `renderTargetFormats.ts`;
      resist restating the formats a third time.
- [x] `npm run typecheck` + `npm test` (docblock-only, but the gate is cheap).
- [x] Commit.

### Task 10 — Full-suite gate, decisions record, visual smoke, perf

- [x] `npm run typecheck` (both tsconfigs) + `npm test` — green, no skips added.
- [x] `docs/research/engine/decisions.md` carries the 4.5 ruling as **decision
      #12**, with #9's anti-drift sentence (`:83-85`) amended in place to point
      at it. Without this, rungs 3–7 are written against a north star this rung
      overturned, in a plan file `/feature-done` will have relocated. Verify it
      is in the PR diff (docs ship with the code that motivates them).
- [x] Dev-server visual smoke — ask the user to look; this task cannot
      self-certify pixels. Cover: the galaxy field + Milky Way disc render
      unchanged; scalar volumes, star aggregates, and the ZoA band all
      composite as before; **the ZoA curved lettering still draws and fades
      with its band** (the post-blit hook's only live consumer).
- [x] Drag the DebugPanel's Milky-Way `aggregateDivisor` slider across its
      range — the cloud must rescale smoothly with no black frame and no
      console error. This is the one dynamic-scale row and the path Task 4
      rewrote end to end.
- [x] Resize the window (including a slow drag) — every offscreen stays crisp
      and correctly aligned; no smearing or off-canvas content.
- [x] Toggle the HDR display mode — the swap row's format change still
      reconfigures the context and rebuilds the 8 swap renderers
      (Tasks 1 + 2 both touched that path).
- [x] With `?gpuTimings`, confirm the DebugPanel's timing rows and group titles
      are **identical** to `main`'s (parity gate 3) — same names, same order,
      same groups.
- [x] `npm run perf` before and after, from this worktree, passing
      `--url http://localhost:<port>` off THIS server's `Local:` line (per
      `.claude/skills/perf/SKILL.md` — omitting it silently measures another
      branch). The frame loop gained a per-frame `reconcile` over 12 rows;
      confirm no CPU-side regression beyond noise.
- [x] Commit (if any smoke-driven fixes were needed).

## Definition of Done

- [x] Deliverables exist: `RenderTargetSpec` carries `clearValue` and a
      `number | (state) => number` `scale`; `RenderTargets` exposes `specOf`,
      `sizeOf`, and `reconcile` and no longer exposes `resize`;
      `renderTargetRows` is exported; `src/data/renderTargetFormats.ts`,
      `src/@types/rendering/Upsample.d.ts`,
      `src/@types/engine/frame/UpsampleLayerRow.d.ts`, and
      `src/services/engine/frame/passes/createUpsampleLayer.ts` are new files.
- [x] `TARGET_CLEAR_VALUES` no longer exists anywhere, and all 12 of its entries
      landed on rows (7 named + 5 generated `bloomN`); `executeFrame` and
      `runBloom` each read their clear value from the target row through
      `specOf`. No `specs.find(...)` expression remains in `src/`: all **11**
      that exist today are accounted for — `applySwapFormat.ts:22`,
      `executeFrame.ts:134`, `executeFrame.ts:247`, `hdrActiveOf.ts:12`
      (Task 2); the four producer layers (Task 3); `runFrame.ts:233`,
      `runFrame.ts:236`, `bloomSrcTexelSize.ts:29` (Task 4).
- [x] `createRenderTargets` takes no `mwAggregateDivisor`; `runFrame` contains
      no `createRenderTargets` call, no `mw-aggregate` branch, and exactly one
      target-reconciliation statement. `state.gpu.renderTargets` is assigned in
      exactly one place repo-wide (its `GPU_HANDLE_ROWS` row).
- [x] The `Math.max(1, Math.floor(canvasSize / scale))` expression appears in
      exactly one place in `src/` — `src/utils/gpu/reducedTargetSize.ts:12-14`,
      which `renderTargets.ts`'s `allocate` now calls — down from **six** (the
      four producer layers, `allocate`'s own copy, and the helper itself, whose
      "must match `allocate`" docblock becomes true by construction). The
      helper keeps its `tools/galaxy-renderer` consumer.
- [x] The four upsample layer files each declare one `createUpsampleLayer({…})`
      call and no blit body of their own, at unchanged positions in
      `passes/index.ts`; ZoA's caption draw rides `postBlit`.
- [x] All three `GPU_HANDLE_ROWS` filters (`initGpu`, `wireInput`,
      `buildSwapRenderers`) test a field's VALUE; no `'<field>' in row` idiom
      remains in the phase files.
- [x] `docs/research/engine/decisions.md` ships in this PR carrying the 4.5
      ruling as decision #12, with #9's anti-drift sentence amended in place.
      Rungs 3–7 must be able to read the current north star from decisions.md
      alone, without this plan file.
- [x] Sizing note for the ladder, not a gate: decisions #9 expected rung 2 to be
      a "bounded change" (`decisions.md:95-96`, only rungs 1 and 3 getting
      mini-plans). It arrived as a 10-task plan. Every task traces to #9 or #11,
      so this is scope DISCOVERED, not scope crept — but rungs 4–7 should be
      sized against this precedent, not against #9's original estimate.
- [x] Named observable behaviours for the manual smoke pass: galaxy field +
      Milky Way disc unchanged; scalar volumes / star aggregates / ZoA band
      composite unchanged; ZoA curved lettering draws and fades with its band;
      the aggregate-divisor slider rescales the cloud live with no black frame;
      window resize keeps every offscreen crisp; the HDR toggle re-renders
      without a blank frame or console error; the `?gpuTimings` slot names and
      group titles are identical to `main`'s.
- [x] Deferral boundary — a reviewer should NOT expect to find, in this PR:
      blend-parity validation (blocked on renderers exposing their baked
      blend — a renderer-contract change, not a target-contribution one); the
      `foreground:0` step-level gate (behaviour-changing for
      `fieldStarSphereLayer`); the fullscreen-triangle / fade-scratch /
      grow-buffer / hypot hygiene basket (decisions #11: PR-anytime); the
      compositor's dead `swapFormat`/`hdrFormat` constructor arguments
      (backlog); the MW `starCount` staleness branch (`runFrame.ts:247-280` —
      rung 3); pick targets joining `RenderTargets`; any `SubsystemBundle`
      umbrella type (deferred by decision #9 until the rungs land).
