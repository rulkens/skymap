# Handle registry — rung 1 of the engine-composition ladder

**Status.** Plan. **Date.** 2026-08-17.
**Scope.** Rung 1 of the ladder in
[`docs/research/engine/decisions.md`](../../research/engine/decisions.md#L87)
(decision #9): replace the hand-maintained `state.gpu.*` construction +
teardown + swap-format-rebuild bookkeeping with one declarative row array,
walked by three small generic functions. Evidence for every claim below is
cited by `file:line`, verified against this checkout
(`worktree-land-milky-way-refactor`) on 2026-08-18.

**Ground preparation.** None needed — decision #9 states the ladder itself
_is_ the ground-prep program for the later rungs (target contributions,
staleness helper, volume-ingest consolidation, …). This rung does not touch
render targets, artifacts, fades, wake, or debug — those are rungs 2–7.

## What this rung does and does not touch

**In scope:** 44 `state.gpu.*` fields that follow the uniform lifecycle
documented in `EngineGpuHandles.d.ts:1-10` — null before bootstrap,
constructed exactly once (42 in `initGpu.ts`, 2 — `pickRenderer` /
`pickProgram` — in the later `wireInput.ts` phase), released + re-nulled by
`engine.ts`'s single `destroy()` — including the 8-renderer subset rebuilt
on a swap-chain format change (`buildSwapRenderers.ts`).

**Out of scope, with reasons (verify before assuming these are omissions):**

- `state.gpu.fadeBgl` / `sourceBgl` / `focusBgl` (`EngineGpuHandles.d.ts:82-102`)
  — bind-group-layout factories with no `.destroy()` method; confirmed by
  grep, neither factory module exports one, and `engine.ts`'s `destroy()`
  never touches these three fields (`engine.ts:240-366` seeds them null,
  `engine.ts:747-909` never re-nulls them). They are **prerequisites**
  threaded into every row's `construct` via the shared deps bag, not rows
  themselves.
- `state.gpu.fontAtlases` / `uiCtx` (`EngineGpuHandles.d.ts:154-174`) — cached
  data / context refs, not GPU resources; re-nulled at `engine.ts:823-824`
  "for lifecycle symmetry, not released" (no `.destroy()` call). Same
  treatment as the BGLs: prerequisites in the deps bag, hand-nulled in
  `destroy()` same as today.
- `state.gpu.timingService` (`EngineGpuHandles.d.ts:588-603`) — always
  non-null (a disabled stub pre-boot), and `destroy()` replaces it with a
  **fresh stub**, not `null` (`engine.ts:895-896`). This breaks the
  null-based `Disposable` contract every other field follows; stays
  hand-wired.
- `state.subsystems.*` (impostor chain, `engine.ts:774-792`) — a separate
  lifecycle family per decision #9's rung split; not `state.gpu`.
- `renderTargets`' `mwAggregateDivisor` construction parameter
  (`initGpu.ts:153-158`) — untouched. `renderTargets` and `compositor`
  **are** ordinary registry rows in this rung (they already follow the
  null → construct → destroy+null pattern); rung 2 changes what feeds their
  construction, not whether they're rows.

**`pickRenderer` / `pickProgram` are in scope, constructed in a later
phase.** Both need only `device` + `canvas` (already `GpuHandleConstructDeps`
fields), `state.gpu.focusUniform!.bindGroup` read off `state` at construct
time (the same cross-handle mechanism the registry already uses for
`starCatalogPickRenderer` ← `starCatalogRenderer`), and `CONTENT_LAYERS` (a
static module import, same treatment as `MILKY_WAY_TUNING_DEFAULTS`) —
verified against `createPickProgram` (`pickProgram.ts:92-98`). They are
ordinary `GPU_HANDLE_ROWS` rows, but their `construct` runs from
`wireInput.ts` (`wireInput.ts:86-111`) rather than `initGpu.ts`, because
`focusUniform` isn't built until `initGpu` completes; `bootstrap.ts`'s
phase split is organizational, not a data dependency this plan needs to
collapse. See Task 7.

This leaves **44 in-scope keys**: every `EngineGpuHandles` field (50 total)
except the 6 excluded above (`fadeBgl`, `sourceBgl`, `focusBgl`,
`fontAtlases`, `uiCtx`, `timingService`) — 42 constructed by `initGpu.ts`'s
walker call, 2 (`pickRenderer`, `pickProgram`) by `wireInput.ts`'s.

## Construction-order dependencies found in `initGpu.ts` (risk register)

Read `initGpu.ts` top to bottom before writing `GPU_HANDLE_ROWS` — these are
the dependencies a row-order choice must respect:

1. **Real cross-handle dependency:** `starCatalogPickRenderer`
   (`initGpu.ts:509-513`) is constructed from
   `state.gpu.starCatalogRenderer.pickResources()` — it reads an
   already-assigned sibling field. `starCatalogRenderer` must be an earlier
   row. This is the only handle-reads-another-handle dependency in the
   whole phase (grep confirmed: no other `createX(...)` call in
   `initGpu.ts` references `state.gpu.<otherHandle>` as an argument, only
   the 3 excluded BGLs / `focusUniform`, which are deps-bag prerequisites).
2. **BGL + `focusUniform` prerequisites:** most constructors take `fadeBgl`
   / `sourceBgl` / `focusBgl` / `focusUniform.bindGroup` as arguments
   (`initGpu.ts:167-169, 210, 219, 258, 272-273, 299, 313, 372` etc.). These
   come from the deps bag (BGLs) or from a row that must be declared first
   (`focusUniform`) — see the deps-bag design below.
3. **`uiCtx` + `fontAtlases` prerequisites:** the 8 swap-format-dependent
   renderers (`buildSwapRenderers.ts:31-74`) and `structureMarkerRenderer` /
   `milkyWayPickRenderer` (`initGpu.ts:207-221`) all read `state.gpu.uiCtx`;
   the label renderers (inside `buildSwapRenderers`) and
   `zoneOfAvoidanceRenderer` (`initGpu.ts:289`, reusing the already-loaded
   atlas for its curved-lettering pipeline rather than a second fetch) read
   `state.gpu.fontAtlases` directly — all deps-bag prerequisites, not rows.
4. **No other renderer reads another renderer's handle at construction.**
   Every other `createX(device, format, ...)` call takes only `device` /
   `format` / `depth` / `SLAB_REVERSED_Z[...]` / module-level constants
   (`MILKY_WAY_TUNING_DEFAULTS`, `ATMOSPHERE_PARAMS`) — no other ordering
   constraint exists. **Declaration order = construction order** is
   therefore sufficient (no toposort needed) — document this rather than
   engineer for a general case with one instance.
5. **`starPointRenderer` needs a post-construction seed call**
   (`initGpu.ts:476-483`, `setStars(...)` fed from `deriveBodyStates` +
   `state.data.bodies.stars`). Fold the seed call into that row's
   `construct` closure — it's a one-time boot seed with no other handle
   reading it in between, so folding it in changes nothing observable and
   avoids inventing a second "post-construct hook" mechanism for one row.

## Teardown-order finding (read before writing `destroyGpuHandles`)

**Today's hand-written `engine.ts:807-902` teardown order is _not_ a
reverse (or forward) traversal of `initGpu.ts`'s construction order** — it's
hand-grouped by renderer _kind_ (pick providers, then targets/compositor,
then overlays, then disks, then MW, then volume/flow, then post-process
debug overlays, then bodies, then stars/catalog/pick, then
timing/renderer/focus last). Grepped `engine.ts` and
`EngineGpuHandles.d.ts` for ordering language
(`order matters|destroyed before|destroyed after|released after|must be
destroyed`): the **only** hit for a `state.gpu.*` field is
`engine.ts:899-900` —

> "Shared cluster-focus uniform — released after the renderers that bind
> its group (points/disks/pick already destroyed above)."

The docblock's own words claim a broad 3-group constraint (points, disks,
and every pick provider before focus). Verified narrower: only
`pickRenderer` actually captures `state.gpu.focusUniform!.bindGroup` at
construction (`wireInput.ts:86-96`). `pickProgram`, `milkyWayPickRenderer`,
`starCatalogPickRenderer`, and `bodyPickRenderer` have zero `focus*`
references in their sources. `renderer` / `texturedDiskRenderer` /
`proceduralDiskRenderer` read the focus bind group live, per frame, off
`layers` — not captured at construction — and `destroy()` stops the
scheduler before any renderer is torn down, so that coupling is moot at
teardown regardless of order. The one proven constraint is **`pickRenderer`
before `focusUniform`**; the docblock's broader claim is a conservative
superset, not a second requirement this plan needs to satisfy
independently. (The other ordering-language hit, `engine.ts:774-777`, is
the impostor-chain `state.subsystems.*` constraint — out of scope per the
section above.)

No `EngineGpuHandles` field's docblock documents any _other_ destroy-order
requirement, and no renderer's `.destroy()` implementation reads another
renderer's buffers (each releases only its own `GPUBuffer`/`GPUTexture`
handles — confirmed for the one pair with a _construction_-time coupling,
`starCatalogRenderer`/`starCatalogPickRenderer`: the pick renderer's own
docblock states "the shared records buffers belong to the visual renderer"
— its `destroy()` frees only its own uniform + per-source pick buffers).

**Design choice this plan makes:** one array, one declared order, used
forwards for construction and in reverse for teardown. Declare
`focusUniform` as the **first** row (true to its real early construction
position — `initGpu.ts:116`, right after the 3 excluded BGLs) so reversing
the array automatically destroys it **last**. `pickRenderer` and
`pickProgram` are declared **last** in the array (they construct in the
later `wireInput.ts` phase — see the in-scope note above and Task 7), so
reverse-order teardown destroys them **first** — before `focusUniform` and
before every other row — satisfying the one proven constraint
(`pickRenderer` before `focusUniform`) with no special-casing, and
incidentally reproducing today's actual teardown order for the pick
providers (`engine.ts:807-810` destroys them first, by hand, today). The
resulting teardown call _sequence_ will differ from today's hand-grouped
list for the other 41 rows (44 total, minus `focusUniform`, minus the 2
pick rows) — this is accepted as behaviourally inert (no other ordering
constraint exists, per the narrowed finding above), but is a real, visible
diff; the executor's first task must independently re-verify by grepping
fresh at execution time in case a hand-edit landed on `main` since this
plan was written.

## The contract

Contract types only — one `type` per file, `type` never `interface`, under
`src/@types/engine/handles/` (alongside `EngineGpuHandles.d.ts`).

```ts
// src/@types/engine/handles/Disposable.d.ts
export type Disposable = { destroy(): void };
```

```ts
// src/@types/engine/handles/GpuHandleKey.d.ts
import type { EngineGpuHandles } from './EngineGpuHandles';

// The 6 excluded fields are NOT Disposable / not GPU_HANDLE_ROWS rows — see
// the plan's "out of scope" section for why each is excluded. pickRenderer
// / pickProgram ARE covered (rows constructed from wireInput.ts, not
// initGpu.ts — see the "in scope, later phase" note).
export type GpuHandleKey = Exclude<
  keyof EngineGpuHandles,
  'fadeBgl' | 'sourceBgl' | 'focusBgl' | 'fontAtlases' | 'uiCtx' | 'timingService'
>;
```

```ts
// src/@types/engine/handles/GpuHandleConstructDeps.d.ts
// Shared prerequisites every row's `construct` may read. Cross-handle
// dependencies (the one real case: starCatalogPickRenderer reading
// starCatalogRenderer) are NOT threaded through this bag — `construct`
// takes `state` directly and reads `state.gpu.<earlierKey>`, exactly like
// today's initGpu.ts body, so an earlier row's result is visible to a
// later row's construct without a second mechanism.
export type GpuHandleConstructDeps = {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly canvas: HTMLCanvasElement;
  readonly format: GPUTextureFormat;
  readonly hdrCapable: boolean;
  readonly fadeBgl: FadeUniformsBgl;
  readonly sourceBgl: SourceUniformsBgl;
  readonly focusBgl: FocusUniformsBgl;
  readonly uiCtx: Omit<GpuContext, 'format'>;
  readonly fontAtlases: LoadedFontAtlases;
};
```

```ts
// src/@types/engine/handles/GpuHandleRow.d.ts
// Distributive over GpuHandleKey so `construct`'s return type is pinned to
// the EXACT field type for that key (not a union of all 44) — a row for
// 'milkyWayCloud' must return MilkyWayCloud, not MilkyWayCloud | RenderTargets | ...
export type GpuHandleRow = {
  [K in GpuHandleKey]: {
    readonly key: K;
    readonly construct: (
      state: EngineState,
      deps: GpuHandleConstructDeps,
    ) => NonNullable<EngineGpuHandles[K]>;
    readonly rebuildOnSwapFormat?: true;
  };
}[GpuHandleKey];
```

Compile-time totality (not a runtime test — a `tsc`-enforced fact, per
`testing.md`'s "no runtime tests of type declarations"): add one assertion
line beside `GPU_HANDLE_ROWS` —

```ts
// src/services/engine/gpuHandles/gpuHandleRegistry.ts, after the array literal
type _AssertEveryKeyCovered = GpuHandleKey extends (typeof GPU_HANDLE_ROWS)[number]['key']
  ? true
  : [
      'missing a GPU_HANDLE_ROWS row for',
      Exclude<GpuHandleKey, (typeof GPU_HANDLE_ROWS)[number]['key']>,
    ];
const _totalityCheck: true = true as _AssertEveryKeyCovered extends true ? true : never;
```

This is the mechanism that turns Task 11's "add a row when you add a
field" pointer — currently enforced by nobody — into a `typecheck` failure
if a field is added to `EngineGpuHandles` and forgotten in the registry. Verify the exact expression compiles as intended during
Task 5 (which adds it) — distributive conditional totality checks are fiddly; a simpler
`type _AssertEveryKeyCovered = Exclude<GpuHandleKey, RowKeys> extends never ? true : RowKeys` shape is an acceptable substitute if the above doesn't typecheck cleanly.

New folder `src/services/engine/gpuHandles/` (NOT the existing
`src/services/engine/handles/`, which holds the public `EngineHandle.volumes.*`
API — a different "handles" meaning; reusing that folder would collide two
unrelated concepts under one name).

## Tasks

### Task 1 — `Disposable` type

**Files:** `src/@types/engine/handles/Disposable.d.ts` (new)

- [ ] Add the type shown above.
- [ ] `npm run typecheck` — no consumers yet, just confirms the file compiles standalone.
- [ ] Commit.

### Task 2 — `GpuHandleKey`, `GpuHandleConstructDeps`, `GpuHandleRow` types

**Files:** `src/@types/engine/handles/GpuHandleKey.d.ts`,
`GpuHandleConstructDeps.d.ts`, `GpuHandleRow.d.ts` (new)

- [ ] Add the three types shown above. Import `FadeUniformsBgl` /
      `SourceUniformsBgl` / `FocusUniformsBgl` / `GpuContext` /
      `LoadedFontAtlases` / `EngineState` from their existing locations
      (see `EngineGpuHandles.d.ts:51-57` for the import paths this file
      already uses for the same types).
- [ ] `npm run typecheck`.
- [ ] Commit.

### Task 3 — `constructGpuHandles` walker (TDD)

**Files:** `src/services/engine/gpuHandles/constructGpuHandles.ts` (new),
`tests/services/engine/gpuHandles/constructGpuHandles.test.ts` (new)

**Signature:** `constructGpuHandles(rows: readonly GpuHandleRow[], state: EngineState, deps: GpuHandleConstructDeps): void` —
walks `rows` in array order, calling `state.gpu[row.key] = row.construct(state, deps)` for each.

- [ ] Test `constructGpuHandles calls each row's construct in declared order`
      — a fake 3-row array with a shared `order: string[]` each construct
      pushes its key into; assert `order` equals the declared key order.
- [ ] Test `constructGpuHandles lets a later row read an earlier row's constructed value off state.gpu`
      — row 2's `construct` reads `state.gpu.<row1Key>` and asserts it is
      already the row-1 stub (not null/undefined) — the load-bearing proof
      of the `starCatalogRenderer` → `starCatalogPickRenderer` dependency
      pattern this walker must support.
- [ ] Implement.
- [ ] `npm test -- constructGpuHandles`.
- [ ] Commit.

### Task 4 — `destroyGpuHandles` walker (TDD)

**Files:** `src/services/engine/gpuHandles/destroyGpuHandles.ts` (new),
`tests/services/engine/gpuHandles/destroyGpuHandles.test.ts` (new)

**Signature:** `destroyGpuHandles(rows: readonly GpuHandleRow[], state: EngineState): void` —
walks `rows` in **reverse** array order; for each row whose
`state.gpu[row.key]` is non-null, calls `.destroy()` then sets it to `null`.

- [ ] Test `destroyGpuHandles destroys handles in reverse declared order`
      — 3 fake rows, each stub's `destroy` pushes its key into a shared
      array; assert the array is the REVERSE of declaration order.
- [ ] Test `destroyGpuHandles nulls every destroyed field` — assert
      `state.gpu[key] === null` after, for all 3 rows.
- [ ] Test `destroyGpuHandles skips an already-null handle without throwing`
      — one row's field starts `null`; assert no `.destroy` call is
      attempted on it and the walker completes.
- [ ] Implement.
- [ ] `npm test -- destroyGpuHandles`.
- [ ] Commit.

### Task 5 — Author `GPU_HANDLE_ROWS`

**Files:** `src/services/engine/gpuHandles/gpuHandleRegistry.ts` (new)

Migrate every in-scope `state.gpu.X = createX(...)` assignment from
`initGpu.ts`, `buildSwapRenderers.ts`, and `wireInput.ts` into one row each.
Cite, don't paste (plan-style.md) — the executor reads the current
construction call at its cited line and moves it into
`construct: (state, deps) => { ... }` unchanged.

- [ ] Row order: `focusUniform` FIRST (see teardown-order finding above),
      then `compositor`, `renderTargets`, `renderer` (`initGpu.ts:116,144-145,153-158,164-171`),
      then the 8 swap-format rows in `buildSwapRenderers.ts:31-74`'s order,
      each with `rebuildOnSwapFormat: true`, then the remaining rows in
      `initGpu.ts`'s existing top-to-bottom order (`structureMarkerRenderer`
      through `atmosphereShellRenderer`, `initGpu.ts:207-605`), with
      `starCatalogRenderer` (`:500`) declared strictly before
      `starCatalogPickRenderer` (`:509`), then `pickRenderer` and
      `pickProgram` LAST (mirrors `wireInput.ts:86-111`'s order) — declaring
      them last is load-bearing, not incidental: it's what makes
      reverse-order teardown destroy them first (see the teardown-order
      finding's design-choice paragraph).
- [ ] `starCatalogPickRenderer`'s `construct` reads
      `state.gpu.starCatalogRenderer!.pickResources()` (mirrors
      `initGpu.ts:511`).
- [ ] `starPointRenderer`'s `construct` performs the construction AND the
      `setStars(...)` seed call in one closure (mirrors `initGpu.ts:476-483`,
      folding in the `deriveBodyStates(CONST_J2000)` + `state.data.bodies.stars`
      read per the risk-register note above).
- [ ] `pickRenderer`'s `construct` reads `state.gpu.focusUniform!.bindGroup`
      off `state` (same cross-handle mechanism as `starCatalogPickRenderer`)
      and imports `CONTENT_LAYERS` as a static module value (mirrors
      `wireInput.ts:86-96`).
- [ ] `pickProgram`'s `construct` takes only `device`, `canvas`, `state`,
      and `CONTENT_LAYERS` (mirrors `createPickProgram`, `pickProgram.ts:92-98`).
- [ ] Add the `_totalityCheck` compile-time assertion from the contract
      section, tuned until it actually compiles and actually fails when a
      row is temporarily commented out (verify this manually once, then
      restore).
- [ ] `npm run typecheck`.
- [ ] Commit.

### Task 6 — Wire `initGpu.ts` to the construction walker

**Files:** `src/services/engine/phases/initGpu.ts` (modify)

- [ ] Build the BGL/`uiCtx`/`fontAtlases` prerequisites exactly as today
      (`initGpu.ts:110-116, 198-200`) — these stay hand-written (excluded
      fields).
- [ ] Replace the 42 initGpu-phase `state.gpu.X = createX(...)` assignments
      (everything the registry owns at this phase — all of `GPU_HANDLE_ROWS`
      except `pickRenderer`/`pickProgram`) with one
      `constructGpuHandles(GPU_HANDLE_ROWS.filter(r => r.key !== 'pickRenderer' && r.key !== 'pickProgram'), state, deps)`
      call, positioned where `focusUniform`'s construction used to be (since
      it's now row 0) through where `atmosphereShellRenderer`'s used to be
      (now the last non-swap, non-pick row). The swap-format 8 are now also
      covered by this single call — the separate
      `buildSwapRenderers(state, format)` call at `initGpu.ts:201` is
      replaced by this walker call happening in the right position (before
      `structureMarkerRenderer`/`milkyWayPickRenderer`, after
      `uiCtx`/`fontAtlases` are set — matching today's sequencing).
- [ ] Keep every POST-construction wiring step unchanged, now reading the
      walker's output off `state.gpu.*`: `biasCorrection.attachRenderer(state.gpu.renderer!)`
      (`initGpu.ts:181`), the `GALAXY_CATALOG_SOURCE_REGISTRY` loop
      (`:246-248`), `state.subsystems.labelDirector.attachRenderers(...)`
      (currently inside `buildSwapRenderers.ts:78-81` — see Task 8), and
      `wireBodyTextureSlots(state)` (`:613`).
- [ ] `npm run typecheck` + `npm test -- initGpu`.
- [ ] Commit.

### Task 7 — Wire `wireInput.ts` to the construction walker

**Files:** `src/services/engine/phases/wireInput.ts` (modify)

Behaviour-neutral: `pickRenderer`/`pickProgram` still construct at the same
bootstrap point they do today, just via the shared walker instead of two
hand-written `createX(...)` calls.

- [ ] Replace the two hand-written assignments (`wireInput.ts:86-111`) with
      `constructGpuHandles(GPU_HANDLE_ROWS.filter(r => r.key === 'pickRenderer' || r.key === 'pickProgram'), state, deps)`,
      built from the same `device`/`canvas` already available at this call
      site.
- [ ] `npm run typecheck` + `npm test -- wireInput`.
- [ ] Commit.

### Task 8 — Swap-format rebuild via the registry

**Files:** `src/services/engine/phases/buildSwapRenderers.ts` (modify),
`tests/services/engine/phases/buildSwapRenderers.test.ts` (modify)

- [ ] Replace the 8 hand-written `state.gpu.X?.destroy(); state.gpu.X = createX(...)`
      pairs (`buildSwapRenderers.ts:31-74`) with a filtered walk:
      `GPU_HANDLE_ROWS.filter(r => r.rebuildOnSwapFormat)`, destroy-then-construct
      **per row** (not a destroy-all-then-construct-all pass — matches
      today's per-renderer sequencing, and avoids relying on an unverified
      assumption that batching is safe). This keeps `buildSwapRenderers` a
      second, inline teardown site alongside `destroyGpuHandles` — by
      design, not an oversight; the drift risk is mitigated by both sites
      deriving their destroy calls from the same `GPU_HANDLE_ROWS`
      declaration rather than duplicating a renderer list.
- [ ] Keep the `state.subsystems.labelDirector.attachRenderers(...)` call
      (`:78-81`) exactly as today, reading the post-rebuild
      `state.gpu.labelRenderer` / `markerLineRenderer` — this stays a named
      follow-up step, not folded into any row's `construct` (per the
      contract's "no unified presentation-producer registry" boundary from
      decisions.md #6, which this rung must not quietly cross).
- [ ] Existing test `destroys the previous renderers before replacing them`
      must keep passing unmodified (behaviour-neutrality gate).
- [ ] Add test `a non-swap-format row's handle identity is unchanged across a rebuild`
      — pick one row NOT flagged `rebuildOnSwapFormat` (e.g. `filamentRenderer`,
      present in the same `state.gpu` bag), call the (now walker-backed)
      `buildSwapRenderers` twice, and assert the field's reference is
      untouched — the load-bearing proof the `rebuildOnSwapFormat` filter
      rebuilds exactly the intended subset, not more.
- [ ] `npm test -- buildSwapRenderers`.
- [ ] Commit.

### Task 9 — Wire `engine.ts`'s `destroy()` to the teardown walker

**Files:** `src/services/engine/engine.ts` (modify)

- [ ] Replace all 44 in-scope hand-written destroy+null pairs
      (`engine.ts:807-902`, everything except the `fontAtlases`/`uiCtx`
      re-null lines and the `timingService.destroy()` + stub-replace lines)
      — including the `pickRenderer`/`pickProgram` pair currently
      hand-written first at `engine.ts:807-810` — with one
      `destroyGpuHandles(GPU_HANDLE_ROWS, state)` call. Passing the full,
      unfiltered array is correct here, unlike Tasks 6/7's construction
      calls: teardown is a single reverse walk over everything the registry
      owns, and `pickRenderer`/`pickProgram` being declared last in the
      array means reverse order destroys them first, automatically — see
      the teardown-order finding.
- [ ] Keep `state.gpu.fontAtlases = null` / `state.gpu.uiCtx = null`
      (`:823-824`) and the `timingService` destroy+stub-replace
      (`:895-896`) as explicit hand-written lines, positioned anywhere
      relative to the walker call (they touch different fields, no
      ordering interaction).
- [ ] `npm run typecheck` + `npm test -- engine`.
- [ ] Commit.

### Task 10 — Integration regression test + retire the stale reachability test

**Files:** `tests/services/engine/gpuHandles/gpuHandleRegistry.test.ts` (new),
`tests/services/engine/phases/initGpu.destroyReachability.test.ts` (delete
or fold in — see below)

- [ ] Test `every GPU_HANDLE_ROWS handle is destroyed exactly once by a construct-then-destroy round-trip`
      — build a minimal stub `EngineState` + `GpuHandleConstructDeps` where
      every row's `construct` returns a fresh `{ destroy: vi.fn() }`,
      run `constructGpuHandles` then `destroyGpuHandles` against the REAL
      `GPU_HANDLE_ROWS` array, and assert every stub's `destroy` was called
      exactly once. This is the genuine replacement for
      `initGpu.destroyReachability.test.ts`'s per-renderer reachability
      assertions — it covers all 44 keys structurally instead of by name,
      so it does not need updating every time a new renderer is added
      (avoids the "registry restatement" anti-pattern from `testing.md`).
- [ ] Test `focusUniform is destroyed last across the real GPU_HANDLE_ROWS teardown`
      — same round-trip, assert `focusUniform`'s stub `destroy` fired
      strictly after every other stub's, including `pickRenderer`'s — the
      regression test for the one proven ordering constraint found in the
      risk register above (`pickRenderer` before `focusUniform`).
- [ ] Decide + do ONE of: (a) delete
      `initGpu.destroyReachability.test.ts` now that the round-trip test
      covers reachability structurally and `initGpu`'s own existing
      behavioural tests (`initGpu.test.ts` if present, or the assertions
      already inside `destroyReachability.test.ts` that check `state.gpu.X`
      equals the mocked stub) still prove _construction_ lands the right
      values — re-verify those construction-side assertions survive Task 6
      unchanged before deleting; (b) keep the file but strip it to only the
      HDR-capability-dispatch describe block (`initGpu.destroyReachability.test.ts:571-617`),
      which is unrelated to this rung and must keep passing regardless.
      Rename the file if (b) is chosen, since "destroyReachability" would
      no longer describe its contents.
- [ ] `npm test -- gpuHandles initGpu`.
- [ ] Commit.

### Task 11 — Update `EngineGpuHandles.d.ts`'s docblock

**Files:** `src/@types/engine/handles/EngineGpuHandles.d.ts` (modify)

- [ ] Add a terse "add a row when you add a field" pointer to the module
      header (`EngineGpuHandles.d.ts:1-10`). The header is already AT the
      file's ≤10-line comment budget, with no spare line — trim existing
      prose to make room rather than appending. Say: add a field here (the
      type still enumerates every handle, for the ~hundreds of typed
      `state.gpu.X` read sites) **and** add a row to `GPU_HANDLE_ROWS`
      (`src/services/engine/gpuHandles/gpuHandleRegistry.ts`) — the
      compile-time totality check fails until both are done. Name the 6
      excluded fields and point at this plan (or its eventual
      `docs/superpowers/plans/completed/` home) for the reasoning, and note
      that `pickRenderer`/`pickProgram` ARE rows, just constructed from
      `wireInput.ts` (Task 7) instead of `initGpu.ts` — rather than
      re-deriving any of this inline.
- [ ] Commit.

### Task 12 — Full-suite gate + visual smoke

- [ ] `npm run typecheck` (both `src` and `tools` tsconfigs) — green.
- [ ] `npm test` — green, no new failures, no skipped/xfail additions.
- [ ] Dev-server visual smoke (per `feedback_verify_rendering_visually_before_measuring`):
      boot the app, confirm the scene renders identically (galaxy points,
      Milky Way disk, labels, pick/hover, HDR toggle if easy to trigger) —
      ask the user to look; this task cannot self-certify pixels.
- [ ] Toggle the HDR display mode (or otherwise trigger `applySwapFormat`)
      once during the smoke pass — the swap-rebuild path is the one most
      likely to silently regress (Task 8) and has no automated visual
      assertion.
- [ ] While the swap format is toggled, specifically inspect the
      compositor's output for staleness (wrong `dstFormat`/blend state
      after the toggle) — `compositor` is deliberately NOT a
      `rebuildOnSwapFormat` row (behaviour-preserving per this plan), and
      decisions.md #11 flags it as a bug suspect today. This is
      verification of EXISTING behaviour, not a change: record the verdict
      either way. If staleness is confirmed, the fix (setting
      `rebuildOnSwapFormat` on the compositor row) is a follow-up in a
      separate commit/PR, not part of this task.
- [ ] Commit (if any smoke-driven fixes were needed).

## Definition of Done

- [ ] Deliverables exist: `Disposable.d.ts`, `GpuHandleKey.d.ts`,
      `GpuHandleConstructDeps.d.ts`, `GpuHandleRow.d.ts` (types);
      `gpuHandleRegistry.ts`, `constructGpuHandles.ts`, `destroyGpuHandles.ts`
      (implementation) — all under the paths named in the tasks above.
- [ ] `initGpu.ts` no longer contains per-handle `state.gpu.X = createX(...)`
      assignments for any of the 42 initGpu-phase in-scope keys — only the
      6 excluded prerequisites (BGLs, `uiCtx`, `fontAtlases`) plus the
      single filtered `constructGpuHandles(...)` call and the unchanged
      post-construction wiring steps. `wireInput.ts` no longer contains
      hand-written `state.gpu.pickRenderer = ...` / `pickProgram = ...`
      assignments — only its own filtered `constructGpuHandles(...)` call.
- [ ] `buildSwapRenderers.ts` derives its 8-renderer rebuild subset from
      `GPU_HANDLE_ROWS`'s `rebuildOnSwapFormat` flag — no hand-written list
      of 8 renderer names remains anywhere in the phase files.
- [ ] `engine.ts`'s `destroy()` contains exactly 3 hand-written GPU-lifecycle
      lines for the excluded fields (`fontAtlases`, `uiCtx`, `timingService`
      — 2 re-nulls, 1 destroy+stub-replace) plus one
      `destroyGpuHandles(GPU_HANDLE_ROWS, state)` call covering all 44 rows,
      `pickRenderer`/`pickProgram` included; no other
      `state.gpu.X?.destroy(); state.gpu.X = null;` pair remains
      hand-written.
- [ ] Named observable behaviours for the manual smoke pass: galaxy points
      render, Milky Way disk + labels render, hover/click picking works,
      an HDR display-mode toggle re-renders without a blank frame or
      console error (the swap-rebuild path), and the compositor's output
      is confirmed non-stale (or a follow-up is filed) after the same
      toggle.
- [ ] Deferral boundary: rungs 2–7 (target contributions, staleness helper,
      volume-ingest consolidation, wake-vote fold, debug derivation,
      fade-manifest derivation) are NOT touched by this plan — a reviewer
      should not expect `mwAggregateDivisor`, `runFrame.ts`'s staleness
      branches, or `FADE_ROW`/`VISIBILITY_ACTION_ROW` to have moved.
      `state.subsystems.*` teardown (the impostor chain) is untouched.
      `pickRenderer`/`pickProgram` are registry rows constructed from
      `wireInput.ts` (Task 7), not `initGpu.ts` — a rung-1 phase split, not
      a follow-up TODO.
