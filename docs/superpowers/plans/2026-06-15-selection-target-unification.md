# Selection / Target Unification — Implementation Plan (Part 0)

**Feature:** Collapse the `Selection` discriminated union into `FocusableTarget`,
so the engine holds exactly one resolved-target type from pick-decode through the
hover / select / focus slots. Pure refactor, no behaviour change.

**REQUIRED SUB-SKILL:** Execute this plan with `superpowers:subagent-driven-development`
(fresh subagent per task + the spec + quality reviews). Dispatch implementer
subagents `run_in_background: true`; the main thread runs `npm test` / `npm run
typecheck` and commits. Implementers must not run npm.

**Goal:** Delete the second of two parallel unions describing the same entities.
`Selection` (`{kind:'galaxy',source,localIdx} | {kind:'structure',id}`) is a
purely-internal mirror of `FocusableTarget` (`GalaxyInfo | StructureRecord`): the
selection subsystem's callbacks already emit `FocusableTarget`, and every internal
reader of the slots needs only fields the resolved target already carries. After
this plan the slots hold `FocusableTarget | null`, resolution happens once at the
pick / URL edge, and `selectionEq` / `prebuiltInfo` / `selectedTarget()` /
`pickToSelection`'s `Selection` output / the internal lazy lookup are gone.

**Architecture:** Resolution moves from "inside the subsystem, lazily, per slot
read" to "at the boundary, eagerly, once". Two new pure helpers (`resolveGalaxyInfo`,
`resolvePick`) live at the pick edge; the subsystem becomes a dumb three-slot holder
with a `targetEq` dedup. Slot readers (`selectionRingPass`, `produceStructureMarkers`/
`Labels` via `structureIdOf`, `runFrame`'s focus fade, `pointSpritesPass`) read off
the held target via the existing `isStructure` predicate. `PickResult` (the raw GPU
decode) and the URL `FocusTarget` descriptor are out of scope and unchanged.

**Tech stack:** TypeScript, Vitest. One type per file in `src/@types/`, one function
per file in `helpers/`, `type` not `interface`, deep relative imports, typed
`vi.fn<() => void>()`, didactic comments.

> **Sequencing across the braid:** Part 1 (fade/source naming) and Part 2 (MW
> selectable) build on this plan. Land this first, green, before either.

> **Read before starting:** the spec
> `docs/superpowers/specs/2026-06-15-milky-way-first-class-source-design.md`
> (Part 0 in full) and `docs/superpowers/conventions/plan-style.md`. Do not trust
> any line numbers below blindly — read the current file at each seam.

---

## Order rationale (keep the tree green at each commit)

1. Introduce the pure resolvers (`resolveGalaxyInfo`, `targetEq`, `resolvePick`)
   alongside the existing code — additive, nothing consumes them yet.
2. Flip the subsystem to hold `FocusableTarget | null` (slots, setters, getters),
   keeping its public callbacks identical. Update its callers in the same commit
   (they're the only consumers of the changed setter signatures).
3. Flip the boundary (`wireInput`, `clickHandler`, `runFrame` hover, `engine.ts`
   `selectByAlias`/`selectFamous`) to resolve via `resolvePick` and pass targets.
4. Flip the slot readers (`structureIdOf`, ring passes, `pointSpritesPass`,
   `RenderFrameSettings`, `runFrame` focus fade).
5. Delete `Selection.d.ts`, `selectionEq`, `pickToSelection.ts`, `selectedTarget`,
   `prebuiltInfo` — everything now unreferenced.

Each task ends green; commit per task.

---

## Task 1: `resolveGalaxyInfo` pure helper

**Files:**
- `src/services/engine/helpers/resolveGalaxyInfo.ts` (create)
- `tests/services/engine/helpers/resolveGalaxyInfo.test.ts` (create)

**Signature:**
```ts
export function resolveGalaxyInfo(
  cloud: GalaxyCatalog | undefined,
  localIdx: number,
  source: SourceType,
  famousMeta?: readonly FamousMetaEntry[],
): GalaxyInfo | null
```

**Behaviour:** the bounds-checked wrapper currently inline as `galaxyInfoFor`
(`selectionSubsystem.ts:100-105`): `null` when `cloud` is undefined or
`localIdx < 0 || localIdx >= cloud.count`; otherwise `buildGalaxyInfo(cloud,
localIdx, source, famousMeta)`. The guard is the tier-swap-race defence — keep
the docblock explaining it (cite the existing comment at
`selectionSubsystem.ts:87-99`). Pure: no closures, all deps as args.

- [ ] Test `returns null when the cloud is undefined`.
- [ ] Test `returns null for a negative localIdx`.
- [ ] Test `returns null when localIdx >= cloud.count` (the tier-swap race guard).
- [ ] Test `delegates to buildGalaxyInfo for an in-range index` — assert the
      returned `GalaxyInfo.index === localIdx` and `.source === source` against a
      small fixture cloud (reuse the cloud-fixture shape in
      `tests/services/engine/helpers/galaxyInfoBuilder.test.ts`).
- [ ] Implement; wrap `buildGalaxyInfo` (`helpers/galaxyInfoBuilder.ts:126`).
- [ ] `npm test -- resolveGalaxyInfo` green. Commit.

---

## Task 2: `targetEq` pure helper

**Files:**
- `src/services/engine/helpers/targetEq.ts` (create)
- `tests/services/engine/helpers/targetEq.test.ts` (create)

**Signature:** `export function targetEq(a: FocusableTarget | null, b: FocusableTarget | null): boolean`

**Behaviour:** value-equality on identity fields only (replaces `selectionEq` at
`selectionSubsystem.ts:64-75`). Both null → equal; one null → not equal; mixed
kinds (galaxy vs structure) → not equal; two galaxies → equal iff `source` and
`index` match; two structures → equal iff `id` match. Dispatch kinds via the
shared `isStructure` predicate (`services/engine/isStructure.ts`) so the
discriminant lives in one place.

- [ ] Test `both null are equal`.
- [ ] Test `null vs non-null are not equal` (both directions).
- [ ] Test `galaxy vs structure are not equal`.
- [ ] Test `same galaxy (source + index) is equal; differing index is not`.
- [ ] Test `same structure id is equal; differing id is not`.
- [ ] Implement using `isStructure` to branch.
- [ ] `npm test -- targetEq` green. Commit.

---

## Task 3: `resolvePick` pure helper (replaces `pickToSelection` + `resolveTarget`)

**Files:**
- `src/services/engine/helpers/resolvePick.ts` (create)
- `tests/services/engine/helpers/resolvePick.test.ts` (create)

This merges `pickToSelection` (`helpers/pickToSelection.ts`) and the subsystem's
internal `resolveTarget` (`selectionSubsystem.ts:115-118`) into one boundary
resolver that returns the resolved `FocusableTarget`, not a `Selection`.

**Type (one type per file):**
- `src/@types/engine/ResolvePickDeps.d.ts` (create):
```ts
export type ResolvePickDeps = {
  readonly getCloud: (source: SourceType) => GalaxyCatalog | undefined;
  readonly getFamousMeta: () => readonly FamousMetaEntry[];
  readonly structures: PickStructureStore;
};
```
(`PickStructureStore` is the same narrowed store `resolveStructureFromPick` takes —
`@types/engine/data/PickStructureStore.d.ts`.)

**Signature:** `export function resolvePick(pick: PickResult | null, deps: ResolvePickDeps): FocusableTarget | null`

**Behaviour:** dispatch on `SOURCE_REGISTRY[pick.sourceCode].type`:
- `null` pick → `null`.
- `galaxyCatalog` → `resolveGalaxyInfo(deps.getCloud(code), localIdx, code, deps.getFamousMeta())`.
- `structure` → `resolveStructureFromPick(deps.structures, { category: entry.id as StructureId, structureIndex: localIdx })` (keep the cast + its justifying comment from `pickToSelection.ts:32-37`; note: `StructureCategory` is renamed to `StructureId` in Part 1 — leave it `StructureCategory` here, Part 1 sweeps it).
- any other / undefined code → `console.warn` (preserve the message at
  `pickToSelection.ts:40`) and `null`.

- [ ] Test `returns null for a null pick`.
- [ ] Test `maps a galaxy catalog code to its GalaxyInfo` (fixture cloud; assert `.index`/`.source`).
- [ ] Test `returns null for a galaxy code whose cloud is not loaded` (getCloud → undefined).
- [ ] Test `maps a structure code to its StructureRecord` (stub `structures.byCategory`).
- [ ] Test `returns null when a structure hit has no backing record`.
- [ ] Test `warns and returns null for a non-pickable code` (assert the warn fires).
- [ ] Implement.
- [ ] `npm test -- resolvePick` green. Commit.

> Note: do not delete `pickToSelection.ts` yet — its consumers are flipped in
> Tasks 5–6. Deletion is Task 9.

---

## Task 4: Subsystem holds `FocusableTarget | null`

**Files:**
- `src/services/engine/subsystems/selectionSubsystem.ts` (modify)
- `src/@types/engine/subsystems/SelectionSubsystem.d.ts` (modify)
- `tests/services/engine/subsystems/selectionSubsystem.test.ts` (modify)

**Contract change (`SelectionSubsystem.d.ts`):**
```ts
hovered(): FocusableTarget | null;
selected(): FocusableTarget | null;
focused(): FocusableTarget | null;
setHovered(target: FocusableTarget | null): void;
setSelected(target: FocusableTarget | null): void;
setFocused(target: FocusableTarget | null): void;
destroy(): void;
```
- **Drop** `selectedTarget()` (now identical to `selected()`).
- **Drop** the `prebuiltInfo` second arg from `setSelected` / `setFocused`.

**Implementation change (`selectionSubsystem.ts`):**
- Slots become `FocusableTarget | null` (rename `let hovered/selected/focused`
  types).
- Setters: dedup via `targetEq` (Task 2); store the target directly; fire the
  callback with the stored target — no internal resolution. `setSelected`/
  `setFocused` keep their `requestRender()` wake; `setHovered` stays wake-free.
- **Delete** `selectionEq`, `galaxyInfoFor`, `resolveTarget`. The closure no
  longer needs `getCloud`/`getFamousMeta`/`getStructure` for resolution —
  **remove them from `CreateSelectionSubsystemInput`** (`@types/.../CreateSelectionSubsystemInput.d.ts`)
  and from the construction site in `engine.ts` (find via the
  `createSelectionSubsystem({ ... })` call). Keep `cb` and `requestRender`.
- Rewrite the module header: it no longer owns resolution or the `prebuiltInfo`
  escape hatch (the race is now defended by callers passing an already-resolved
  target — say so, cite the spec Part 0 diagnosis).

**Tests (`selectionSubsystem.test.ts`):** the suite currently constructs the
subsystem with cloud/structure stubs and asserts callback *targets*. Rework:
- Setters now take targets directly — build a `GalaxyInfo` / `StructureRecord`
  fixture and pass it in.
- [ ] Keep/rename: `dedupes setHovered — fires onHoverChange only on real transitions`
      (now: pass the same target twice → one fire).
- [ ] Replace `uses prebuiltInfo on setSelected ...` with
      `setSelected fires onSelectChange with the passed target` (no lookup).
- [ ] Delete `fires onHoverChange(null) for an out-of-range galaxy localIdx`
      (the bounds guard moved to `resolveGalaxyInfo` — covered by Task 1).
- [ ] Structure-variant tests: pass a `StructureRecord` directly; assert the
      callback receives the same reference.
- [ ] Delete the whole `selectedTarget` describe block (getter is gone).
- [ ] Cross-kind transition tests: pass galaxy then structure targets; assert one
      fire each.
- [ ] Focus-slot + render-wake + lifecycle blocks: keep, swapping `Selection`
      literals for target fixtures.
- [ ] `npm test -- selectionSubsystem` green, `npm run typecheck`.
- [ ] Commit (this commit also touches the callers in Task 5 — keep them in one
      commit if typecheck demands; otherwise sequence 4→5 tightly).

---

## Task 5: Flip the commit-focus helpers + `engine.ts` entry points

**Files:**
- `src/services/engine/helpers/commitFocus.ts` (modify — likely no change; verify)
- `src/services/engine/helpers/commitGalaxyFocus.ts` (modify)
- `src/services/engine/helpers/commitStructureFocus.ts` (modify)
- `src/services/engine/engine.ts` (modify — `selectFamous`, `selectByAlias`)
- `tests/services/engine/helpers/commitGalaxyFocus.test.ts` (modify)
- `tests/services/engine/helpers/commitStructureFocus.test.ts` (modify)
- `tests/services/engine/helpers/commitFocus.test.ts` (verify)

**`commitGalaxyFocus`** (`commitGalaxyFocus.ts:40-50`): currently builds a
`{ kind:'galaxy', source, localIdx }` Selection and forwards `info` as the
prebuilt arg to both setters. New body: `setSelected(info)` then `setFocused(info)`
then `tweenToGalaxy(state, info)` — `info` *is* the target now. Drop the prebuilt
forwarding and the Selection literal; update the docblock (no more escape hatch —
the target is already resolved, which is the whole race defence).

**`commitStructureFocus`** (`commitStructureFocus.ts:21-27`): currently builds
`{ kind:'structure', id }` for both setters. New body: `setSelected(structure)`
then `setFocused(structure)` then `tweenToStructure(state, structure)`.

**`commitFocus`** (`commitFocus.ts`): already dispatches on `isStructure(target)`
and delegates — likely unchanged. Verify it still typechecks.

**`engine.ts` `selectFamous`** (`engine.ts:779-798`) and **`selectByAlias`**
(`engine.ts:806-824`): both already build a `GalaxyInfo info` via `buildGalaxyInfo`
and call `commitGalaxyFocus(state, info)` — no change to their bodies expected
beyond confirming the new `commitGalaxyFocus` signature still takes `GalaxyInfo`.
Verify and leave as-is.

- [ ] Update `commitGalaxyFocus.test.ts`: assert `setSelected`/`setFocused` are
      called with the `info` object (not a Selection literal, no second arg).
- [ ] Update `commitStructureFocus.test.ts`: assert setters called with the
      `StructureRecord` (not `{kind:'structure',id}`).
- [ ] `npm test -- commitGalaxyFocus commitStructureFocus commitFocus` green.
- [ ] `npm run typecheck`. Commit.

---

## Task 6: Flip the pick boundary — `clickHandler`, `wireInput`, `runFrame` hover

**Files:**
- `src/services/engine/interaction/clickHandler.ts` (modify)
- `src/@types/engine/ClickResolver.d.ts` (modify — return type)
- `src/@types/engine/CreateClickResolverInput.d.ts` (verify — needs cloud/famousMeta accessors now)
- `src/services/engine/phases/wireInput.ts` (modify)
- `src/services/engine/frame/runFrame.ts` (modify — hover `.then`)
- `tests/services/engine/interaction/clickHandler.test.ts` (modify)
- `tests/services/engine/phases/wireInput.test.ts` + `wireInput.structure.test.ts` (modify)

**`clickHandler` `resolveClick`** (`clickHandler.ts:48-66`): change the return type
to `Promise<FocusableTarget | null>` and replace `pickToSelection(pick, structures)`
with `resolvePick(pick, deps)`. The resolver now needs the cloud + famousMeta
accessors in addition to `structures` — extend `CreateClickResolverInput` and the
`wireInput` construction site (`wireInput.ts:77-82`) to pass
`getCloud: (s) => state.data.galaxies.catalogs.get(s)` and
`getFamousMeta: () => state.data.galaxies.famousMeta`. Rewrite the docblock (it
describes the thin pick→Selection contract and the `selectedTarget()` dblclick
hand-off — both gone).

**`wireInput`**:
- `onClick` `.then((sel) => setSelected(sel))` (`wireInput.ts:244-250`) — `sel` is
  now a `FocusableTarget | null`; the body is unchanged but rename the binding to
  `target` and update the comment.
- `onDoubleClick` (`wireInput.ts:252-268`): replace `selectedTarget()` with
  `selected()` (now the resolved target). Body otherwise unchanged.

**`runFrame` hover** (`runFrame.ts:435-449`): replace
`setHovered(pickToSelection(pick, state.data.structures))` with
`setHovered(resolvePick(pick, deps))`, building the `ResolvePickDeps` from
`state` (cloud + famousMeta + structures). Update the import (drop `pickToSelection`).
Keep the no-wake comment.

- [ ] `clickHandler.test.ts`: assert `resolveClick` resolves to a `GalaxyInfo` /
      `StructureRecord` / `null` (was a Selection). Stub the new accessors.
- [ ] `wireInput.test.ts` / `wireInput.structure.test.ts`: update click/dblclick
      assertions to expect resolved targets passed to the setters; dblclick reads
      `selected()`.
- [ ] `npm test -- clickHandler wireInput` green. `npm run typecheck`. Commit.

---

## Task 7: Flip `structureIdOf` + structure producers + `runFrame` focus fade

**Files:**
- `src/services/engine/helpers/structureIdOf.ts` (modify)
- `tests/services/engine/helpers/structureIdOf.test.ts` (modify)
- `src/services/engine/presentation/produceStructureMarkers.ts` (verify — call sites)
- `src/services/engine/presentation/produceStructureLabels.ts` (verify — call sites)
- `src/services/engine/frame/runFrame.ts` (modify — focus-fade resolution)

**`structureIdOf`** (`structureIdOf.ts:10-12`): change the param from
`Selection | null` to `FocusableTarget | null`; body becomes
`target !== null && isStructure(target) ? target.id : null` (use `isStructure`).
Update the docblock.

**Producers** (`produceStructureMarkers.ts:53-54`, `produceStructureLabels.ts:98`):
they call `structureIdOf(selection.selected())` / `.focused()` — now passing a
`FocusableTarget | null`. No call-site change beyond typecheck; verify.

**`runFrame` focus fade** (`runFrame.ts:195-200`): currently
`const focusSel = selection.focused(); const focusedStructure = focusSel?.kind ===
'structure' ? byId(focusSel.id) : null`. Replace with the held target directly:
`const focused = selection.focused(); const focusedStructure = focused !== null &&
isStructure(focused) ? focused : null;` — `focused` *is* a `StructureRecord` when
it's a structure, so `byId` lookup is no longer needed (the slot holds the resolved
record). Update the comment.

- [ ] `structureIdOf.test.ts`: pass a `GalaxyInfo` → null; a `StructureRecord` →
      its id; null → null.
- [ ] `npm test -- structureIdOf` + run the marker/label producer tests if any.
- [ ] `npm run typecheck`. Commit.

---

## Task 8: Flip the ring passes + `pointSpritesPass` + `RenderFrameSettings.selected`

**Files:**
- `src/services/engine/frame/passes/selectionRingPass.ts` (modify)
- `src/services/engine/frame/passes/diskRadiusRingPass.ts` (modify)
- `src/services/engine/frame/passes/pointSpritesPass.ts` (modify)
- `src/@types/engine/frame/RenderFrameSettings.d.ts` (modify — `selected` type)
- `src/services/engine/frame/runFrame.ts` (verify — `settings.selected` source)
- `tests/services/engine/frame/passes/selectionRingPass.test.ts` (modify)

**`selectionRingPass`** (`selectionRingPass.ts`): `selected()` now returns a
`FocusableTarget | null`.
- `enabled()`: return `sel !== null && !isStructure(sel)` (galaxy targets drive
  the halo; structures render through the marker pass).
- `draw()`: narrow with `isStructure`. **Read `worldPos` and `diameterKpc` off the
  `GalaxyInfo`** (`sel.x/y/z`, `sel.diameterKpc`) instead of re-indexing the
  catalog by `localIdx`. This drops the `catalogs.get(sel.source)` lookup and its
  tier-swap-race guard (the target is already resolved + bounds-checked at pick
  time). Keep the `RING_SIZE_SCALE` / apparent-radius math; it only needs
  `worldPos` + `diameterKpc`, both on `GalaxyInfo`. Update the docblock.

**`diskRadiusRingPass`** (`diskRadiusRingPass.ts`): **does NOT fully convert.**
This debug pass needs `axisRatio`, `positionAngleDeg`, and (for famous rows)
`famousMeta[i].calibration` — none of which `GalaxyInfo` carries at top level
(`orientation` is nested; calibration is absent). It MUST keep re-indexing the
catalog. But `selected()`'s shape changed, so update the gate + narrow:
- `enabled()`: `sel !== null && !isStructure(sel)`.
- `draw()`: narrow with `isStructure`, then use `sel.source` + `sel.index` (off
  `GalaxyInfo`) to re-index `catalogs.get(sel.source)` exactly as today (the
  `localIdx` is now `sel.index`). Keep the defensive `if (!catalog) return`.
  Add a comment noting why this pass still re-indexes (tilt/calibration fields not
  on `GalaxyInfo`).

**`pointSpritesPass`** (`pointSpritesPass.ts:67-70`): `settings.selected` is now a
`FocusableTarget | null`. Replace the `.kind === 'galaxy'` branch with
`settings.selected !== null && !isStructure(settings.selected) ?
packSelection(settings.selected.source, settings.selected.index) :
SELECTION_NONE_SENTINEL` (note `.index`, not `.localIdx`). Import `isStructure`.

**`RenderFrameSettings.d.ts`** (`:26`): change `selected: Selection | null` →
`selected: FocusableTarget | null`; update the docblock (drop the Selection
reference). `runFrame.ts:285` feeds `selected: selection.selected()` — now the
right type, verify no change needed.

- [ ] `selectionRingPass.test.ts`: feed a `GalaxyInfo` fixture as the selection;
      assert `setSelection` receives `worldPos` from the info's `x/y/z` and the
      ring radius derived from `diameterKpc`. Assert `enabled()` false for a
      `StructureRecord` and for null.
- [ ] `npm test -- selectionRingPass passes pointSprites` (whichever exist) green.
- [ ] `npm run typecheck`. Commit.

---

## Task 9: Delete the dead surfaces

**Files (delete):**
- `src/@types/engine/subsystems/Selection.d.ts`
- `src/services/engine/helpers/pickToSelection.ts`
- `tests/services/engine/helpers/pickToSelection.test.ts`

**Files (verify clean):** grep the tree for `Selection`, `selectionEq`,
`prebuiltInfo`, `selectedTarget`, `pickToSelection`, `GalaxySelection`,
`StructureSelection`, `resolveTarget`, `galaxyInfoFor` — every remaining hit must
be in a comment that should also be cleaned, or gone. Check the JSDoc references
flagged in the spec/grep: `PickRenderer.d.ts`, `PickResult.d.ts`,
`BootstrapDeps.d.ts:45`, `EngineSelectionHandle.d.ts`, `selectionEncoding.ts:77`,
`tweenToGalaxy.ts`, `CommandPalette.tsx` — update prose that names the deleted
symbols (do not leave stale references).

- [ ] Delete the three files.
- [ ] `npm test` (full suite) green.
- [ ] `npm run typecheck` clean (both tsconfigs).
- [ ] Grep confirms no source/test references to the deleted symbols remain
      (comment-only references updated).
- [ ] Commit.

---

## Definition of Done

- [ ] `npm test` — full suite green (was green before; net deletion of the
      `selectionEq` / `prebuiltInfo` / `selectedTarget` cases, plus new
      `resolveGalaxyInfo` / `resolvePick` / `targetEq` coverage).
- [ ] `npm run typecheck` — clean across `src` and `tools` tsconfigs.
- [ ] `Selection.d.ts`, `selectionEq`, `prebuiltInfo`, `selectedTarget()`,
      `pickToSelection.ts`, the subsystem's internal `resolveTarget` /
      `galaxyInfoFor` are all gone.
- [ ] The three selection slots hold `FocusableTarget | null`; setters take a
      resolved target; resolution happens once at the pick / URL boundary via
      `resolvePick` / `resolveGalaxyInfo`.
- [ ] `CreateSelectionSubsystemInput` no longer carries `getCloud` /
      `getFamousMeta` / `getStructure` (resolution left the subsystem).
- [ ] No behaviour change: hover / single-click select / double-click focus /
      Esc-dismiss / cluster-focus fade / deep-link `selectByAlias` race all
      behave exactly as before (the race is now defended by callers passing an
      already-resolved target, not the `prebuiltInfo` escape hatch).
- [ ] No new TODOs; comments that named deleted symbols updated, not left stale.
