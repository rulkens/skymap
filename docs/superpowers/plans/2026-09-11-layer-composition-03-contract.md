# Layer composition, prep PR (c) — the contract PR: composed settings, `EngineComposition`, `FRAME_ORDER`

Spec: [`docs/superpowers/specs/2026-09-09-layer-composition-design.md`](../specs/2026-09-09-layer-composition-design.md)
§9(c), with §4.2 (`Layer` / `defineLayer`), §4.3 (composed settings), §4.4
(`EngineComposition`), §4.5 (`EngineState` after) and §5 (frame order) as the contracts it
mints. Read §9(c) and §5 before starting — §5 is the larger review surface and the half
where a mis-transcribed roster line silently changes what draws.

Plan 03 of the layer-composition sequence; follows plan 01 (`ContentLayer` → `ContentPass`,
[`completed/2026-09-10-layer-composition-01-content-pass-rename.md`](completed/2026-09-10-layer-composition-01-content-pass-rename.md))
and plan 02 (boot de-coupling,
[`completed/2026-09-10-layer-composition-02-boot-decoupling.md`](completed/2026-09-10-layer-composition-02-boot-decoupling.md)).

Branch: `worktree-layer-contract` (off `62e3ac11c`). One PR, 14 tasks, every commit green.

**Parallelism 2.** Settings chain 1→2→3→4→5, frame chain 7→8→9→10→11. Task 6 follows Task 1
and nothing else; 12 and 13 are independent (13 describes the post-Task-9 state); 14 gates.

## Goal

Two contracts, one PR, because each is the other's premise and both are behaviour-neutral
while the app engine still carries every Layer's contributions:

1. **Composition.** The app's settings root stops being one hand-written 523-line type plus
   one hand-seeded 308-line literal plus one 577-line reducer map, and becomes a core seed
   plus Layer-owned settings fragments composed at the store seam. The type-level derivation
   is proved before any code moves. `EngineComposition` is minted and `EARTH_HOME` folds
   into its `home` field.
2. **Frame order.** `FRAME_ORDER` is authored as ONE hand-written nested list: order and
   roster as one artifact. The executor resolves a step's pass names by lookup instead of
   re-deriving a group from `(target, slab, phase)` predicates, and `target` / `slab` /
   `skyCapture` / `hdrPhase` leave the pass row, so a row and the order cannot disagree.

No Layer is formed, no renderer moves, no reference engine is built. This PR exists so that
(d) can: spec §10's dependency note puts (c) in front of everything — no Layer can be formed
before the settings derivation exists — while (a) and (b) are already shipped
(`8f8ae20fb`, `69eede86f`).

## Architecture

- **Settings**: `CoreSettingsState` (the nine clusters core owns) plus one
  `LayerSettingsFragment` per cluster a Layer will own (`key`, `seed`, `reducers`).
  `EngineSettingsState` becomes `ComposedSettings<typeof APP_SETTINGS_FRAGMENTS>` — derived,
  not authored. `buildInitialSettings` composes the seed from the same tuple;
  `settingsSlice` spreads each fragment's lifted case reducers, so a cluster cannot be
  seeded without its reducers or vice versa.
- **Composition**: `src/compositions/app.ts` produces the app's `EngineComposition`.
  `createEngine(canvas, cb, composition)` replaces the third `home` parameter.
- **Frame**: `FRAME_ORDER: readonly FrameStepSpec[]` in
  `src/services/engine/frame/frameOrder.ts` is the authored artifact; `expandFrameOrder`
  turns it plus this frame's inputs into the `FrameStep[]` the executor already walks (the
  five `frameProgram` parameters become step kinds and expansion inputs); each expanded
  render step carries its resolved `ContentPass[]`, so `executeFrame` stops filtering.

## Tech Stack

TypeScript 6.0.3 (const type parameters, key-remapped mapped types with `as`,
`infer K extends string`), Redux Toolkit `createSlice`, Vitest, Vite, WebGPU. No new
dependency.

## Global Constraints

From the spec (§9's opening, §9(c), §12), binding on every task:

- **Behaviour-neutral.** The shipped bundle must draw the same pixels in the same order,
  seed the same settings values, dispatch the same action types, and boot to the same pose.
  The diff a reviewer should see is where a fact is stated, never what it computes. GPU-timing
  slot names included: they are cross-run identifiers, so every one stays byte-identical
  (Task 10 authors them on the `FRAME_ORDER` line). Task 7 changes which bind group a pick
  draw sets; the pick ids it writes are unchanged.
- **Each prep PR is its own diff.** Nothing from (d) rides this one: no Layer value is
  constructed, no renderer moves, no `src/data/sources/<id>.ts` moves, no subsystem handle
  changes home, no `EngineData` / `EngineAssetSlots` field dissolves.
- **Shaders stay put.** One WESL package root at `src/services/gpu/shaders/<layer>/`;
  `package::` literals and `?static` paths are untouched (spec §12, the symlink-at-leaf
  landmine).
- **`Source` code numbering stays append-only and global** in `src/data/source.ts`; pick and
  selection encoding stay core (spec §12).
- **No toposort, no derived frame order, no schema-generated settings UI** (#4, ADR 0011).
  `FRAME_ORDER` is hand-authored; a Layer's UI stays a hand-written component.
- **The store stays fade-free**, and **`src/data/` never imports `services/`**.
- **Every file move/rename goes through `npm run move-files -- <from> <to>`** (or
  `-- --manifest <moves.json>`; `--dry` first, every time), never `git mv` plus hand-edited
  imports. See `.claude/skills/refactor/SKILL.md`.
- Comment budget per [`comments.md`](../conventions/comments.md): module header ≤ 10 lines,
  comment lines ≤ half the code lines in the file. `frameOrder.ts` is the one file allowed
  to be comment-heavy — the draw-order rationale is the artifact's real value and none of it
  is derivable — but that prose **moves** out of `passes/index.ts` and `frameProgram.ts`, it
  is not re-written, and those files lose it in the same commit.
- Tests per [`testing.md`](../conventions/testing.md): no runtime restatement of a type
  fact, no registry restatement, no mirror test. Task 8's frame-order equivalence test is
  the deliberate exception — its expectation comes from the CURRENT `frameProgram`, an
  independent expression of the same fact, and it is deleted in Task 9 when `frameProgram`
  stops existing.
- **`npm run perf` is a REQUIRED gate** (spec §9(c)): the `(hdr, NEAR0)` step-merge rule is
  a per-frame behaviour change in disguise. A neutral-or-negative delta **HALTS the
  landing** — land/park is the user's ruling, never process momentum.
- Commit after every task.

## Ground drift since the spec

The spec's inventory was written against `8f8ae20fb`. Four unrelated PRs landed after it
(#647 camera-pivot, #683 star-cut un-braid, #676 scene-workbench splats, #682 orbit trails).
Re-verified in this worktree at `62e3ac11c`; re-derive rather than trust:

| File / fact                                               | What changed                                                                                                                                                                                                                                                                   | What it means for this plan                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/@types/engine/frame/ContentPass.d.ts`                | **`hdrPostLensing` does not exist.** The field is `hdrPhase?: Exclude<HdrPhase, 'pre-lens'>` over a three-value `HdrPhase` (`'pre-lens' \| 'post-lens' \| 'post-foreground'`, `HdrPhase.d.ts`) — #682 moved `orbit-trails` to draw AFTER the `foreground:0 → hdr` composite.   | **Design change, not a line number.** `FRAME_ORDER` needs a THIRD `(hdr, NEAR0)` render line, placed after the composite line; the spec §5 draft list, which puts `orbit-trails` + `body-glints` in one pre-foreground line, is wrong on both counts. Amends §4.1, §5. |
| `src/services/engine/frame/frameProgram.ts:246-320`       | in-band the roster is `['pre-lens']` → lens body steps → `['post-lens']`; out of band ONE step admitting `['pre-lens','post-lens']`; the `['post-foreground']` step is emitted every frame after the composite                                                                 | Task 8 authors four `(hdr, NEAR0)`-family lines; the step-merge rule (§5) is what keeps an out-of-band frame at today's pass count, and is exactly why perf is a gate.                                                                                                 |
| `src/services/engine/frame/passes/index.ts`               | still **37 rows**, same order. `body-glints` is `'post-lens'`, `orbit-trails` is `'post-foreground'`. `zone-of-avoidance` sits third in the array for a PICK-order reason (`:278-284`)                                                                                         | that reason is a bind-group hand-off, not an ordering fact — Task 7 dissolves it so the registry really is unordered and Task 10 inherits no invariant.                                                                                                                |
| `src/state/settings/initialState.ts` / `settingsSlice.ts` | 308 / 577 lines, as the spec says. 22 top-level clusters; 75 case reducers, **each writing exactly one cluster** (verified mechanically), plus `mergeSnapshot`, which writes many                                                                                              | the split is clean — no reducer straddles two clusters. `mergeSnapshot` stays core (Task 3).                                                                                                                                                                           |
| `src/@types/settings/EngineSettingsState.d.ts`            | 523 lines; **9 of the 13 Layer clusters are inline object literals** (only `milkyWay`, `zoneOfAvoidance`, `sgrAStarLensingTuning`, `flow` have named types)                                                                                                                    | Task 2 extracts those nine before a seed can annotate its return type. Spec §4.3 assumed they were already named.                                                                                                                                                      |
| `src/@types/engine/state/EngineState.d.ts`                | 14 top-level fields; the 37 passes read 8 of them (`gpu` 115×, `settings` 59×, `subsystems` 16×, `data` 12×, `selectionRows` 5×, `selection` 3×, `assetSlots` 3×, `famousGalaxiesMeta` 1×) and never `booted` / `requests` / `cameraRuntime` / `skyCubemapCapture` / `picking` | §4.1's cut is reachable only as the FRAME-VISIBLE one — which is why it lands as `PassState`, not `CoreFrameState` (Ruling 4, Task 11).                                                                                                                                |
| pass method typing                                        | passes are contextually typed off `ContentPass`; only **9 files / 13 sites** name `EngineState` explicitly                                                                                                                                                                     | the narrowing is cheap: one new type plus 13 annotations, not a 37-file sweep.                                                                                                                                                                                         |
| `engine.ts:600`                                           | the DebugPanel toggle-name list filters `CONTENT_PASSES` on `l.target !== 'volume'`                                                                                                                                                                                            | a `target` reader outside `frame/`; Task 10 re-expresses it off `FRAME_ORDER`.                                                                                                                                                                                         |
| `engine.ts:91-95`, `wireInput.ts`, `earthHome.ts`         | (b) shipped `createEngine(canvas, cb, home)` + `BootstrapDeps.home`; `EngineHomeConfig` is pure data (`{ focus, seedSelection }`), `EARTH_HOME` lives at `src/data/selection/earthHome.ts`, and **`src/compositions/` does not exist**                                         | Task 6 creates `src/compositions/` (its first file) and folds `home` in at the one call site, `src/hooks/useEngine.ts:76`.                                                                                                                                             |
| `tests/services/engine/**`                                | six test files carry a near-identical inline stub `home` literal (eight literals; `engineSliceDispatches` has two). `wireInput.test.ts` is the seventh `home` user and deliberately builds on the real `EARTH_HOME`. Plan 02's ledger deferred the de-duplication here         | Task 6 picks it up: one shared stub, ~90 lines out.                                                                                                                                                                                                                    |
| `tests/services/engine/frame/targetParity.test.ts`        | 3 cases, as the spec says                                                                                                                                                                                                                                                      | legs 1–2 are subsumed by Task 8's boot check; leg 3 (id uniqueness) is re-homed, not deleted.                                                                                                                                                                          |
| #647 / #683 / #676                                        | camera-pivot rewrote `runFrame` / `slabs` / `wireInput` internals; the star-cut un-braid gave `starCatalogPass` per-view streams; splats are workbench-local                                                                                                                   | none touches a contract this PR mints. `runFrame`'s `ctx.focus` write (spec §6.1) stays exactly as it is — that seam is (e)'s.                                                                                                                                         |

## Rulings

Made at plan time; do not re-open during execution.

**Ruling 1 — a Layer owns a LIST of settings fragments, not one.** Spec §4.3 types
`Layer.settings` as a single `LayerSettingsFragment<Name, Cluster>` keyed by the Layer's
name. The tree does not fit: the `body` Layer owns four top-level clusters (`bodies`,
`earth`, `orbitTrails`, `sgrAStarLensingTuning`) and the ten Layers own thirteen clusters
between them. Reshaping the settings tree so each Layer has exactly one cluster is a
behaviour change (every `settings.earth.*` selector and UI read moves) and is not this PR's
business. So `settings?: readonly SettingsFragmentLike[]`, a fragment is keyed by its
CLUSTER name, and `ComposedSettings` maps over the union of FRAGMENTS rather than of Layers
— which also keeps the key-remapped mapped type exactly as §4.3 specifies, since fragments
carry the literal key. Amends §4.2 and §4.3.

**Ruling 2 — action type strings do not change.** Spec §4.3 says a fragment's action types
are namespaced `settings/<Key>/…`. They are not, here: RTK derives the type from the reducer
KEY, so namespacing renames all 75 actions, breaks the four tests that dispatch literal type
strings (`tests/components/containers/{StructuresSection,LabelsAndGuidesSection}Container.test.ts`)
and any persisted or replayed action, for no gain this PR can use — the fragment's file
already scopes the reducer. Keys stay flat and byte-identical — and nothing in the language
guards that: `liftClusterReducers` sees one fragment at a time, and two spreads sharing a key
are **not** a TS error (verified with `tsc --strict` here — the later spread silently wins,
and `createSlice` mints one action whose reducer writes the other cluster). So the guard is
written: `assertUniqueFragmentReducerKeys` (Task 1, called at module load in Task 3),
mirroring `composeSettingsSeed`'s cluster-key throw. Amends §4.3.

**Ruling 3 — the reducer lift is per-fragment at the composition site, not a union walk.**
`createSlice` must keep inferring 75 typed action creators. Merging all fragments' reducer
maps in one helper needs `UnionToIntersection` (which §4.3 rejects) or an assert that erases
every payload type. Spreading `...liftClusterReducers(fragment)` once per fragment inside
the `reducers` object gives TS a precise intersection for free, with no gymnastics: ten
spread lines that read as the composition they are. The tuple stays the single authority:
Task 3's cross-check test asserts both directions (every listed fragment's reducer keys exist
on `settingsSlice.actions`, and the slice mints nothing beyond core's keys plus the
fragments').

**Ruling 4 — the frame-visible cut lands as `PassState` (Task 11), not `CoreFrameState`.**
§4.1's "a pass reads its own Layer's renderers through its closure" cut is not available
until a Layer's `create` exists ((d)/(e)): all 37 passes still reach `state.gpu.*` (115
sites). What IS available, and is worth its one file, is EngineState-minus-the-fields-no-pass-
may-touch: `booted`, `requests`, `cameraRuntime`, `skyCubemapCapture`, `picking`. It is named
for its reader, because "core" already means the core-versus-Layer cut in
`CoreSettingsState`; `CoreFrameState` is minted in (d), when `gpu` leaves the pass contract
and the two cuts converge. It removes
`EngineState` from the four `ContentPass` signatures (spec §5's file table asks exactly for
that), costs 13 annotations, and SHRINKS in (d)/(e) as `gpu` / `data` / `subsystems` /
`assetSlots` dissolve. The alternative — deferring it — leaves the pass contract naming the
whole engine bag for two more PRs and re-opens the same file later.

**Ruling 5 — settings fragment files live in `src/layers/<name>/settings/`, one file per
cluster, and that is all those directories hold.** Spec §4's colocated layout is the answer
to "where before a Layer directory exists": this PR CREATES `src/layers/<name>/` for all ten
Layers with nothing but `settings/<cluster>Settings.ts` inside. Cluster TYPES stay in
`src/@types/settings/` beside the four that already live there (`MilkyWaySettings` &c.);
moving them into a Layer's `types/` folder is (d)/(e)'s move, made with the rest of that
Layer's files in one `npm run move-files` manifest. Seed and case reducers share the cluster
file — they are one responsibility (this cluster's settings) and splitting them would put a
five-line fragment value in its own file thirteen times.

**Ruling 6 — the thirteen clusters move in two batches, not thirteen tasks.** Task 3 carries
the machinery plus the two largest clusters (`galaxyCatalogs`, `starCatalogs`: 21 of the 75
reducers); Task 4 carries the remaining eleven as one batch with a per-file table. Between
them the branch is green because `buildInitialSettings` composes the moved fragments over a
core seed that still holds the unmoved clusters — the migration's intermediate state is
expressible, so it does not need to be avoided.

**Ruling 7 — `tier` and `dataUrl` are not composition fields, and `EngineComposition` is a
VALUE.** Spec §4.4 puts both on `EngineComposition`. Neither becomes a field: `tier` stays
exactly where it is today, in the Redux store, updated only through actions
(`requestTier` → `watchTierSaga` → `setTier`; there is no tier-immutable prep PR) — a
composition field would be a mirror of a value that changes at runtime, same as `dataUrl`
would mirror `dataBaseUrl()` (behind `fetchWithProgress.dataUrl`, read by ~20 fetchers) with
no reader in this PR. A contract field with no semantics, or one that is a second copy of
store state, is not a contract; `dataUrl` is minted in the PR that has a reader, (g) at the
earliest. With neither field, `EngineComposition` has no boot input left to be a function of:
`layers: []` and `home: EARTH_HOME` are both pure data, so it is minted as a module-level
literal, `APP_COMPOSITION` — plan 02's standing constraint
(no `src/compositions/` module evaluating a viewport or URL read at import time) is satisfied
because nothing in the literal reads anything.

**Ruling 8 — `LAYER_GROUPS.labels` totality is closed by classifying in data over the WHOLE
visibility vocabulary, not by the Layer seam §11 anticipates.** Stated in full at Task 12,
where it applies.

## File structure

**Created**

```
src/@types/settings/LayerSettingsFragment.d.ts     one cluster's settings: key + seed + reducers
src/@types/settings/SettingsFragmentLike.d.ts      the Cluster-free constraint the derivations quantify over
src/@types/settings/ComposedClusters.d.ts          the fragments' clusters, key-remapped
src/@types/settings/ComposedSettings.d.ts          core & ComposedClusters
src/@types/settings/LiftedCaseReducers.d.ts        one fragment's reducers, re-based on the root
src/@types/settings/CoreSettingsState.d.ts         the nine clusters core owns
src/@types/settings/{GalaxyCatalog,StarCatalog,Structure,Volume,Body,Earth,
                     OrbitTrails,Filaments,Constellations}Settings.d.ts
                                                   the nine inline cluster shapes, extracted (T2)
src/utils/settings/composeSettingsSeed.ts          core seed + fragments → the seeded root
src/utils/settings/liftClusterReducers.ts          one fragment's case reducers → root-state reducers
src/utils/settings/assertUniqueFragmentReducerKeys.ts  the flat action namespace's only guard
src/state/settings/coreSeed.ts                     the core clusters' seed literal
src/layers/<name>/settings/<cluster>Settings.ts    ×13 across ten Layer directories (T3, T4)
src/compositions/appSettingsFragments.ts           APP_SETTINGS_FRAGMENTS, `as const`
src/compositions/app.ts                            APP_COMPOSITION: EngineComposition, a module literal
src/@types/engine/layer/Layer.d.ts                 §4.2's umbrella type
src/@types/engine/layer/LayerCoreDeps.d.ts         what `create` is handed
src/@types/engine/layer/LayerUiSection.d.ts        the SettingsPanel section a Layer contributes
src/services/engine/layer/defineLayer.ts           the inference-only identity function
src/@types/engine/EngineComposition.d.ts           §4.4
src/@types/engine/frame/FrameStepSpec.d.ts         the authored frame-order row (the union)
src/@types/engine/frame/{Compute,Capture,Render,Foreground,Lens,Composite,Bloom,Tonemap}StepSpec.d.ts
                                                   one member per file (one type per file)
src/services/engine/frame/frameOrder.ts            FRAME_ORDER + the draw-order rationale
src/services/engine/frame/expandFrameOrder.ts      FRAME_ORDER + frame inputs → FrameStep[]
src/services/engine/frame/checkFrameOrder.ts       the boot check (§5's three items)
src/services/engine/frame/passSlabOf.ts            pass name → slab, derived from FRAME_ORDER (pick)
src/@types/engine/frame/PassState.d.ts             the frame-visible cut of EngineState
src/data/animation/visibilityLayerRows.ts          VISIBILITY_LAYER_ROWS, one row per key
tests/helpers/engine/stubHome.ts                   the one shared BootstrapDeps `home` stub
tests/…                                            mirrors, listed per task
```

**Modified**

```
src/@types/settings/EngineSettingsState.d.ts   523 lines → a derived alias over the fragment tuple
src/state/settings/initialState.ts             308-line literal → core seed + fragment composition
src/state/settings/settingsSlice.ts            577 lines → core reducers + thirteen lifted spreads
src/services/engine/engine.ts                  createEngine takes a composition; the toggle-name
                                               list (`:600`) stops reading a row's `.target`
src/@types/engine/BootstrapDeps.d.ts           home → composition
src/services/engine/phases/wireInput.ts        the home read moves one level deeper
src/hooks/useEngine.ts                         the one createEngine call site
src/@types/engine/frame/ContentPass.d.ts       −target −slab −skyCapture −hdrPhase; EngineState → PassState
src/@types/engine/frame/FrameStep.d.ts         a render/capture step carries its resolved passes; −hdrPhases
src/services/engine/frame/passes/index.ts      CONTENT_PASSES survives as an UNORDERED contributed-pass list
src/services/engine/frame/frameProgram.ts      frameProgram deleted; the slot derivations read a step's passes
src/services/engine/frame/executeFrame.ts      group selection → the step's own list; −the four predicates
src/services/engine/frame/pickProgram.ts       slab grouping reads passSlabOf
src/services/engine/frame/slabs.ts             −matchesHdrPhase, −the phase arm of renderStepTimingSlotName
src/services/engine/frame/passes/createUpsamplePass.ts   −target −slab
src/services/engine/phases/startLoop.ts        runs the boot check once
src/utils/animation/expandVisibilityLayers.ts  LAYER_GROUPS derived by filtering VISIBILITY_LAYER_ROWS
src/services/gpu/shaders/zoneOfAvoidance/fragmentPick.wesl   u moves to @group(0) (T7)
src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts  −pickCameraBgl; drawPick binds slot 0
src/services/gpu/renderers/structureMarker/structureMarkerRenderer.ts  own pick camera buffer + bind group
src/services/gpu/renderers/galaxyCatalog/galaxyPickRenderer.ts         −bindCamera (no caller left)
docs/BACKLOG.md                                one index line deleted (T11)
CLAUDE.md, docs/RENDERER.md                    tree lines + the frame-order paragraph (T12)
```

**Deleted**

```
src/@types/engine/frame/HdrPhase.d.ts               the phase vocabulary; a line's position replaces it
tests/services/engine/frame/targetParity.test.ts    legs 1–2 subsumed by the boot check; leg 3 re-homed
```

---

## Task 1 — the settings-fragment contract

**Files:** `src/@types/settings/LayerSettingsFragment.d.ts`,
`src/@types/settings/SettingsFragmentLike.d.ts`,
`src/@types/settings/ComposedClusters.d.ts`, `src/@types/settings/ComposedSettings.d.ts`,
`src/@types/settings/LiftedCaseReducers.d.ts` (new); `src/utils/settings/composeSettingsSeed.ts`,
`src/utils/settings/liftClusterReducers.ts`,
`src/utils/settings/assertUniqueFragmentReducerKeys.ts` (new);
`tests/utils/settings/composeSettingsSeed.test.ts`,
`tests/utils/settings/liftClusterReducers.test.ts`,
`tests/utils/settings/assertUniqueFragmentReducerKeys.test.ts` (new).

**Consumes:** `SliceCaseReducers`, `PayloadAction` from `@reduxjs/toolkit`.
**Produces:**

```ts
// src/@types/settings/LayerSettingsFragment.d.ts
export type LayerSettingsFragment<Key extends string, Cluster> = {
  readonly key: Key;
  readonly seed: () => Cluster;
  /** Case reducers over this cluster alone; `liftClusterReducers` re-bases them on the root. */
  readonly reducers: SliceCaseReducers<Cluster>;
};

// src/@types/settings/SettingsFragmentLike.d.ts
// The constraint every derivation quantifies over. It names no Cluster type parameter on
// purpose: `Cluster` sits in both a covariant (`seed`) and a contravariant (`reducers`)
// position, so `LayerSettingsFragment<string, unknown>` is not a supertype of a concrete
// fragment. The derivations recover the cluster with `infer` instead.
export type SettingsFragmentLike = {
  readonly key: string;
  readonly seed: () => object;
  readonly reducers: object;
};

// src/@types/settings/ComposedClusters.d.ts — the key-remapped half, on its own so the
// core half can be a plain intersection (§4.3: a `never` key silently drops out, which is
// what lets a fragment-free Layer contribute nothing without a branch)
type ClusterOf<F> = F extends { readonly seed: () => infer C } ? C : never;
export type ComposedClusters<Fragments extends readonly SettingsFragmentLike[]> = {
  [F in Fragments[number] as F extends { readonly key: infer K extends string }
    ? K
    : never]: ClusterOf<F>;
};

// src/@types/settings/ComposedSettings.d.ts
export type ComposedSettings<Core, Fragments extends readonly SettingsFragmentLike[]> = Core &
  ComposedClusters<Fragments>;

// src/@types/settings/LiftedCaseReducers.d.ts
type ActionOf<R> = R extends (cluster: never, action: infer A) => void ? A : never;
export type LiftedCaseReducers<Root, F extends SettingsFragmentLike> = {
  [K in keyof F['reducers']]: (state: Draft<Root>, action: ActionOf<F['reducers'][K]>) => void;
};

// src/utils/settings/composeSettingsSeed.ts
export function composeSettingsSeed<
  Core extends object,
  const Fragments extends readonly SettingsFragmentLike[],
>(core: Core, fragments: Fragments): ComposedSettings<Core, Fragments>;

// src/utils/settings/liftClusterReducers.ts — one fragment's reducers, re-based on the root
export function liftClusterReducers<Root, F extends SettingsFragmentLike>(
  fragment: F,
): LiftedCaseReducers<Root, F>;

// src/utils/settings/assertUniqueFragmentReducerKeys.ts — the flat namespace's only guard
// (Ruling 2: neither `liftClusterReducers` nor the compiler can see across fragments).
export function assertUniqueFragmentReducerKeys(fragments: readonly SettingsFragmentLike[]): void;
```

`CoreSettingsState` does not exist yet (Task 5 mints it), so `ComposedSettings` takes the
core half as a type parameter and Task 5 pins it. Keep the two apart; do not inline the core
type into the derivation.

Two shapes the lift does NOT support, verified absent from `settingsSlice.ts` today and to
be rejected rather than accommodated: RTK's `{ reducer, prepare }` reducer form, and a case
reducer that writes more than one cluster. `mergeSnapshot` is the latter and stays a core
reducer for exactly that reason.

- [ ] Write the failing tests first:
  - `composeSettingsSeed places each fragment's cluster under its own key` — a core seed
    `{ labels: { focusedOnly: false } }` plus two toy fragments (`{ key: 'alpha', seed: () => ({ n: 1 }) }`,
    `{ key: 'beta', seed: () => ({ s: 'x' }) }`) yields `{ labels, alpha: { n: 1 }, beta: { s: 'x' } }`.
  - `composeSettingsSeed throws when a fragment key shadows a core cluster` — a fragment
    keyed `'labels'` throws, naming the key. This is the bug the type system cannot catch
    (an intersection silently narrows instead of erroring) and the one a thirteen-fragment
    tuple will actually hit.
  - `composeSettingsSeed throws when two fragments share a key` — same reason, reported once.
  - `liftClusterReducers rebases a case reducer onto its cluster` — a fragment reducer
    `setN: (cluster, action) => { cluster.n = action.payload; }` lifted and applied to
    `{ alpha: { n: 1 }, beta: { s: 'x' } }` sets `alpha.n` and leaves `beta` untouched
    (assert `beta` is the same object identity, which is what proves the lift did not
    clone the root).
  - `assertUniqueFragmentReducerKeys throws naming a reducer key two fragments claim` — two
    toy fragments both declaring `setEnabled` throw with `'setEnabled'` and BOTH cluster keys
    in the message. It is the guard Ruling 2 wrongly expected from the compiler.
- [ ] Implement. `liftClusterReducers` must work under an Immer draft — exercise it through
      a real `createSlice` in the test, not a bare object, or the draft-projection bug it
      exists to prevent will not be reachable.
- [ ] `npm run typecheck` + `npm test -- settings` green. Commit.

**Reject if:** a test asserts a type fact at runtime; `ComposedSettings` uses
`UnionToIntersection`; `SettingsFragmentLike` grew a `Cluster` parameter.

## Task 2 — extract the nine inline cluster types

**Files:** `src/@types/settings/EngineSettingsState.d.ts` (modify) and nine new
`src/@types/settings/<X>Settings.d.ts`. Type-only; **no runtime file changes at all.**

Nine of the thirteen Layer clusters are inline object literals inside
`EngineSettingsState.d.ts`; a seed cannot annotate its return type until each is a named
type. The four that already exist (`MilkyWaySettings`, `ZoneOfAvoidanceSettings`,
`SgrAStarLensingTuning`, `FlowSettings`) are untouched.

| Cluster          | New type                 | Source (EngineSettingsState.d.ts) |
| ---------------- | ------------------------ | --------------------------------- |
| `galaxyCatalogs` | `GalaxyCatalogSettings`  | `:106`                            |
| `starCatalogs`   | `StarCatalogSettings`    | `:341`                            |
| `structures`     | `StructureSettings`      | `:520`                            |
| `volumes`        | `VolumeSettings`         | `:392`                            |
| `bodies`         | `BodySettings`           | `:376`                            |
| `earth`          | `EarthSettings`          | `:267`                            |
| `orbitTrails`    | `OrbitTrailsSettings`    | `:242`                            |
| `filaments`      | `FilamentsSettings`      | `:212`                            |
| `constellations` | `ConstellationsSettings` | `:227`                            |

- [ ] Move each literal into its own file verbatim — same fields, same optionality, same
      docblocks (the field docs go with the fields; `EngineSettingsState`'s remaining
      per-cluster one-liners stay). `EngineSettingsState` then references the nine types.
- [ ] Use `npm run refactor -- extract` where it fits the shape; otherwise hand-write the
      file and re-point the one reference. **Never** `git mv`.
- [ ] Sweep: `rg -n "settings\." src --type ts | rg "as unknown as"` must not grow — an
      extraction that needed a cast changed a type and is wrong.
- [ ] `npm run typecheck` green (this is the whole gate: a changed shape shows up as an
      error at a selector or a seed). `npm test` green. Commit.

**Reject if:** any field's type changed, widened or gained `?`; a cluster type landed
anywhere but `src/@types/settings/`; the diff contains a runtime file.

## Task 3 — the migration machinery plus the two largest clusters

**Files:** `src/state/settings/coreSeed.ts`,
`src/layers/galaxyCatalog/settings/galaxyCatalogsSettings.ts`,
`src/layers/starCatalog/settings/starCatalogsSettings.ts`,
`src/compositions/appSettingsFragments.ts` (new);
`src/state/settings/initialState.ts`, `src/state/settings/settingsSlice.ts` (modify);
`tests/state/settings/initialState.test.ts`, `tests/state/settings/settingsSlice.test.ts`
(modify, if the existing names differ — find them first).

**Produces** (the shape every later cluster copies):

```ts
// src/layers/galaxyCatalog/settings/galaxyCatalogsSettings.ts
export const galaxyCatalogsSettingsFragment = {
  key: 'galaxyCatalogs',
  seed: (): GalaxyCatalogSettings => ({
    /* moved verbatim from initialState.ts:112-126 */
  }),
  reducers: {
    /* the ten case reducers moved from settingsSlice.ts:79-134, retyped on the cluster */
  },
} as const satisfies LayerSettingsFragment<'galaxyCatalogs', GalaxyCatalogSettings>;
```

```ts
// src/state/settings/initialState.ts, after
export function buildInitialSettings(): EngineSettingsState {
  return composeSettingsSeed(CORE_SEED, APP_SETTINGS_FRAGMENTS) as EngineSettingsState;
}
```

- [ ] `CORE_SEED` starts as "everything not yet moved": the nine core clusters plus the
      eleven Layer clusters Task 4 will take. It shrinks to the nine in Task 4; do not
      pre-empt that split with a second constant.
- [ ] Move each cluster's seed literal and case reducers **verbatim** — same defaults, same
      imports, same comments. A reducer's body changes only in its first parameter
      (`settings.galaxyCatalogs.x` → `cluster.x`).
- [ ] `settingsSlice.reducers` gains `...liftClusterReducers(galaxyCatalogsSettingsFragment)`
      and the same for star catalogs, and loses the 21 moved definitions. Action creator
      names and exported symbols are unchanged (Ruling 2).
- [ ] `appSettingsFragments.ts` calls `assertUniqueFragmentReducerKeys(APP_SETTINGS_FRAGMENTS)`
      at module scope, immediately after the tuple — so a collision throws at import, before
      a store exists to be silently wrong.
- [ ] Tests — adapt, do not duplicate. The existing initial-state test already asserts every
      cluster and item row is seeded; keep it pointed at `buildInitialSettings()`. Add
      exactly one new test: `every fragment's seeded cluster is reachable under its key` in
      `tests/state/settings/initialState.test.ts`, asserting for each entry of
      `APP_SETTINGS_FRAGMENTS` that `buildInitialSettings()[f.key]` is defined. It fails the
      day a fragment is added to the tuple but its key collides or its seed returns nothing,
      and it is the test that grows with the tuple instead of restating it.
- [ ] Add one more, in `tests/state/settings/settingsSlice.test.ts`:
      `the slice mints exactly the core reducers plus every listed fragment's` — assert
      `Object.keys(settingsSlice.actions).sort()` equals the sorted union of the core
      reducer-map keys and `APP_SETTINGS_FRAGMENTS.flatMap((f) => Object.keys(f.reducers))`.
      It closes both directions of the tuple-versus-spreads gap (listed but unspread, spread
      but unlisted) from two independently derived key sets.
- [ ] `npm run typecheck` + `npm test` green; `npm test -- settings` and the two container
      tests that dispatch literal action types must be green **without edits** — that is the
      proof Ruling 2 held.
- [ ] Commit.

**Reject if:** an action type string changed; a default value changed; a moved reducer body
changed beyond its parameter; `src/layers/galaxyCatalog/` gained anything but `settings/`.

## Task 4 — the remaining eleven clusters

**Files:** eleven new `src/layers/<name>/settings/<cluster>Settings.ts`;
`src/state/settings/coreSeed.ts`, `src/state/settings/initialState.ts`,
`src/state/settings/settingsSlice.ts`, `src/compositions/appSettingsFragments.ts` (modify).

Same shape as Task 3, once per row. Re-derive the line ranges; they move as each batch lands.

| Layer             | Cluster                 | Seed (initialState.ts) | Reducers                   |
| ----------------- | ----------------------- | ---------------------- | -------------------------- |
| `structure`       | `structures`            | `:302`                 | `settingsSlice.ts:471-484` |
| `volume`          | `volumes`               | `:247`                 | `:318-347` (4)             |
| `body`            | `bodies`                | `:239`                 | `:307-317` (1)             |
| `body`            | `earth`                 | `:201`                 | `:230-248` (3)             |
| `body`            | `orbitTrails`           | `:191`                 | `:223-229` (1)             |
| `body`            | `sgrAStarLensingTuning` | `:175`                 | `:201-206` (1)             |
| `milkyWay`        | `milkyWay`              | `:161`                 | `:176-190` (3)             |
| `zoneOfAvoidance` | `zoneOfAvoidance`       | `:169`                 | `:191-200` (2)             |
| `filaments`       | `filaments`             | `:176`                 | `:207-214` (2)             |
| `constellations`  | `constellations`        | `:184`                 | `:215-222` (2)             |
| `flow`            | `flow`                  | `:255`                 | `:348-360` (2)             |

- [ ] Move all eleven, one commit per Layer directory (ten commits at most) so a reviewer can
      read each against its source. The `body` Layer's four clusters ride one commit.
- [ ] `CORE_SEED` ends holding exactly the nine core clusters: `orientation`, `camera`,
      `tonemap`, `hdr`, `bloom`, `bias`, `thumbnails`, `labels`, `debug`. `mergeSnapshot`
      stays in `settingsSlice` — it writes across clusters and belongs to the root.
- [ ] No new tests. The initial-state test plus the compiler cover the move; a per-cluster
      "the seed seeds" test is a constant restatement.
- [ ] `npm run typecheck` + `npm test` green after every commit. Test count must be
      unchanged from Task 3.

**Reject if:** `initialState.ts` still carries a Layer cluster literal; a cluster landed in
the wrong Layer directory (check the table); a `volumes` row lost `seedVolumeFields()`.

## Task 5 — `CoreSettingsState`, and `EngineSettingsState` derived

**Files:** `src/@types/settings/CoreSettingsState.d.ts` (new);
`src/@types/settings/EngineSettingsState.d.ts`, `src/state/settings/coreSeed.ts`,
`src/state/settings/initialState.ts` (modify);
`tests/state/settings/initialState.test.ts` (modify).

**Produces:**

```ts
// src/@types/settings/CoreSettingsState.d.ts — the nine clusters core owns (§4.3)
export type CoreSettingsState = {
  orientation: OrientationFrameId;
  camera: { fovDeg: number };
  tonemap: { … };
  hdr: HdrSettings;
  bloom: { … };
  bias: { … };
  thumbnails: { … };
  labels: LabelSettings;
  debug: { … };
};

// src/@types/settings/EngineSettingsState.d.ts, after — derived, not authored
export type EngineSettingsState = ComposedSettings<
  CoreSettingsState,
  typeof APP_SETTINGS_FRAGMENTS
>;
```

- [ ] `CoreSettingsState` is the surviving half of today's `EngineSettingsState.d.ts`,
      moved verbatim with its docblocks. `EngineSettingsState.d.ts` keeps the name (every
      importer keeps compiling) and becomes the derived alias plus the module header that
      says so.
- [ ] `CORE_SEED` is annotated `CoreSettingsState`, which is what makes a missing core
      cluster a type error at the seed rather than at a selector.
- [ ] Add ONE test, `tests/state/settings/initialState.test.ts`:
      `the seeded settings root has exactly the composed type's keys` — assert
      `Object.keys(buildInitialSettings()).sort()` equals
      `[...Object.keys(CORE_SEED), ...APP_SETTINGS_FRAGMENTS.map((f) => f.key)].sort()`.
      Spec §4.3 names this as the covering test for the one runtime assert in the
      composition; it is not a registry restatement, because both sides are derived from
      different expressions (the composed VALUE versus the composing INPUTS).
- [ ] `npm run typecheck` is the load-bearing gate here: 500+ reads of `settings.<cluster>`
      across `src/` and `tests/` now resolve through the derived type. A single error means
      a fragment's seed return type widened — fix the seed's annotation, never the reader.
- [ ] `npm test` green. Commit.

**Reject if:** `EngineSettingsState` is still hand-authored; any reader gained a cast;
`CoreSettingsState` contains a Layer cluster.

## Task 6 — `Layer`, `defineLayer`, `EngineComposition`, and the app composition

**Files:** `src/@types/engine/layer/Layer.d.ts`,
`src/@types/engine/layer/LayerCoreDeps.d.ts`, `src/@types/engine/layer/LayerUiSection.d.ts`,
`src/services/engine/layer/defineLayer.ts`, `src/@types/engine/EngineComposition.d.ts`,
`src/compositions/app.ts`, `tests/helpers/engine/stubHome.ts` (new);
`src/@types/engine/BootstrapDeps.d.ts`, `src/services/engine/engine.ts`,
`src/services/engine/phases/wireInput.ts`, `src/hooks/useEngine.ts` (modify);
the seven test files carrying an inline `home` stub (modify) —
`tests/services/engine/phases/{wireSlots,startLoop,initGpu.hdrCapabilityWiring}.test.ts`,
`tests/services/engine/wiring/{installLoadProgress,engineSliceDispatches}.test.ts`,
`tests/services/engine/registerReconcile.test.ts`,
`tests/services/engine/phases/wireInput.test.ts` (this one keeps using the real
`EARTH_HOME`; it changes only where `home` sits).

**Produces** — §4.2 and §4.4 exactly, with Ruling 1's amendment:

```ts
// src/@types/engine/layer/Layer.d.ts   (sub-shapes each get their own file)
export type Layer<Name extends string, Runtime> = {
  readonly name: Name;

  /** This Layer's settings clusters (§4.3). Absent = no knobs. */
  readonly settings?: readonly SettingsFragmentLike[];

  // Static contributions: plain data, readable without booting anything.
  readonly targets?: readonly RenderTargetSpec[];
  readonly sagas?: readonly SagaFactory[];
  /** This Layer's `SOURCE_REGISTRY` rows, keyed by their global `Source` code (§4.7). */
  readonly sources?: readonly (readonly [SourceType, SourceEntry])[];
  /** The SettingsPanel section: a hand-written component, never generated. */
  readonly ui?: LayerUiSection;

  // Lifecycle: this Layer's private renderers, subsystems, data store and asset slots.
  create(deps: LayerCoreDeps): Runtime;
  destroy(runtime: Runtime): void;

  // Runtime-bound contributions: closures over the Layer's own state.
  passes(runtime: Runtime): readonly ContentPass[];
  assets?(runtime: Runtime): readonly AssetWiringRow[];
  fades?(runtime: Runtime): readonly FadeLayer<unknown>[];
  labels?(runtime: Runtime): readonly Label2DProducer[];
  pick?(runtime: Runtime): readonly PickResolverRow[];
};

// src/services/engine/layer/defineLayer.ts — identity; exists only for inference
export function defineLayer<const Name extends string, Runtime>(
  layer: Layer<Name, Runtime>,
): Layer<Name, Runtime>;

// src/@types/engine/EngineComposition.d.ts
// `Layer<string, unknown>` is the erased constraint: `Runtime` sits in a return position
// (`create`) and in method-parameter positions (`destroy`/`passes`), and TS's method
// bivariance is what makes a concrete Layer assignable to it. `never` would NOT work —
// `create`'s return is covariant.
export type EngineComposition<Layers extends readonly Layer<string, unknown>[]> = {
  readonly layers: Layers;
  /** Boot home target + whether to seed selection (§9(b)); pure data. */
  readonly home: EngineHomeConfig;
};

// src/compositions/app.ts — a module-level literal, not a function: `layers` is `[]` and
// `home` is `EARTH_HOME`, both pure data, so nothing here reads the viewport or the URL at
// import time (plan 02's standing constraint).
export const APP_COMPOSITION: EngineComposition<[]> = {
  layers: [],
  home: EARTH_HOME,
};

// src/services/engine/engine.ts
export function createEngine(
  canvas: HTMLCanvasElement,
  cb: EngineCallbacks,
  composition: EngineComposition<readonly Layer<string, unknown>[]>,
): EngineHandle;
```

`layers` is `[]` in this PR: (d) is what puts the first value in it, and a stub Layer
constructed here to make the field non-empty would be scaffolding with no reader. Say so in
`app.ts`'s header in one line; do not apologise for it in three.

- [ ] `Layer` and `defineLayer` are minted and exercised by nothing. That is deliberate and
      is §9(c)'s stated job ("introduce §4.2's type … before any code moves"). Do NOT write
      a test for them: there is no behaviour to assert, and a type test is the anti-pattern
      `testing.md` names first.
- [ ] Thread the composition: `BootstrapDeps.home` becomes `BootstrapDeps.composition`, and
      `wireInput` reads `deps.composition.home`. Nothing else in the phases changes.
- [ ] `useEngine.ts:76` calls
      `createEngine(canvas, { store, setSagaContext }, APP_COMPOSITION)` — a plain import, no
      boot-value plumbing; the tier the engine's passes read stays a `state.tier` selector,
      unchanged by this PR.
- [ ] Pick up plan 02's deferral: `tests/helpers/engine/stubHome.ts` exports the one stub the
      seven fixtures share (`STUB_COMPOSITION`, carrying `home: { focus: null, seedSelection: false }`).
      Fixtures that never read it import it; `wireInput.test.ts` keeps building a real
      composition around `EARTH_HOME`.
- [ ] No new behaviour test. The existing `wireInput` tests already assert the seeded pose,
      the cinema branch and the deep-link deference through `home`; they keep passing through
      one more field hop, which is the whole claim.
- [ ] `npm run typecheck` + `npm test` green. Commit (one commit for the types, one for the
      threading + fixtures).

**Reject if:** a Layer value was constructed; `EngineComposition` gained a field spec §4.4
(as amended by Ruling 7) does not name; `APP_COMPOSITION` reads `window`, `Date.now()`, the
URL or a store value; a fixture kept its inline `home` literal.

## Task 7 — the COSMO pick pass stops inheriting `@group(0)`

**Files:** `src/services/gpu/shaders/zoneOfAvoidance/fragmentPick.wesl`,
`src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts`,
`src/services/gpu/renderers/structureMarker/structureMarkerRenderer.ts`,
`src/@types/rendering/StructureMarkerRenderer.d.ts`,
`src/services/engine/frame/passes/structureMarkersPass.ts`,
`src/services/gpu/renderers/galaxyCatalog/galaxyPickRenderer.ts`,
`src/@types/rendering/GalaxyPickRenderer.d.ts`,
`src/services/engine/frame/passes/{proceduralDisks,labels}Pass.ts`,
`src/services/engine/frame/passes/index.ts`, `src/services/engine/frame/pickProgram.ts`
(comments only) — all modify.

Two COSMO pick draws bind nothing at slot 0 and take whatever
`galaxyPointSpritesPass.drawPick` left there, which is what makes `CONTENT_PASSES`' array
position load-bearing (`passes/index.ts:278-284`). That is a resource hand-off wearing an
ordering note, and in (d) it becomes a silent cross-Layer dependency — `zoneOfAvoidance`
picking only because `galaxyCatalog` is listed earlier in `EngineComposition.layers`,
discovered as "clicks do nothing". Dissolve it before the frame-order half inherits it; pick
is a click-time path, so the extra bind costs nothing per frame.

Copy the NEAR0 pickables' pattern — each binds its OWN complete slot-0 camera
(`pickProgram.ts:315-320`; `milkyWayPickRenderer.ts:11-27` says why, `milkyWayPass.ts:159-163`
is the call shape).

- [ ] **Zone of avoidance** — its pick pipeline reads nothing at slot 0 (the BGL exists only
      for structural compatibility, `zoneOfAvoidanceRenderer.ts:88-116`), so this is a
      deletion: move `u` from `@group(1)` to `@group(0)` in `fragmentPick.wesl`, drop
      `pickCameraBgl`, make the pick pipeline layout `[bindGroupLayout]`, and have `drawPick`
      `setBindGroup(0, bindGroup)` — the same object `draw` binds. Delete the three comment
      blocks that taught the inheritance (renderer `:88-94` and `:252-255`, shader `:26-27`).
- [ ] **Structure markers** — its pick VERTEX stage genuinely reads the shared camera
      (`ringPick` compiles the visible ring's vertex source; the shared `pipelineLayout` is
      `[cameraBgl, fadeBgl, sourceBgl]`, `structureMarkerRenderer.ts:290-340`). Give it its
      OWN pick camera buffer + bind group and change the signature to
      `pickRing(pass: GPURenderPassEncoder, uniformBytes: ArrayBuffer): void`, uploaded
      verbatim like `galaxyPickRenderer.drawPoints` — never the draw-time `uniformBuffer`,
      which would reintroduce the stale-snapshot bug that helper exists to prevent.
      `structureMarkersPass.drawPick` passes `pickUniformBytesOf(view, ctx, state)`.
- [ ] **The proof**: `galaxyPickRenderer.bindCamera` now has no caller. Delete it, its
      docblock, its `GalaxyPickRenderer` member, and the two restore calls
      (`proceduralDisksPass.ts:85`, `labelsPass.ts:103`) with the prose explaining them.
      Before deleting, sweep for a third inheritor:
      `rg -n "caller-bound|caller's @group|prefix contract" src/services/gpu/renderers src/services/engine/frame/passes`.
      Fix any hit the same way, or STOP and report.
- [ ] Delete the PICK-order half of the PRODUCER note at `passes/index.ts:278-284` — the
      clause from "but the PICK program groups by slab alone" to the end. Its first half (why
      the row's own `'zoa'` target keeps it out of every visual group) is about shape and
      survives, as does the CONSUMER note at `:291-293`. Strike the matching claim from
      `pickProgram.ts`'s `pickablesBySlab` docblock (`:303-320` — the "@group(0) prefix
      contract" paragraph; the near→far slab ordering above it is a different fact and
      stays). `CONTENT_PASSES` is then a set, and Tasks 8–10 must not re-introduce an order
      claim about it.
- [ ] No new test. The pick path's existing tests cover the ids; this changes which bind group
      a draw sets, not what it writes. The real gate is Task 14's smoke, which adds a ZoA click.
- [ ] `npm run typecheck` + `npm run build` (the only check that links WESL — load-bearing
      here, the shader's `@group` changed) + `npm test` green. Commit.

**Reject if:** a pick draw still relies on another row having bound slot 0; `bindCamera`
survived with no caller; `pickRing` read the draw-time uniform buffer; the fix landed in the
same commit as any other task.

## Task 8 — `FRAME_ORDER` authored, with the boot check and an equivalence test

**Files:** `src/@types/engine/frame/FrameStepSpec.d.ts` + the eight member files,
`src/services/engine/frame/frameOrder.ts`,
`src/services/engine/frame/expandFrameOrder.ts`,
`src/services/engine/frame/checkFrameOrder.ts` (new);
`tests/services/engine/frame/expandFrameOrder.test.ts`,
`tests/services/engine/frame/checkFrameOrder.test.ts` (new).
Nothing in the running frame changes in this task: `frameProgram` still drives the executor.

**Produces** — spec §5's union, amended by the drift row (`tonemap` split out, and the
`(hdr, NEAR0)` roster authored as three lines around the lens and the composite):

```ts
// src/@types/engine/frame/FrameStepSpec.d.ts (each member is its own file)
export type FrameStepSpec =
  | { readonly kind: 'compute'; readonly name: string }
  | {
      readonly kind: 'capture';
      readonly target: string;
      readonly cosmoPasses: readonly string[];
      readonly near0Passes: readonly string[];
    }
  | {
      readonly kind: 'render';
      readonly target: string;
      readonly slab: number;
      readonly passes: readonly string[];
      /**
       * GPU-timing slot suffix, appended to `groupKeyOf(target, slab)` with the same
       * separator; the one line in a group without it owns the bare key. Authored here so a
       * slot's identity is a name, not an ordinal — inserting a line renumbers nothing.
       */
      readonly slot?: string;
    }
  | {
      readonly kind: 'foreground';
      readonly target: string;
      readonly near0Passes: readonly string[];
      readonly bodyPasses: readonly string[];
    }
  | { readonly kind: 'lens'; readonly target: string; readonly passes: readonly string[] }
  | { readonly kind: 'composite'; readonly source: string; readonly dest: string }
  | { readonly kind: 'bloom' }
  | { readonly kind: 'tonemap'; readonly source: string; readonly dest: string };

// src/services/engine/frame/frameOrder.ts
export const FRAME_ORDER: readonly FrameStepSpec[] = [
  /* the lines below, in this order */
];

// src/services/engine/frame/expandFrameOrder.ts
type FrameInputs = {
  readonly tone: ToneMap;
  readonly bloomEnabled: boolean;
  readonly foregroundChain: readonly number[];
  readonly skyCubemapFacesToCapture: readonly CubeFace[];
  readonly lensBodySlabs: readonly number[];
};

// Dispatch is a TABLE, not a switch: `executeFrame.ts:9` advertises itself as the frame's
// only switch, and an eight-arm sibling would make that false. Each row self-narrows.
const EXPAND_STEP: {
  [K in FrameStepSpec['kind']]: (
    spec: Extract<FrameStepSpec, { readonly kind: K }>,
    passes: readonly ContentPass[],
    frame: FrameInputs,
  ) => readonly FrameStep[];
};

export function expandFrameOrder(
  order: readonly FrameStepSpec[],
  passes: readonly ContentPass[],
  frame: FrameInputs,
): readonly FrameStep[];

// src/services/engine/frame/checkFrameOrder.ts — throws, naming the offending pass/target
export function checkFrameOrder(
  order: readonly FrameStepSpec[],
  passes: readonly ContentPass[],
  targetIds: readonly string[],
): void;
```

**The authored lines.** Do not transcribe them from the spec — its draft predates #682.
Derive each line's roster mechanically from the CURRENT registry, in `CONTENT_PASSES` order:
for a render line, the names are the rows matching that line's `(target, slab, phase)` under
today's `frameProgram` + `executeFrame` selection. The sequence, and the phase that picks
each `(hdr, NEAR0)` line's roster:

| #   | kind         | target / source→dest   | slab  | roster comes from                                                   |
| --- | ------------ | ---------------------- | ----- | ------------------------------------------------------------------- |
| 1   | `compute`    | `flow`                 | —     | —                                                                   |
| 2   | `compute`    | `atmosphereSkyView`    | —     | —                                                                   |
| 3   | `capture`    | `sky-cubemap`          | both  | `skyCapture === true`, split by the row slab                        |
| 4   | `render`     | `volume`               | COSMO | `(volume, COSMO)`                                                   |
| 5   | `render`     | `zoa`                  | COSMO | `(zoa, COSMO)`                                                      |
| 6   | `render`     | `hdr`                  | COSMO | `(hdr, COSMO)`                                                      |
| 7   | `render`     | `star-aggregates`      | NEAR0 | `(star-aggregates, NEAR0)`                                          |
| 8   | `render`     | `mw-aggregate`         | NEAR0 | `(mw-aggregate, NEAR0)`                                             |
| 9   | `render`     | `hdr`                  | NEAR0 | phase `pre-lens` (the roster proper)                                |
| 10  | `lens`       | `hdr`                  | body  | `sgr-a-star-lensing`                                                |
| 11  | `render`     | `hdr`                  | NEAR0 | phase `post-lens` (`body-glints`); `slot: 'POST_LENSING'`           |
| 12  | `foreground` | `foreground:0`         | chain | NEAR0 rows / body rows                                              |
| 13  | `composite`  | `foreground:0` → `hdr` | —     | —                                                                   |
| 14  | `render`     | `hdr`                  | NEAR0 | phase `post-foreground` (`orbit-trails`); `slot: 'POST_FOREGROUND'` |
| 15  | `bloom`      | —                      | —     | —                                                                   |
| 16  | `tonemap`    | `hdr` → `swap`         | —     | —                                                                   |
| 17  | `render`     | `swap`                 | COSMO | `(swap, COSMO)`                                                     |
| 18  | `render`     | `swap`                 | NEAR0 | `(swap, NEAR0)`                                                     |

**Expansion rules** (these replace `frameProgram`'s five parameters, `frameProgram.ts:246-320`):

- `capture` → two render steps per requested face, COSMO then NEAR0, face-major; zero faces
  requested ⇒ zero steps (the lens's zero-dispatch guarantee).
- `foreground` → one `depthLoad: 'clear'` render step per `foregroundChain` entry, each
  taking the NEAR0 roster or the body roster according to whether the entry is NEAR0 or a
  body slab index (`isBodySlabIndex`).
- `lens` → one `(hdr, BODY[k])` step per `lensBodySlabs` entry; empty list ⇒ no step.
- `bloom` is dropped when `bloomEnabled` is false; `tonemap` carries the tone curve and
  `composite` carries `tone: null` — that sentinel disappears from the AUTHORED artifact,
  not from `CompositeStep`.
- A name no contributed pass owns is dropped; a render step left with no passes is dropped.
- **The merge rule (spec §5's "Price").** Consecutive render steps sharing `(target, slab)`
  merge into one, concatenating their rosters, when every step between them emitted nothing.
  Out of the lensing band that folds lines 9 and 11 back into today's single step; line 14
  never merges, because the composite between it and line 11 always emits.
- The merged step keeps the FIRST line's timing-slot name. Since line 9 authors no `slot`,
  the merged `(hdr, NEAR0)` step bills the bare group key — byte-identical to today.

- [ ] Write the failing tests first, in `expandFrameOrder.test.ts`:
  - `expands to the same program frameProgram builds, out of the lensing band` — the
    equivalence test. For `(tone, bloomEnabled: true, foregroundChain: [NEAR0, 2, 3],
skyCubemapFacesToCapture: [], lensBodySlabs: [])`, `expandFrameOrder(...)` equals
    `frameProgram(...)` step-for-step, comparing `kind`, `target`, `slab`, `depthLoad`,
    `face`, composite `source`/`dest`/`tone`, and — for each render step — the NAMES of the
    passes the old program would have selected. Read Global Constraints: this is the one
    sanctioned mirror, and Task 9 deletes it.
  - `expands to the same program frameProgram builds, inside the lensing band` — same, with
    `lensBodySlabs: [2]` and `skyCubemapFacesToCapture: [0,1,2,3,4,5]`.
  - `merges the split hdr roster when the lens emits nothing` — the expanded program has
    exactly ONE `(hdr, NEAR0)` step before the foreground chain, and its roster is line 9's
    followed by line 11's, in that order.
  - `drops a render step whose every pass name is absent` — expand with a `passes` list that
    omits `filaments`/`flow`/&c. so the `(zoa, COSMO)` line empties: no step for it, and the
    steps around it are unchanged. This is the omission mechanism (d) depends on.
- [ ] And in `checkFrameOrder.test.ts` (spec §5's three items):
  - `throws naming a contributed pass no FRAME_ORDER line draws` — a pass named
    `'ghost-pass'` in the registry, absent from the order, throws with `'ghost-pass'` in the
    message. This is the check that replaces the third leg the review called unchecked.
  - `throws naming a pass listed on two lines` — duplicate across two render lines throws.
  - `throws when a capture roster names a pass no render line draws` — a capture roster is a
    RE-draw, so its names must also appear among the render lines.
  - `throws naming a step target that is not a declared render-target id` — subsumes
    `targetParity.test.ts` leg 2.
  - No test that the app's own `FRAME_ORDER` passes the check: Task 9 wires the check into
    boot, and `tests/services/engine/frame/frameOrderBoot.test.ts` (one case, added there)
    runs it over the real registry + real target rows.
- [ ] Implement, then read the whole of `frameOrder.ts` back against `passes/index.ts:19-98`
      and `frameProgram.ts`'s header: every ordering rationale in those two headers must have
      landed beside the line it explains (why the Milky Way leads, why `rings` and
      `atmosphere-shell` trail the foreground group, why the multiplicative dust follows the
      cloud's own upsample, why the capture roster spans both slabs). Move it; do not
      re-write it, and do not import a pick-order claim — Task 7 deleted the fact.
- [ ] `npm run typecheck` + `npm test -- frame` green. Commit.

**Reject if:** a roster was transcribed from the spec rather than derived from the registry;
the equivalence test compares fewer fields than listed; `expandFrameOrder` dispatches on
`kind` with a `switch` instead of `EXPAND_STEP`, or reads a pass row's `target` / `slab` /
`skyCapture` / `hdrPhase` for anything but the test's own derivation.

## Task 9 — the executor reads `FRAME_ORDER`

**Files:** `src/services/engine/frame/renderFrame.ts`,
`src/services/engine/frame/executeFrame.ts`, `src/services/engine/frame/frameProgram.ts`,
`src/@types/engine/frame/FrameStep.d.ts`, `src/services/engine/phases/startLoop.ts`
(modify); `tests/services/engine/frame/expandFrameOrder.test.ts` (delete the two
equivalence cases), `tests/services/engine/frame/frameOrderBoot.test.ts` (new);
`tests/services/engine/frame/{executeFrame,frameProgram}*.test.ts` (adapt).

- [ ] `FrameStep`'s render and capture members gain `passes: readonly ContentPass[]` and lose
      `hdrPhases`. `renderFrame` calls `expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {...})`
      where it called `frameProgram(...)`; `frameProgram` itself is deleted, and
      `timedSlotRowsOf` / `timedSlotGroupsOf` / `TIMED_SLOTS` / `TIMED_SLOT_GROUPS` move to
      reading a step's own `passes` (they keep their names and their homes for now).
- [ ] `executeFrame`'s group selection (`:265-283`) becomes the step's own list. The four
      predicates die with it: the `target`/`skyCapture` branch, the
      `slab === step.slab || 'body'` widening, and `matchesHdrPhase`. **The step-level gates
      stay exactly where they are**: `enabled`, the `disabledPasses` membership test, and the
      empty-group skip.
- [ ] `TIMED_SLOTS` / `TIMED_SLOT_GROUPS` expand `FRAME_ORDER` with the MAXIMAL inputs, as
      today (`MAX_FOREGROUND_CHAIN`, all six faces, `MAX_SGR_A_STAR_LENSING_BODY_SLABS`,
      `bloomEnabled: true`, `PLACEHOLDER_TONE`). Keep those constants and their rationale.
- [ ] `startLoop` calls `checkFrameOrder(FRAME_ORDER, CONTENT_PASSES, renderTargetRows().map(r => r.id))`
      once, before the first frame. Add `tests/services/engine/frame/frameOrderBoot.test.ts`
      with one case, `the app's FRAME_ORDER passes the boot check` — it is the repo test spec
      §5's file table calls for, and the one that catches a typo aimed at any Layer's pass.
- [ ] Delete the two equivalence cases from `expandFrameOrder.test.ts` in this commit —
      `frameProgram` no longer exists to mirror. The four behavioural cases stay.
- [ ] `npm run typecheck` + `npm test` green. Commit.

**Reject if:** `executeFrame` still filters `CONTENT_PASSES`; a step-level gate moved or was
"simplified"; the boot check runs per frame; `TIMED_SLOTS` lost a capacity slot.

## Task 10 — the four fields leave the pass row

**Files:** `src/@types/engine/frame/ContentPass.d.ts`,
`src/services/engine/frame/passes/createUpsamplePass.ts`,
`src/@types/engine/frame/UpsamplePassRow.d.ts`, all 37 pass files (field deletions only),
`src/services/engine/frame/passes/index.ts`, `src/services/engine/frame/slabs.ts`,
`src/services/engine/frame/pickProgram.ts`, `src/services/engine/frame/passSlabOf.ts` (new),
`src/services/engine/engine.ts`, `src/services/gpu/renderTargets.ts` (comment only);
`src/@types/engine/frame/HdrPhase.d.ts` (delete);
`tests/services/engine/frame/targetParity.test.ts` (delete),
`tests/services/gpu/renderTargets.test.ts` (gains leg 3), the pass-row test mirrors that
assert a deleted field (find them: `rg -n "\.target|\.slab|skyCapture|hdrPhase" tests/services/engine/frame`).

**Produces:**

```ts
// src/@types/engine/frame/ContentPass.d.ts, after (signatures still take EngineState here;
// Task 11 narrows them)
export type ContentPass = {
  readonly name: string;
  readonly blend: Blend;
  enabled(state: EngineState, ctx: ReadyFrameContext, view: SlabView): boolean;
  draw(
    pass: GPURenderPassEncoder,
    view: SlabView,
    ctx: ReadyFrameContext,
    state: EngineState,
  ): void;
  pickEnabled?(state: EngineState, ctx: ReadyFrameContext, view: SlabView): boolean;
  drawPick?(
    pass: GPURenderPassEncoder,
    view: SlabView,
    ctx: ReadyFrameContext,
    state: EngineState,
  ): void;
};

// src/services/engine/frame/passSlabOf.ts — the pick program's grouping, derived (§5)
export function passSlabOf(order: readonly FrameStepSpec[]): ReadonlyMap<string, number | 'body'>;
```

`blend` stays on the row: one `(target, slab)` group already mixes blends, so it is a
property of the draw, not of the step (spec §4.1).

- [ ] Delete the four fields and their ~45 lines of docblock. The material that survives the
      deletion is the `blend`↔pipeline-profile invariant; the `target`/`slab`/capture/phase
      prose is already in `frameOrder.ts` from Task 8 and must NOT be pasted back.
- [ ] `createUpsamplePass` loses `target: 'hdr'` and `row.slab`; `UpsamplePassRow` loses
      `slab`. Check each of the four callers for a now-unused import.
- [ ] `pickProgram` takes its slab from `passSlabOf(FRAME_ORDER)`, built once. A `foreground`
      line's `bodyPasses` and the `lens` line yield `'body'`, which is the widening it reads
      today. Its `.filter()` still preserves array order; after Task 7 that order carries no
      contract, so do not re-state one.
- [ ] `engine.ts:600`'s toggle-name list stops reading `.target`: the names it wants are the
      passes FRAME_ORDER draws into a target other than `'volume'` — derive it from the order
      in one expression, beside the existing call.
- [ ] `slabs.ts` loses `matchesHdrPhase`; `renderStepTimingSlotName`'s phase arm becomes the
      step's authored `slot` suffix, appended with the same middle dot `groupKeyOf` uses.
      Every slot name stays byte-identical to `main` — `hdr·NEAR0`, `hdr·NEAR0·POST_LENSING`,
      `hdr·NEAR0·POST_FOREGROUND` — which is what keeps Task 14's perf pairing like-for-like
      and the DebugPanel rows stable across the branch.
- [ ] Delete `targetParity.test.ts`. Leg 1 has no `target` left to check and leg 2 is the
      boot check's item 3; move leg 3 (`render-target row ids are unique`) into
      `tests/services/gpu/renderTargets.test.ts` unchanged.
- [ ] Add ONE test, `tests/services/engine/frame/passSlabOf.test.ts`:
      `a foreground line's body passes resolve to the body widening` — `passSlabOf(FRAME_ORDER)`
      maps `'earth'` to `'body'` and `'star-catalog'` to NEAR0. It fails the day a pass moves
      between rosters and picking silently starts testing the wrong slab's depth.
- [ ] `npm run typecheck` + `npm test` green. Commit (one commit for the row fields, one for
      the pick/timing derivations).

**Reject if:** a pass row kept a positional field; `HdrPhase` survived; a timing-slot name
changed; a slot name was derived from a line's ordinal.

## Task 11 — the pass signatures narrow to `PassState`

**Files:** `src/@types/engine/frame/PassState.d.ts` (new);
`src/@types/engine/frame/ContentPass.d.ts`, the 9 pass files that annotate `EngineState`
(13 sites), `src/services/engine/frame/executeFrame.ts`,
`src/services/engine/frame/pickProgram.ts` (modify).

**Produces** (Ruling 4 — the frame-visible cut, which shrinks in (d)/(e)):

```ts
// src/@types/engine/frame/PassState.d.ts
/**
 * What a pass may read. Named for its reader, not for "core": `CoreSettingsState`'s cut is
 * core-versus-Layer, this one is frame-visible. The bags it still names (`gpu`, `data`,
 * `subsystems`, `assetSlots`) leave field by field as each Layer forms (spec §4.5); what it
 * already refuses is the engine's own boot and scheduling state.
 */
export type PassState = Pick<
  EngineState,
  | 'settings'
  | 'tier'
  | 'selection'
  | 'selectionRows'
  | 'famousGalaxiesMeta'
  | 'data'
  | 'gpu'
  | 'subsystems'
  | 'assetSlots'
>;
```

- [ ] The four `ContentPass` methods take `PassState`. Because the rows are
      contextually typed, only the 13 explicit annotations move; do not touch a pass body.
- [ ] `executeFrame` and `pickProgram` keep passing the whole `EngineState` (a `Pick` accepts
      it). If either needed a cast, the Pick is missing a field the passes genuinely read —
      add the field, do not cast.
- [ ] No test. The narrowing is a compile-time fact and `tsc` is its enforcement
      (`testing.md`, first anti-pattern).
- [ ] `npm run typecheck` + `npm test` green. Commit.

**Reject if:** `PassState` includes `booted`, `requests`, `cameraRuntime`,
`skyCubemapCapture` or `picking`; any call site gained a cast; a pass body changed.

## Task 12 — `LAYER_GROUPS.labels` totality

**Files:** `src/data/animation/visibilityLayerRows.ts` (new);
`src/utils/animation/expandVisibilityLayers.ts`, `docs/BACKLOG.md` (modify);
`tests/utils/animation/expandVisibilityLayers.test.ts` (adapt).

Consumes the backlog row `docs/BACKLOG.md:54` — "**`LAYER_GROUPS.labels` totality is
unchecked**". Delete that index line **in this task's commit** (it has no detail file; spec
§11 confirms). Do not strike it through.

**Produces:**

```ts
// src/data/animation/visibilityLayerRows.ts
/**
 * Every visibility key, classified. `satisfies Record<VisibilityLayerKey, …>` is what makes
 * the aggregate total: ANY new key — `…Label`-spelled or not — fails to compile until it
 * declares whether it belongs to an aggregate. A second aggregate is one more field VALUE,
 * not a new type. Declaration order is reveal order.
 */
export const VISIBILITY_LAYER_ROWS = {
  surveyLabel: { aggregate: 'labels' },
  structureLabel: { aggregate: 'labels' },
  milkyWayLabel: { aggregate: 'labels' },
  starCatalogLabel: { aggregate: 'labels' },
  bodyLabel: { aggregate: 'labels' },
  /* the other thirteen keys, each `{}` */
} as const satisfies Record<VisibilityLayerKey, { readonly aggregate?: 'labels' }>;
```

- [ ] All 18 `VisibilityLayerKey` members get a row, the five label ones in today's reveal
      order relative to each other (`expandVisibilityLayers.ts:33-35`) — `LAYER_GROUPS` is now
      a filter, so record order IS aggregate order.
- [ ] `LAYER_GROUPS` becomes that filter, keeping its
      `Record<string, readonly VisibilityLayerKey[]>` shape and its docblock's promise, which
      the compiler now keeps. The `?? [arg]` fallthrough is unchanged.
- [ ] Add no new test unless the existing file lacks it: totality is the compiler's job here
      (a test that re-lists the label keys is a registry restatement). Check whether
      `expandVisibilityLayers(['labels'])` is already covered; if it is not, add the one case
      `the labels aggregate expands to atomic keys only` — no `'labels'` in the output, no
      duplicates. Report which branch you took.
- [ ] **Ruling 8 (this task's):** spec §11 assigns this row to (c) on the grounds that label
      membership will derive from present Layers' `labels()`. That seam does not exist until
      (d)/(e), so the bug class is closed here by classifying in data; when a Layer owns its
      label producers its rows move into it and `LAYER_GROUPS` becomes the concatenation. No
      second authority — `LAYER_GROUPS` reads the rows, it does not restate them.
- [ ] `npm run typecheck` + `npm test -- expandVisibilityLayers` green. Commit, with the
      backlog deletion in the same commit.

**Reject if:** the backlog line was struck through rather than deleted; the aggregate's key
order changed; a key was classified by the spelling of its name rather than by its row; the
new test re-lists the label keys.

## Task 13 — docs

**Files:** `CLAUDE.md`, `docs/RENDERER.md`,
`docs/superpowers/specs/2026-09-09-layer-composition-design.md` (§13 only).

Per spec §15, the part of it this PR earns. Identifier and structure text only — no backlog
strike-throughs, no `file:line` chasing, nothing under `docs/research/**`,
`docs/grill-sessions/**`, `plans/completed/**` or `specs/completed/**` (plan 01, Task 5).

- [ ] `CLAUDE.md`'s "Where to look" tree gains two lines beside `components/`:
      `compositions/  build-time engine compositions (app; reference engines later)` and
      `layers/  per-Layer modules — settings clusters today, whole Layers from PR (d)`.
      Keep each to one line; the tree is a map, not a manual.
- [ ] `docs/RENDERER.md`: the frame-order paragraph. `frameProgram` is gone — the frame is
      `FRAME_ORDER` (authored order + roster) expanded per frame, with the boot check naming
      what a Layer forgot. Say where the file is; do not re-explain the step kinds, they are
      documented beside them.
- [ ] Append the plan-time amendments to the spec's §13 decision log — same four-column
      shape (`#` / Question / Ruling / Folded into), rows `A1`-`A6`, identifier-level text
      only: the post-composite `(hdr, NEAR0)` line (#682); settings fragments keyed by
      CLUSTER, not by Layer; action types stay flat, guarded by
      `assertUniqueFragmentReducerKeys`; `PassState` now, `CoreFrameState` in (d); `tier`
      stays in the store (not a composition field); `dataUrl` deferred to a PR with a reader.
      One row each, no rationale prose — the Rulings section above is where that lives.
- [ ] `npx prettier --write` on all three. Commit.

**Reject if:** a dated record was edited; the tree grew a paragraph; a §13 row carries
rationale instead of a ruling; `add-data-source`'s SKILL.md was rewritten (spec §15 assigns
it to the PR that moves source rows, (d)).

## Task 14 — gate

- [ ] `npm run typecheck` (both projects) — green.
- [ ] `npm test` — green. **Expected delta: +14, or +15 if Task 12 adds its optional case.**
      The arithmetic, to be reconciled against the real numbers: added 19 (T1 ×5, T3 ×2,
      T5 ×1, T8 ×8, T9 ×1, T10 ×1, T12 ×0-1) less the 2 equivalence cases T9 deletes = 17
      surviving; removed 3 (`targetParity`) of which 1 is re-homed to
      `renderTargets.test.ts` = 2 net. 17 − 2 = +15, or +14 without T12's case. Report the
      ACTUAL delta with a reason for every difference — a surprise here means a mirror test
      was adapted where it should have been deleted.
- [ ] `npm run build` — green. Load-bearing: the only check that links WESL, so it proves the
      settings and frame moves disturbed no `package::` specifier or `?static` path.
- [ ] **Paired `npm run perf`, REQUIRED** (spec §9(c)). Start this worktree's dev server and
      read its `Local:` line — in a worktree Vite auto-increments past 5173, and omitting
      `--url` silently measures another branch's server. For each scenario, baseline on
      `main` (a scratch worktree at `62e3ac11c` + its own dev server, alternating A-B-A-B per
      the perf skill) and re-run on the branch with identical flags:

      ```bash
      npm run perf -- --url http://localhost:<port> --scenario <name> --frames 30
      ```

      Scenarios: `full-survey` (the COSMO groups), `milky-way` and `star-field` (the
      `(hdr, NEAR0)` roster — where the step-merge rule lives), `solar-system` (foreground
      chain + `post-foreground`). Quote **MERGED** medians only; per-layer rows carry a
      1–3 ms floor and on Apple Silicon adjacent slots with identical medians are a TBDR
      artefact, never additive. Slot names are unchanged (Task 10), so the two runs compare
      row for row. **A neutral-or-negative delta HALTS the landing** — do not proceed to a PR body that
      claims a win; report the numbers and hand the land/park call to the user. It is their
      ruling, never process momentum.

- [ ] Visual smoke on this worktree's dev server, five poses:
  - `/` — boots at Earth, globe framed as before, InfoCard pinned, selection ring present.
  - `/?cinema` — boots at Earth, focus follows the globe, no ring, no InfoCard.
  - `/#focus=body-jupiter` — the deep link wins over the home seed; Jupiter, its moons, the
    rings pass and the orbit trails all draw (trails in FRONT of the planet, the
    `post-foreground` line's whole point).
  - `/#focus=body-sgr-a-star` at close approach — **the pose that exercises every step
    kind**: the sky-cubemap `capture` steps, the `lens` step, the `post-lens` glints and the
    split-then-merged `(hdr, NEAR0)` roster. Check the lens ring is unwarped over the
    starfield and that leaving the fade band costs nothing (no flash, no reordering).
  - The `full-survey` pose (`tools/perf/perfScenarios.ts:146-149`, where the
    zone-of-avoidance band draws) — **Task 7's gate**, three clicks that no longer inherit
    `@group(0)`: inside the band away from any galaxy selects the Zone of Avoidance (the
    InfoCard names it), a galaxy drawn over the band still wins, a structure ring still
    selects its structure.
- [ ] `git diff main --stat` — expect ~40 new files under `src/layers/**` +
      `src/@types/settings/**`, a net-negative `src/state/settings/`, a net-negative
      `src/services/engine/frame/` once `frameProgram` is gone, and **no** file outside the
      File structure section.

**Reject if:** the perf pairing was skipped, run without `--url`, or quoted from per-layer
rows; a visual pose was attested without being looked at; the PR body claims a result that
was not measured.

---

## Definition of Done

**Deliverable inventory**

- [ ] `src/@types/settings/EngineSettingsState.d.ts` is a derived alias over
      `APP_SETTINGS_FRAGMENTS`; `CoreSettingsState` holds exactly the nine core clusters, and
      `rg -n "galaxyCatalogs|starCatalogs|structures|volumes" src/@types/settings/CoreSettingsState.d.ts`
      is empty.
- [ ] `src/layers/<name>/settings/` exists for all ten Layers and contains the thirteen
      cluster files and nothing else; `src/state/settings/initialState.ts` carries no Layer
      cluster literal.
- [ ] Every settings action type string is byte-identical to `main` (the two container tests
      that dispatch literals pass unedited).
- [ ] `src/@types/engine/layer/Layer.d.ts`, `defineLayer.ts` and
      `src/@types/engine/EngineComposition.d.ts` exist; `createEngine` takes a composition;
      `src/compositions/app.ts` is the only place the app's home is named.
- [ ] No COSMO pick draw depends on an earlier row having bound `@group(0)`:
      `galaxyPickRenderer.bindCamera` is gone and `passes/index.ts` carries no ordering note.
- [ ] `src/services/engine/frame/frameOrder.ts` is the ONE artifact stating both order and
      roster; `frameProgram` is gone; `CONTENT_PASSES` states no order and no target;
      `rg -n "target:|slab:|skyCapture|hdrPhase" src/services/engine/frame/passes/*Pass.ts`
      is empty.
- [ ] The boot check runs once in `startLoop` and throws naming the offending pass or target;
      `tests/…/frameOrderBoot.test.ts` runs it over the real registry.
- [ ] `docs/BACKLOG.md` no longer carries the `LAYER_GROUPS.labels` row, and ANY new
      `VisibilityLayerKey` fails to compile until it joins `VISIBILITY_LAYER_ROWS`.
- [ ] Spec §13 carries the six amendment rows this plan ruled (Task 13).

**Named observable behaviours** (Task 14's smoke)

- [ ] `/` — Earth home, ring + InfoCard, no camera jump on the first follow frame.
- [ ] `/?cinema` — Earth home, no ring, no InfoCard.
- [ ] `/#focus=body-jupiter` — deep link wins; rings and orbit trails draw, trails in front
      of the planet.
- [ ] `/#focus=body-sgr-a-star` — capture, lens, post-lens and post-foreground steps all
      fire; entering and leaving the fade band changes nothing but the lens itself.
- [ ] The GPU-timings DebugPanel lists the same groups in the same order under the same
      names — no row renamed, added or dropped.
- [ ] `full-survey` — a click in the zone-of-avoidance band selects the band; a galaxy over
      it still wins; a structure ring still selects its structure.

**The deferral boundary** — nothing else. No Layer value constructed, no renderer moved, no
source row moved, no subsystem handle re-homed, no reference engine, no `EngineComposition.tier`
field, no `dataUrl` field at all.

## Out of scope (deferred)

- **(d) the `galaxyCatalog` Layer** (spec §10d): the first `Layer` value, `create`/`destroy`
  replacing `GPU_HANDLE_ROWS`, the settings accessor + `CoreSettingsState` narrowing of
  `EngineState.settings`, `EngineData.galaxies`, the three asset slots, the nine source rows
  and `GalaxyCatalogId` re-derived off them, and the galaxies-only reference engine that
  makes `layers: []` stop being empty. It consumes three backlog items; this PR consumes one.
- **(e) one Layer per PR**, and with `starCatalog` the god-layer split (§6.4); with
  `structure` the focus-producer seam (§6.1). `runFrame`'s `state.subsystems.structureFocus`
  read is untouched here.
- **`CoreFrameState`, and the per-Layer half of the cut** — dropping `gpu` / `data` /
  `subsystems` / `assetSlots` as each bag dissolves (§4.5). Task 11 mints `PassState`, the
  cut reachable today; (d) mints `CoreFrameState` when `gpu` leaves the pass contract, and
  each Layer PR shrinks it from there.
- **`EngineComposition.tier`** — not minted; tier is store state (`src/state/tier/`). Spec
  §4.4 amended.
- **`EngineComposition.dataUrl`** — a mirror of `dataBaseUrl()` with no reader in this PR.
  Minted in the PR that has a reader, (g) at the earliest (Ruling 7).
- **`captureSettings`** (`src/state/tour/captureSettings.ts:39-63`) — spec §4.3 says it
  becomes a filter over present Layers ("each Layer declares whether its cluster is
  tour-captured"). That declaration is a Layer field, and there are no Layer values yet; the
  ten-names-spelled-twice roster stays as it is until (d)/(e). Left deliberately.
- **Layer-specific sagas** (`watchFlowReseedSaga`, `watchBiasBakeSaga`, §4.3) — same reason:
  they move with their Layer, not with the fragment.
- **`isEngineReady`** (`src/services/engine/helpers/engineReady.ts:118-140`) — the per-frame
  boot proxy plan 02 handed to (c) "as part of the `CoreFrameState` work" (now `PassState`).
  It gates frames on
  three named renderers; loosening it has no consumer until a composition without them
  exists, and a frame gate changed without one is speculative. It moves with (d).
- **`scaleFadeBands` → `src/data/`** (§6.3) — already user-ruled its own PR, and it blocks
  (e)'s `milkyWay`, not this one.
- **`.claude/skills/add-data-source/SKILL.md`** (§15) — its edit-surface map is superseded by
  the PR that actually moves source rows, (d). `docs/DATA.md`'s stale Edenhofer claim (§15's
  fourth bullet) belongs to (f), the greenfield-Layer PR, for the same reason: the doc is
  wrong about a thing this PR does not touch.
