# wireSlots Refactor — Implementation Plan (Part 2: Asset-wiring registry & demand evaluator)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the declarative `ASSET_WIRING` registry keyed by `AssetKey`, the `reevaluateDemand(state)` evaluator that replaces the ~5 scattered load triggers, and convert the seven slot factories to construction purity (return, never install / never self-`load()`).
**Architecture:** Each fetchable asset becomes one `AssetWiringRow` carrying a pure `factory`, a `req(tier)` request builder, and a `demand(ctx)` predicate. `reevaluateDemand` walks the registry once and calls the idempotent `slot.load(req)` for every currently-required row, guarded so one bad predicate can't stall the loop. The demand table folds today's scattered policies — including the two over-eager boot loads (filaments + clusterCatalog) that this part fixes — into predicates. Operates against the CURRENT `state.sources.*` / `state.assetSlots.*` shape.
**Spec:** docs/superpowers/specs/2026-06-01-wireslots-refactor-design.md
**ADR:** docs/adrs/0005-engine-data-layer-and-asset-loading.md
**Index:** docs/superpowers/plans/2026-06-01-wireslots-refactor-INDEX.md

> **STATUS: ✅ COMPLETE** (Tasks 6–14, incl. the combined 12+15 boundary). The
> `ASSET_WIRING` registry + `reevaluateDemand` + construction purity + single
> install all landed; `wireSlots` is now the thin demand-driven orchestrator
> (326 → 120 lines). Two bug fixes confirmed (filaments + clusterCatalog
> load-when-disabled). Boot parity verified by tests AND a live dev-server boot.
> 2064 tests green. **Carried into Part 3:** `AssetSlot.load()` is non-idempotent,
> so `reevaluateDemand` needs an `idle`-guard in `evaluateRows` BEFORE the toggle
> setters (Tasks 16–18) wire repeated re-evaluation — else a single toggle
> re-fetches every loaded asset. That guard is Part 3's first task.

---

## Conventions (see INDEX — do not re-summarise)

Whole-file comment-cleanup pass per file-touching task (`feedback_comment_style`:
timeless + terse, keep didactic *why*-comments, don't strip module headers).
TDD. Contract code only — cite line ranges. Commits use the user's identity with
the Co-Authored-By trailer; stage specific paths.

**Dependency:** Part 1 must be merged. Part 2's registry rows reference the
factories Part 1 left in place; the construction-purity edits (Task 12) assume
the factories still exist at their current paths.

---

## Task 6: Define `AssetKey`

**Files:**
- Create: `src/@types/loading/AssetKey.d.ts`
- Create: `tests/@types/loading/AssetKey.types.test.ts`

`AssetKey` is the registry key: every fetchable `Source` plus the three
auxiliary assets (ADR 0005 §2; grill "Source ≠ Asset").

**Type (reproduce exactly from spec §"The asset-wiring registry"):**
```ts
type AssetKey = SourceType | 'clusterCatalog' | 'famousMeta' | 'pgcAlias';
```

`SourceType` is the existing numeric union (`src/@types/data/SourceType.d.ts`).
Note the asymmetry the type encodes (grill decision): some `Source`s are not
fetched (`Cluster`/`Supercluster`/`Void` come from the cluster `.ccat` seed,
not a per-source fetch) and the three string keys are not `Source`s. Document
this in the module header.

- [ ] Add a compile-only test (`expectTypeOf` or `satisfies`) asserting a
  literal of each variant (`Source.SDSS`, `'clusterCatalog'`, `'famousMeta'`,
  `'pgcAlias'`) is assignable to `AssetKey`.
- [ ] Write the type + didactic header.
- [ ] `npm run typecheck` → clean.
- [ ] **Whole-file comment pass.**
- [ ] Commit.

---

## Task 7: Define `RequestKey` and `DemandCtx`

**Files:**
- Create: `src/@types/loading/RequestKey.d.ts`
- Create: `src/@types/loading/DemandCtx.d.ts`
- Create: `tests/@types/loading/DemandCtx.types.test.ts`

`RequestKey` is the one-shot request-flag union; today the only member is the
palette trigger (grill "Palette aliases"):
```ts
type RequestKey = 'paletteOpened';
```

`DemandCtx` is the four read-surfaces a predicate may consult (spec
§"Demand model"; ADR 0005 §3 "four read surfaces"):
```ts
type DemandCtx = {
  settings: EngineSettingsView;          // enable flags
  isVisible: (s: SourceType) => boolean; // drawMask
  request: (k: RequestKey) => boolean;   // one-shot flags
  slotState: (k: AssetKey) => LoadStateKind; // for fallback + joins
};
```

`EngineSettingsView` should be a `Readonly` view of the settings subtree the
predicates need (`filaments.enabled`, `volumes.fields.<id>.enabled`,
`structures.enabled`, `milkyWay.enabled`, `volumes.masterEnabled`). If a
matching readonly type already exists on `EngineState`, alias it rather than
inventing a new shape — read `src/@types/engine/state/EngineState.d.ts` and the
settings types first; only create `EngineSettingsView.d.ts` if none fits.
`LoadStateKind` is the existing slot-state discriminator (`'idle' | 'loading' |
'ready' | 'error'` — confirm against `AssetSlot.d.ts` / `LoadState.d.ts`).

- [ ] Add a compile-only test asserting a literal `DemandCtx` with all four
  fields satisfies the type, and that `request('paletteOpened')` typechecks.
- [ ] Write both types + headers (the `DemandCtx` header explains *why* a
  predicate reads slot state — companions + fallback are predicates over
  siblings, per ADR 0005 §3).
- [ ] `npm run typecheck` → clean.
- [ ] **Whole-file comment pass** on both new files.
- [ ] Commit.

---

## Task 8: Define `AssetWiringRow`

**Files:**
- Create: `src/@types/loading/AssetWiringRow.d.ts`
- Create: `tests/@types/loading/AssetWiringRow.types.test.ts`

**Type (reproduce exactly from spec §"The asset-wiring registry"):**
```ts
type AssetWiringRow<T = unknown, R = unknown> = {
  key: AssetKey;
  // Pure constructor: builds + subscribes + RETURNS the slot. Does NOT
  // write state.assetSlots and does NOT call slot.load().
  factory: (deps: SlotDeps) => AssetSlot<T, R>;
  // Build the request from the current tier (void/empty for tier-agnostic).
  req: (tier: Tier) => R;
  demand: (ctx: DemandCtx) => boolean;
};
```

`SlotDeps` is the existing `(state, cb)`-style carrier — the project rejected
per-field DI for uniformity (SlotFactory docstring at
`src/@types/loading/SlotFactory.d.ts:21-29`). Decide between two encodings and
document the choice in the header:
- reuse `SlotFactory<T,R>`'s `(state, cb)` parameter pair directly (factories
  already match this), passing them as `SlotDeps = { state; cb }`; OR
- keep `factory: (state, cb) => AssetSlot` matching today's factories verbatim.
The second avoids touching factory signatures in Task 12 (they already take
`(state, cb)`), so prefer it unless the spec sketch's single-`deps` form buys
something. **The spec sketch shows `factory: (deps: SlotDeps)`** — match the
spec; introduce `SlotDeps` as `{ state: EngineState; cb: EngineCallbacks }` and
have Task 12's factories accept that. Flag if this conflicts with a factory that
needs extra params (e.g. the impostor deps) — those are NOT registry assets, so
it should not.

- [ ] Add a compile-only test: a literal row for one survey (`key: Source.SDSS`,
  a `factory`, `req: (tier) => ({ source: Source.SDSS, tier })`, `demand: (ctx)
  => ctx.isVisible(Source.SDSS)`) satisfies `AssetWiringRow<GalaxyCatalog,
  GalaxyCatalogReq>`.
- [ ] Write the type + header.
- [ ] `npm run typecheck` → clean.
- [ ] **Whole-file comment pass.**
- [ ] Commit.

---

## Task 9: `reevaluateDemand` evaluator (guarded loop)

**Files:**
- Create: `src/services/engine/wiring/reevaluateDemand.ts`
- Create: `tests/services/engine/wiring/reevaluateDemand.test.ts`
- Create: `src/services/engine/wiring/demandCtx.ts` (the `ctx(state)` builder)
- Create: `tests/services/engine/wiring/demandCtx.test.ts`

**Signatures:**
```ts
function buildDemandCtx(state: EngineState): DemandCtx;   // demandCtx.ts
function reevaluateDemand(state: EngineState): void;      // reevaluateDemand.ts
```

**`reevaluateDemand` behaviour (spec §"Demand model"):** build `ctx` once, then
for each `row` in `ASSET_WIRING`, if `row.demand(ctx)` call
`state.assetSlots[row.key]?.load(row.req(state.sources.tier))`. `slot.load` is
idempotent (already-loading/ready rows are no-ops). **Each row is guarded**: a
`demand` predicate that throws is caught + logged so one bad predicate can't
stall the loop (spec §"Error handling"). For Part 2 it imports `ASSET_WIRING`
(built in Task 10); write Task 10 first or stub the import and wire after.

**`buildDemandCtx` behaviour:** `settings` = the readonly settings view off
`state`; `isVisible(s)` = `maskHas(state.sources.drawMask, s)`
(`utils/sourceMask`, as `wireSlots.ts:450` / `503`); `request(k)` reads a
`state`-held request-flag set (introduce `state.requests: Set<RequestKey>` or
reuse an existing flag bag — check `EngineState.d.ts` first); `slotState(k)` =
`state.assetSlots[k]?.state().kind ?? 'idle'`.

Note `state.assetSlots[row.key]` must resolve both the keyed slots
(`filaments`, `famousMeta`, `pgcAlias`, `cf4Density`, `mcpm`) AND the per-source
point slots (`state.assetSlots.points.get(source)`). Decide the indexing: add a
small `slotFor(state, key): AssetSlot | undefined` helper that maps a numeric
`SourceType` key to `state.assetSlots.points.get(key)` and a string key to
`state.assetSlots[key]`. Put it in `reevaluateDemand.ts` or `installSlots.ts`
(Part 3) — wherever the install map is canonical; keep it single-sourced.

- [ ] Add test `loads a row whose demand returns true` — stub `ASSET_WIRING`
  with one row; spy `slot.load`; assert called once with `row.req(tier)`.
- [ ] Add test `does not load a row whose demand returns false`.
- [ ] Add test `a throwing demand predicate is caught and does not stop later rows`
  — two rows, first throws, second's demand true; assert the second still loads.
- [ ] Add test `re-evaluation is safe to call twice` (idempotent `slot.load`
  stub records call count; assert no error, and the no-op contract holds).
- [ ] Add `buildDemandCtx` tests: `isVisible reflects drawMask`,
  `slotState returns idle for an absent slot`, `request reflects the request flag set`.
- [ ] Implement both. `npm run typecheck` → clean. `npm test -- reevaluateDemand demandCtx`
  → pass; full `npm test` → green.
- [ ] **Whole-file comment pass** on all four new files.
- [ ] Commit.

---

## Task 10: `ASSET_WIRING` registry + the demand table

**Files:**
- Create: `src/services/engine/wiring/assetWiring.ts`
- Create: `tests/services/engine/wiring/assetWiring.test.ts`

**Export:** `ASSET_WIRING: readonly AssetWiringRow[]` — one row per `AssetKey`,
each wiring the existing factory + a `req(tier)` + a `demand(ctx)`.

**The demand table (reproduce from spec §"The asset-wiring registry" table —
this is the contract; the predicates replace today's scattered triggers):**

| key | `demand(ctx)` | replaces (today) | note |
|---|---|---|---|
| SDSS / TwoMRS / Glade / Milliquas | `ctx.isVisible(src)` | boot-if-visible loop `wireSlots.ts:501-506` | per-source row |
| Famous | `ctx.isVisible(Source.Famous)` | same loop (curated) | dual-role; also feeds POI |
| famousMeta | `ctx.slotState(Source.Famous) !== 'idle'` | companion `loadCompanionAssets` | companion = predicate on owner |
| filaments | `ctx.settings.filaments.enabled` | unconditional `wireSlots.ts:509` | **BUG FIX** — was load-when-disabled |
| mcpm | `ctx.settings.volumes.fields.mcpm.enabled` | unconditional `wireSlots.ts:525` | default-on ⇒ true at boot |
| cf4Density | `ctx.settings.volumes.fields['cf4-density'].enabled` | `SOURCE_REGISTRY.visible` gate `wireSlots.ts:519-521` | default-off |
| clusterCatalog | `ctx.settings.structures.enabled` | unconditional `wireSlots.ts:515` | **BUG FIX** — was unconditional boot load |
| pgcAlias | `ctx.request('paletteOpened')` | lazy `loadPgcAliases()` | one-shot request flag |
| Synthetic | `allSurveysSettledWithoutSuccess(ctx)` | fallback gate `wireSlots.ts:480-494` | predicate over sibling slot states |
| DebugGaussian / DebugCartesian / DebugSpherical | `ctx.settings.volumes.fields[id].enabled` (DEV) | panel-toggled | DEV-only rows |

Notes the implementer must honor:
- `req(tier)`: surveys → `{ source, tier }`; famousMeta/pgcAlias → `{ tier }`;
  filaments → `{ tier }`; mcpm → `{ tier }`; cf4Density → `()` (no req — see
  `wireSlots.ts:520`); clusterCatalog → `{}` (empty `ClusterCatalogReq`,
  `wireSlots.ts:515`). Match each slot's existing `.load(...)` argument shape
  exactly (read each `.load` call site in `wireSlots.ts`).
- `allSurveysSettledWithoutSuccess(ctx)` is a helper reading `ctx.slotState`
  over `SURVEY_POINT_SOURCES`; full definition lands in **Task 13** with the
  synthetic-fallback extraction. For Task 10, the Synthetic row's `demand` calls
  that helper (import it from Task 13's module, or land Task 13 first — they're
  tightly coupled; either order works as long as both ship before Part 3).
- The settings-key strings (`'cf4-density'`, `'mcpm'`, the debug ids) are the
  `handle` values in `SOURCE_REGISTRY` (`sources.ts:359`, `386`, `410`, `427`,
  `444`). Derive them from the registry, do not hardcode duplicates
  (`feedback_single_source_of_truth`).
- DEV rows are gated the same way the current mint is — `import.meta.env.DEV`
  at the registry-build site (`wireSlots.ts:240`). Either omit them from
  `ASSET_WIRING` in production builds or have their `demand` short-circuit
  `false` when `!import.meta.env.DEV`; prefer omission so the slot is never even
  built in prod (matches today's tree-shaking, `wireSlots.ts:238-242`).

- [ ] Add test `every AssetKey except non-fetched POI sources has exactly one row`
  — assert the set of `row.key` equals the expected `AssetKey` set
  (`SURVEY_SOURCES` minus none, plus the three string keys; minus
  `Cluster`/`Supercluster`/`Void` which are not fetched).
- [ ] Add test `survey rows demand visibility` — for SDSS, `demand` with a ctx
  where `isVisible(SDSS)` is true → true; false → false.
- [ ] Add test `famousMeta demands when Famous slot is not idle` — `slotState`
  stub returns `'loading'` → true; `'idle'` → false.
- [ ] Add test `filaments demand follows settings.filaments.enabled` —
  **this is the bug-fix pin**: disabled → `demand` false (today it loaded
  unconditionally).
- [ ] Add test `clusterCatalog demand follows settings.structures.enabled` —
  **bug-fix pin**: disabled → false.
- [ ] Add test `cf4Density demand follows its field-enabled flag` (default-off →
  false at boot).
- [ ] Add test `pgcAlias demands only when paletteOpened request is set`.
- [ ] Implement `ASSET_WIRING`; each row's `factory` references the existing
  factory (e.g. `createFilamentSlot`), `req`, and `demand` from the table.
- [ ] `npm run typecheck` → clean. `npm test -- assetWiring` → pass; full
  `npm test` → green.
- [ ] **Whole-file comment pass** — the module header documents the table's
  rationale (every old policy was secretly "is it required?", ADR 0005 §3) and
  the two bug fixes.
- [ ] Commit.

---

## Task 11: Data-driven demand-table regression test

**Files:**
- Create: `tests/services/engine/wiring/demandTable.test.ts`

This is the regression net for the scattered-trigger consolidation (spec
§Testing "Demand table"). One data-driven test asserts, for representative
`(settings, visibility, request)` states, the EXACT set of rows
`reevaluateDemand` loads.

**Test shape:** a table of cases, each `{ name, ctxOverrides, expectedLoadedKeys }`.
Drive `reevaluateDemand` against a stub `state` whose `assetSlots` are
`slot.load` spies; assert the set of keys whose `load` fired equals
`expectedLoadedKeys`.

- [ ] Add case `boot defaults` — visible surveys (SDSS/2MRS/Glade per
  `SOURCE_REGISTRY.visible`, NOT Milliquas), Famous, famousMeta, mcpm
  (default-on); NOT filaments (default-off), NOT clusterCatalog (structures
  default — confirm the default), NOT cf4Density (default-off), NOT pgcAlias,
  NOT Synthetic.
- [ ] Add case `filaments enabled` — adds `filaments` to the loaded set; nothing
  else changes. (Pins the bug fix: with filaments disabled it must be absent.)
- [ ] Add case `structures disabled` — `clusterCatalog` absent. (Bug fix pin.)
- [ ] Add case `palette opened` — adds `pgcAlias`.
- [ ] Add case `all surveys hidden` — surveys absent; `Synthetic` present (the
  fallback predicate fires once all real surveys are settled-without-success —
  drive `slotState` to reflect that).
- [ ] Add case `cf4Density field enabled` — adds `cf4Density`.
- [ ] `npm run typecheck` → clean. `npm test -- demandTable` → all cases pass;
  full `npm test` → green.
- [ ] **Whole-file comment pass.**
- [ ] Commit.

---

## Task 12: Construction purity — factories return, never install

**Files (modify each slot factory + its test):**
- `src/services/loading/slots/filamentSlot.ts`
- `src/services/loading/slots/clusterCatalogSlot.ts`
- `src/services/loading/slots/cf4DensitySlot.ts`
- `src/services/loading/slots/mcpmSlot.ts`
- `src/services/loading/slots/famousMetaSlot.ts`
- `src/services/loading/slots/pgcAliasSlot.ts`
- `src/services/loading/slots/syntheticVolumeSlots.ts`
- the matching tests under `tests/services/loading/slots/`
- `src/@types/loading/SlotFactory.d.ts` (docstring: it already says factories
  must NOT call `slot.load`; now also must NOT write `state.assetSlots` —
  update §3 of the docstring at `SlotFactory.d.ts:9-13`)

**Change (ADR 0005 §4; grill "construction purity"):** each factory STOPS
writing `state.assetSlots.X = slot` at construction time and continues to NOT
call `slot.load()` (most already don't — confirm per file). It still constructs
+ subscribes + RETURNS the slot. The single install moves to the orchestrator
(Part 3 Task 15 / `installSlots`).

**Per-factory contract:** the factory's return value is unchanged; only the
self-install line is deleted. Subscribers that write `state.sources.*` (e.g.
famousMeta → `state.sources.famousMeta`, clusterCatalog →
`state.sources.clusterBulk`) STAY — those are commit-time data writes, not
construction-time installs (spec §"Construction purity": only the
`state.assetSlots.X = slot` line and any inline `.load()` go).

- [ ] For each factory, add/adjust a test `does not write state.assetSlots at construction`
  — call the factory with a stub `state` whose `assetSlots` is a spy/frozen
  object; assert the factory returned a slot and `state.assetSlots` was not
  mutated.
- [ ] For each factory, confirm (test) `does not call slot.load at construction`
  — spy on the returned slot's `load`; assert zero calls.
- [ ] Delete the self-install line from each factory. (Read each file first to
  locate it — the SlotFactory contract says step 3 is the install; that line is
  the deletion target.)
- [ ] Update `SlotFactory.d.ts` docstring to drop step 3 (install) and state the
  orchestrator owns install.
- [ ] `npm run typecheck` → clean. Some `wireSlots`/bootstrap tests may now fail
  because nothing installs the slots yet — that is EXPECTED and fixed in Part 3
  Task 15. If full `npm test` goes red ONLY on install-dependent bootstrap
  tests, note it and proceed; if any factory's OWN unit test goes red, stop and
  fix. (Prefer: land Task 12 and Part 3 Task 15 back-to-back so the tree is
  never broken at a commit boundary — see the note below.)
- [ ] **Whole-file comment pass** on every touched factory + `SlotFactory.d.ts`.
- [ ] Commit.

> **Sequencing note:** Task 12 removes installs; Part 3 Task 15 adds the single
> install. To keep every commit green, an implementer MAY do Task 12 + Task 15
> as one combined change on a single branch, committing once both are in place.
> If splitting, Task 12's commit message must note "install moves to Part 3
> Task 15; bootstrap tests transiently red until then" and Part 3 lands
> immediately after. Do not leave the tree red across unrelated work.

---

## Task 13: Extract `createSyntheticFallback`

**Files:**
- Create: `src/services/engine/wiring/createSyntheticFallback.ts`
- Create: `tests/services/engine/wiring/createSyntheticFallback.test.ts`
- Modify: `src/services/engine/wiring/assetWiring.ts` (Synthetic row's `demand`
  calls the exported `allSurveysSettledWithoutSuccess`)

**Signatures:**
```ts
function allSurveysSettledWithoutSuccess(ctx: DemandCtx): boolean;
function createSyntheticFallback(state: EngineState): SyntheticFallback;
```
(Define `SyntheticFallback` in `src/@types/engine/wiring/SyntheticFallback.d.ts`
if it needs a teardown/unsubscribe handle; if the unit only subscribes and never
needs disposal, return `void` and drop the type — decide by whether the
subscribers must be torn down on `engine.destroy()`. Audit the current gate's
`unsub` usage at `wireSlots.ts:459`/`477` — it self-unsubscribes after settling,
so a returned handle may be unnecessary.)

**Behaviour (relocates `wireSlots.ts:417-494`):** subscribe to each survey
slot's settling (`ready`/`error`); maintain the `realSettled` / `anyRealReady`
counters (`wireSlots.ts:440-441`); the gate condition
(`realSettled < realSet.size || anyRealReady` → not yet) is exactly
`allSurveysSettledWithoutSuccess`'s negation. When the gate trips, the unit
sets the condition the Synthetic row's `demand` reads and calls
`reevaluateDemand(state)` (spec §"Demand model": "subscribes to survey slot
transitions and sets the condition the Synthetic row's demand reads"). The
per-arrival `onStatusChange({ kind: 'ready', ... })` emission
(`wireSlots.ts:460-465`) stays here — it is the fallback unit's status side
effect.

The hidden-at-boot handling (`wireSlots.ts:450-457`: a hidden survey counts as
settled so the gate doesn't wait forever) MUST be preserved.

- [ ] Add test `allSurveysSettledWithoutSuccess true only when every survey settled and none succeeded`
  — drive `ctx.slotState` over the survey set: all `error` → true; one `ready`
  → false; one `loading` → false.
- [ ] Add test `hidden-at-boot survey counts as settled` — survey hidden in
  drawMask, others error → gate trips (Synthetic demanded).
- [ ] Add test `fires reevaluateDemand when all real surveys settle without success`
  — spy on the re-eval (inject it or spy on `state.assetSlots[Synthetic].load`);
  assert Synthetic gets loaded once.
- [ ] Add test `does not fire when any real survey succeeded` — one survey ready
  with count>0; assert Synthetic never loaded.
- [ ] Implement; DELETE the gate from `wireSlots.ts` (the deletion completes in
  Part 3 Task 15 when the orchestrator calls `createSyntheticFallback`).
- [ ] Wire the Synthetic row's `demand` (Task 10) to
  `allSurveysSettledWithoutSuccess`.
- [ ] `npm run typecheck` → clean. `npm test -- createSyntheticFallback` → pass;
  full `npm test` → green (or transiently red only on install-dependent
  bootstrap tests per Task 12 note).
- [ ] **Whole-file comment pass** on the new file + `assetWiring.ts`.
- [ ] Commit.

---

## Task 14: Part-2 integration check

**Files:** none (verification) + possible test fixups.

- [ ] Confirm `ASSET_WIRING` covers every fetchable asset and the demand table
  matches Task 10's table exactly.
- [ ] Confirm `reevaluateDemand` + `buildDemandCtx` + `createSyntheticFallback`
  + the demand-table test are all green in isolation
  (`npm test -- reevaluateDemand demandCtx assetWiring demandTable createSyntheticFallback`).
- [ ] Confirm no factory writes `state.assetSlots` (grep the factories for
  `state.assetSlots` assignment via Grep tool — should be zero LHS assignments).
- [ ] `npm run typecheck` → clean.
- [ ] Commit any fixups.

**Part 2 done when:** the registry + demand evaluator + synthetic fallback exist
and are unit-green, factories are pure constructors. Bootstrap may be transiently
red pending Part 3's single install — proceed directly to Part 3.
