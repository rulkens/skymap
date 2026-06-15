# Selection / Target Unification — Implementation Plan (Part 0)

**Feature:** Collapse the `Selection` discriminated union into a **properly tagged**
`FocusableTarget` union, dispatched by **table lookup** rather than an `isStructure`
sniff. The engine holds exactly one resolved-target type from pick-decode through the
hover / select / focus slots; every N-way "what kind of target is this" split becomes
a `Record<FocusableTargetType, …>` table. Pure refactor, no behaviour change.

**REQUIRED SUB-SKILL:** Execute this plan with `superpowers:subagent-driven-development`
(fresh subagent per task + the spec + quality reviews). Dispatch implementer
subagents `run_in_background: true`; the main thread runs `npm test` / `npm run
typecheck` and commits. Implementers must not run npm. Subagents run bash
sequentially and use Read/Grep tools (no sed/awk/grep via Bash).

**Goal:** Delete the second of two parallel unions describing the same entities, and
retire the structural `isStructure` sniff (`'category' in target`). `Selection`
(`{kind:'galaxy',source,localIdx} | {kind:'structure',id}`) is a purely-internal
mirror of `FocusableTarget` (`GalaxyInfo | StructureRecord`): the selection
subsystem's callbacks already emit `FocusableTarget`, and every internal reader of
the slots needs only fields the resolved target already carries. After this plan:

- The slots hold `FocusableTarget | null`; resolution happens once at the pick / URL
  edge via two new pure helpers (`resolveGalaxyInfo`, `resolvePick`).
- `FocusableTarget` is a **tagged union** on a `type` discriminant mirroring the
  `SOURCE_REGISTRY` `type` (`'galaxyCatalog'` / `'structure'`; `'milkyWay'` lands in
  Part 2). Genuine N-way dispatch (InfoCard detail card, URL hash, commit-focus) goes
  through `Record<FocusableTargetType, …>` tables; simple guards narrow on
  `target.type === 'structure'` with no `as` cast.
- `StructureRecord` is renamed `StructureInfo` repo-wide (its `@types` file plus a
  54-file mechanical sweep) — full parallel naming for the union arms
  (`GalaxyInfo | StructureInfo | MilkyWayInfo`).
- `selectionEq` / `prebuiltInfo` / `selectedTarget()` / `pickToSelection`'s
  `Selection` output / the internal lazy lookup / the structural `isStructure` sniff
  are all gone.

**Architecture:** Resolution moves from "inside the subsystem, lazily, per slot
read" to "at the boundary, eagerly, once". Dispatch moves from a centralised
`isStructure` predicate to a `type` tag + per-concern tables (simplicity.md #7 — the
N-way tag+table form). This is what makes Part 2's Milky-Way arm a one-row add per
table instead of a predicate-chain edit (no `Selection` variant, no `isMilkyWay`
predicate, no `as`-cast audit). `PickResult` (the raw GPU decode) and the URL
`FocusTarget` descriptor are out of scope and unchanged.

**Tech stack:** TypeScript, Vitest. One type per file in `src/@types/`, one function
per file in `helpers/`, `type` not `interface`, deep relative imports, typed
`vi.fn<() => void>()`, didactic comments, `Vec2`/`Vec3` aliases.

> **Sequencing across the braid:** Part 1 (fade/source naming) and Part 2 (MW
> selectable) build on this plan. Land this first, green, before either.

> **Read before starting:** the spec
> `docs/superpowers/specs/2026-06-15-milky-way-first-class-source-design.md`
> (Part 0 in full), `docs/superpowers/conventions/plan-style.md`, and
> `docs/superpowers/conventions/simplicity.md` Principle #7 (the tag + table-dispatch
> pattern). Do not trust any line numbers below blindly — read the current file at
> each seam. Tick each `- [ ]` inline as you complete it, in the same response as the
> TaskUpdate.

---

## Order rationale (keep the tree green at each commit)

The hazard is that the `type` tag and the `StructureRecord → StructureInfo` rename
both touch wide surfaces. Sequence so each commit typechecks:

1. **Tag first, name second.** Add the `type` discriminant to `GalaxyInfo` +
   `StructureRecord` and define `FocusableTargetType` (Task 1). `isStructure` still
   works (it sniffs `'category'`, untouched), so nothing else moves yet. Then do the
   `StructureRecord → StructureInfo` rename as its own mechanical sweep (Task 2) — a
   pure rename, no behaviour change, easy to review in isolation.
2. **Tables before resolvers.** Convert the three `isStructure` ternaries to `type`
   tables (Task 3) while `isStructure`/`Selection` still exist — additive, the slots
   still hold `FocusableTarget` (they always did).
3. **Introduce the pure resolvers** (`resolveGalaxyInfo`, `targetEq`, `resolvePick`)
   alongside existing code (Tasks 4–6) — additive, nothing consumes them yet.
4. **Flip the subsystem** to hold `FocusableTarget | null` directly with `targetEq`
   dedup, drop `prebuiltInfo`/`selectedTarget` (Task 7); update its callers.
5. **Flip the boundary** (`clickHandler`, `wireInput`, `runFrame` hover,
   `selectByAlias`) to resolve via `resolvePick` and pass targets (Task 8).
6. **Flip the slot readers** via `type` narrowing (`structureIdOf`, ring passes,
   `pointSpritesPass`, `RenderFrameSettings`, `runFrame` focus fade) (Task 9).
7. **Delete the dead surfaces** — `Selection`, `selectionEq`, `pickToSelection`, the
   structural `isStructure` sniff (Task 10).

Each task ends green; commit per task.

---

## Task 1: Tag `GalaxyInfo` + `StructureRecord`; define `FocusableTargetType`

Add the discriminant that turns `FocusableTarget` into a tagged union, mirroring each
arm's `SOURCE_REGISTRY` `type`. `isStructure` keeps working unchanged (it still
sniffs `'category'`) — this task is purely additive.

**Files:**
- `src/@types/engine/FocusableTargetType.d.ts` (create — one type per file)
- `src/@types/engine/GalaxyInfo.d.ts` (modify — add `type` field)
- `src/@types/data/structure/StructureRecord.d.ts` (modify — add `type` to `StructureBase`)
- `src/@types/engine/FocusableTarget.d.ts` (modify — docblock: now tagged)
- `src/services/engine/helpers/galaxyInfoBuilder.ts` (modify — set `type: 'galaxyCatalog'`)
- `src/services/engine/wiring/structureCatalogToStructures.ts` (modify — set `type: 'structure'`)
- `src/services/engine/data/createStructureStore.ts` (verify — passes records through; no construction)
- `src/data/structure/buildStaticAnchorStructures.ts` (modify — set `type: 'structure'`)
- `src/services/loading/slots/structureCatalogSlot.ts` (verify — does it construct? it converts via `structureCatalogToStructures`; verify no second literal)
- test files + fixtures that build `GalaxyInfo` / structure literals (find via grep; see below)

**Type (`FocusableTargetType.d.ts`):**
```ts
// Mirrors the SOURCE_REGISTRY `type` for the focusable arms.  The 'milkyWay'
// arm is added in Part 2; keep the union small until then.
export type FocusableTargetType = 'galaxyCatalog' | 'structure';
```

**`GalaxyInfo`:** add at the top of the type, before `index`:
```ts
/** Union discriminant — mirrors SOURCE_REGISTRY's 'galaxyCatalog' type. */
readonly type: 'galaxyCatalog';
```

**`StructureRecord`:** add to `StructureBase` (so all four arms carry it):
```ts
/** Union discriminant — mirrors SOURCE_REGISTRY's 'structure' type. */
readonly type: 'structure';
```
Keep the existing per-arm `category` field — `type` is the focusable-union tag;
`category` is the structure sub-kind (`cluster`/`supercluster`/`void`/`group`), the
parallel of `GalaxyCatalogId`. Update the `StructureBase` docblock to name both axes.

**`FocusableTarget` docblock:** rewrite — it is now a **tagged** discriminated union
on `type: FocusableTargetType`; dispatch is a table lookup, not `isStructure`. Note
the `isStructure` predicate is being retired in this plan (cite Task 10).

**Set the tag at construction:**
- `galaxyInfoBuilder.ts:433` return literal — add `type: 'galaxyCatalog'`.
- `structureCatalogToStructures.ts` `out.push(...)` literals (cluster + supercluster
  arms, ~`:120`/`:127`) — add `type: 'structure'` to the `common` object so both
  arms inherit it.
- `buildStaticAnchorStructures.ts` `buildAnchorStructure` `common` (~`:97`) — add
  `type: 'structure'`.

**Tests:**
- [x] In `tests/@types/engine/data/structureRecord.types.test.ts` (or the nearest
      type test), add a compile-time assertion that `StructureInfo['type']` is
      `'structure'` and `GalaxyInfo['type']` is `'galaxyCatalog'` (a `satisfies` /
      assignment check). (File renamed in Task 2 — leave it where it is now.)
- [x] Grep the test tree for fixture builders of `GalaxyInfo` and structure literals
      (`tests/.../galaxyInfoBuilder.test.ts`, `buildStaticAnchorStructures.test.ts`,
      `structureCatalogToStructures` test, `createStructureStore.test.ts`, any
      `as GalaxyInfo` / `as StructureRecord` fixtures) and add the `type` field so
      they typecheck. Assert one existing test still asserts `.source` / `.category`
      to prove no behaviour change.
- [x] `npm run typecheck` clean (the new required field surfaces every construction
      site at compile time — that's the point). `npm test` green. Commit.

---

## Task 2: Rename `StructureRecord` → `StructureInfo` (mechanical sweep)

Pure rename — the type's identity and shape are unchanged. ~54 files reference the
name (grep `StructureRecord`). It is the structure store's element type and the
non-galaxy `FocusableTarget` arm; renaming it gives the parallel triple
`GalaxyInfo / StructureInfo / MilkyWayInfo`.

**Files:**
- `src/@types/data/structure/StructureRecord.d.ts` → **rename file** to `StructureInfo.d.ts`
- every importer + every type-reference (grep `StructureRecord` across `src/` + `tests/`)

**Docblock (on the renamed type):** note it is the **resolved structure target**
(parallel to `GalaxyInfo` / `MilkyWayInfo`), stored as the structure-store element.
The provenance difference (galaxy info derived on-demand; structure info stored) is
an implementation detail, not what they are as targets.

- [x] Rename the file and the exported type symbol to `StructureInfo`.
- [x] Sweep all references: imports (`import type { StructureRecord }`), type
      annotations, generic args (`Map<…, readonly StructureRecord[]>`), JSDoc prose.
      The test file `tests/@types/engine/data/structureRecord.types.test.ts` renames
      its references too (rename the test file to `structureInfo.types.test.ts` for
      consistency with the symbol). Watch `RecordRaw`-style local names — only the
      `StructureRecord` type, not unrelated `Record<…>`.
- [x] Grep confirms zero `StructureRecord` hits remain anywhere in `src/` or `tests/`.
- [x] `npm run typecheck` clean. `npm test` full suite green. Commit.

> From here on the plan uses `StructureInfo`.

---

## Task 3: Replace the three `isStructure` ternaries with `type` tables

Convert the genuine N-way dispatches to `Record<FocusableTargetType, …>` tables keyed
on `target.type`. `isStructure` and `Selection` still exist (deleted in Task 10);
this task only changes the three dispatch *shapes*.

### 3a. `DETAIL_CARD` table for InfoCard

**Files:**
- `src/components/InfoCard/detailCardTable.ts` (create — table home)
- `src/components/InfoCard/InfoCard.tsx` (modify)
- `tests/components/InfoCard/detailCardTable.test.tsx` (create)
- `tests/components/InfoCard/InfoCard.structureHover.test.ts` (verify/update)

`InfoCard.tsx` currently sniffs `isStructure(selected)` four times (`:77-80`) to split
`selected`/`hovered` into galaxy/structure sub-slots, with two `as GalaxyInfo` casts.
The compact/hover variants are `CompactCard` (galaxy) / `CompactStructureCard`
(structure), the detail variants `GalaxyDetailCard` / `StructureDetailCard`.

**Table (`detailCardTable.ts`):** the cleanest home is a small module mapping each
`FocusableTargetType` to its detail + compact renderers, so a new arm is one row.
Pin the contract — the implementer decides the exact component-prop plumbing, but the
shape is:
```ts
export type DetailCardEntry = {
  readonly Detail: (props: { target: FocusableTarget; pinned: boolean; /* …card props */ }) => ReactNode;
  readonly Compact: (props: { target: FocusableTarget }) => ReactNode;
};
export const DETAIL_CARD: Record<FocusableTargetType, DetailCardEntry>;
```
Each entry's `Detail`/`Compact` narrows its `target` to the concrete arm via
`target.type` (type-safe — **no `as` cast**) and delegates to the existing
`GalaxyDetailCard` / `StructureDetailCard` / `CompactCard` / `CompactStructureCard`.
The `selectedMemberCount` / `onFocus` / `onClose` props ride through the structure
`Detail` entry only (galaxy detail ignores member count, as today).

`InfoCard.tsx` keeps its outer-wrapper-stable contract (the `<details>` remount bug —
cite the module header) and its hover-vs-pinned stacking logic, but replaces the four
`isStructure` lines + casts with `DETAIL_CARD[target.type]` lookups. The structure
-wins-over-galaxy-hover tiebreak (`:86-88`) stays, expressed via `type` comparison.

- [ ] `detailCardTable.test.tsx`: assert `DETAIL_CARD['galaxyCatalog'].Detail`
      renders galaxy chrome (a galaxy-only field) for a `GalaxyInfo` fixture, and
      `DETAIL_CARD['structure'].Detail` renders the structure name + member-count row
      for a `StructureInfo` fixture. One test per type, both `Detail` and `Compact`.
- [ ] Update `InfoCard.structureHover.test.ts` to the table-driven structure;
      assertions (structure hover wins, same-structure-pinned suppression) unchanged.
- [ ] `npm test -- InfoCard detailCardTable` green. `npm run typecheck`. Commit.

### 3b. `URL_HASH_FOR` table for `useUrlSync`

**Files:**
- `src/hooks/urlHashFor.ts` (create — table; one symbol per file, table-as-symbol)
- `src/hooks/useUrlSync.ts` (modify — `computeDesiredHash`)
- `tests/hooks/urlHashFor.test.ts` (create)
- `tests/hooks/useUrlSync.test.ts` (verify/update)

`computeDesiredHash` (`useUrlSync.ts:104-118`) branches `isStructure(focused)` →
`focus=${focused.id}` vs galaxy → `selectionToFocusId(focused)`.

**Table (`urlHashFor.ts`):**
```ts
export const URL_HASH_FOR: Record<FocusableTargetType, (t: FocusableTarget) => string | null>;
```
- `galaxyCatalog` → `selectionToFocusId(t)` (narrowed to `GalaxyInfo`; may be null).
- `structure` → `t.id` (narrowed to `StructureInfo`).
`computeDesiredHash` becomes `URL_HASH_FOR[focused.type](focused)` → wrap as
`focus=${id}` when non-null. No `isStructure`.

- [ ] `urlHashFor.test.ts`: galaxy entry returns the `selectionToFocusId` value (and
      null for a non-encodable galaxy, e.g. Synthetic); structure entry returns the id.
- [ ] `useUrlSync.test.ts`: existing `computeDesiredHash` cases (galaxy id / structure
      id / null / non-encodable) stay green against the table-driven body.
- [ ] `npm test -- useUrlSync urlHashFor` green. `npm run typecheck`. Commit.

### 3c. `COMMIT_FOCUS` table for `commitFocus`

**Files:**
- `src/services/engine/helpers/commitFocusTable.ts` (create — table)
- `src/services/engine/helpers/commitFocus.ts` (modify)
- `src/services/engine/helpers/commitGalaxyFocus.ts` (verify — signature unchanged this task)
- `src/services/engine/helpers/commitStructureFocus.ts` (verify)
- `tests/services/engine/helpers/commitFocus.test.ts` (modify)

`commitFocus.ts:15-21` branches `isStructure(target)` → `commitStructureFocus` vs
`commitGalaxyFocus`.

**Table (`commitFocusTable.ts`):**
```ts
export const COMMIT_FOCUS: Record<
  FocusableTargetType,
  (state: EngineState, target: FocusableTarget) => void
>;
```
- `galaxyCatalog` → `(state, t) => commitGalaxyFocus(state, t as GalaxyInfo)` —
  prefer narrowing via a thin wrapper that re-checks `t.type` rather than a cast; the
  implementer picks the cast-free form (a per-entry wrapper typed to the concrete arm).
- `structure` → `commitStructureFocus`.
`commitFocus` becomes `COMMIT_FOCUS[target.type](state, target)`; drop the
`isStructure` import + branch. Update the docblock (table dispatch, not predicate).

- [ ] `commitFocus.test.ts`: assert a `GalaxyInfo` routes to the galaxy commit path
      (spy on the selection setters / tween) and a `StructureInfo` to the structure
      path. Was `isStructure`-keyed; now table-keyed — assertions unchanged.
- [ ] `npm test -- commitFocus` green. `npm run typecheck`. Commit.

> The remaining `isStructure` call sites (`useStructureMemberCount`, `runFrame`
> focus-fade, `structureIdOf`, ring `enabled()`) are simple guards, not N-way
> dispatch — they convert to `target.type === 'structure'` narrowing in Tasks 9 (and
> 3d below for the member-count hook, which is unrelated to the slot flip).

### 3d. Narrow `useStructureMemberCount` on `type`

**Files:**
- `src/hooks/useStructureMemberCount.ts` (modify)
- `tests/hooks/structureMemberCount` test (verify)

`useStructureMemberCount` (`:select === null || !isStructure(selected)`) → replace
with `selected === null || selected.type !== 'structure'`. `selected` then narrows to
`StructureInfo` for the `structureMemberCount(selected, …)` call with no `as`.

- [ ] Existing member-count tests stay green (galaxy selection → null; structure →
      count). `npm run typecheck`. Commit (may fold into 3c's commit if tightly coupled).

---

## Task 4: `resolveGalaxyInfo` pure helper

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
(`selectionSubsystem.ts` — read the current `galaxyInfoFor` + its guard comment):
`null` when `cloud` is undefined or `localIdx < 0 || localIdx >= cloud.count`;
otherwise `buildGalaxyInfo(cloud, localIdx, source, famousMeta)`. The guard is the
tier-swap-race defence — keep the docblock explaining it (cite the existing comment).
Pure: no closures, all deps as args.

- [ ] Test `returns null when the cloud is undefined`.
- [ ] Test `returns null for a negative localIdx`.
- [ ] Test `returns null when localIdx >= cloud.count` (the tier-swap race guard).
- [ ] Test `delegates to buildGalaxyInfo for an in-range index` — assert the returned
      `GalaxyInfo.index === localIdx`, `.source === source`, `.type === 'galaxyCatalog'`
      against a small fixture cloud (reuse the cloud-fixture shape in
      `tests/services/engine/helpers/galaxyInfoBuilder.test.ts`).
- [ ] Implement; wrap `buildGalaxyInfo` (`galaxyInfoBuilder.ts:126`).
- [ ] `npm test -- resolveGalaxyInfo` green. Commit.

---

## Task 5: `targetEq` pure helper (keyed on `type`)

**Files:**
- `src/services/engine/helpers/targetEq.ts` (create)
- `tests/services/engine/helpers/targetEq.test.ts` (create)

**Signature:** `export function targetEq(a: FocusableTarget | null, b: FocusableTarget | null): boolean`

**Behaviour:** value-equality on identity fields only (replaces `selectionEq` — read
the current `selectionEq` body in `selectionSubsystem.ts`). Both null → equal; one
null → not equal; **different `type` → not equal**; same `type` → compare identity
fields: galaxy (`type === 'galaxyCatalog'`) → `source` + `index`; structure
(`type === 'structure'`) → `id`. Dispatch on `a.type` after the null + equal-type
guard (type-safe narrowing, no `as`).

- [ ] Test `both null are equal`.
- [ ] Test `null vs non-null are not equal` (both directions).
- [ ] Test `galaxy vs structure are not equal`.
- [ ] Test `same galaxy (source + index) is equal; differing index is not`.
- [ ] Test `same structure id is equal; differing id is not`.
- [ ] Implement by narrowing on `type`.
- [ ] `npm test -- targetEq` green. Commit.

---

## Task 6: `resolvePick` pure helper (replaces `pickToSelection` + `resolveTarget`)

**Files:**
- `src/@types/engine/ResolvePickDeps.d.ts` (create — one type per file)
- `src/services/engine/helpers/resolvePick.ts` (create)
- `tests/services/engine/helpers/resolvePick.test.ts` (create)

Merges `pickToSelection` (`helpers/pickToSelection.ts`) and the subsystem's internal
`resolveTarget` into one boundary resolver returning the resolved `FocusableTarget`,
not a `Selection`.

**Type (`ResolvePickDeps.d.ts`):**
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
- `structure` → `resolveStructureFromPick(deps.structures, { category: entry.id as StructureId, structureIndex: localIdx })`
  (keep the cast + its justifying comment from the current `pickToSelection.ts`; note:
  `StructureCategory` → `StructureId` is a Part 1 rename — leave the current name here).
- any other / undefined code → `console.warn` (preserve the current `pickToSelection`
  message) and `null`.

- [ ] Test `returns null for a null pick`.
- [ ] Test `maps a galaxy catalog code to its GalaxyInfo` (fixture cloud; assert
      `.index`/`.source`/`.type === 'galaxyCatalog'`).
- [ ] Test `returns null for a galaxy code whose cloud is not loaded` (getCloud → undefined).
- [ ] Test `maps a structure code to its StructureInfo` (stub `structures.byCategory`;
      assert `.type === 'structure'`).
- [ ] Test `returns null when a structure hit has no backing record`.
- [ ] Test `warns and returns null for a non-pickable code` (assert the warn fires).
- [ ] Implement.
- [ ] `npm test -- resolvePick` green. Commit.

> Do not delete `pickToSelection.ts` yet — consumers flip in Task 8; deletion is Task 10.

---

## Task 7: Subsystem holds `FocusableTarget | null`

**Files:**
- `src/services/engine/subsystems/selectionSubsystem.ts` (modify)
- `src/@types/engine/subsystems/SelectionSubsystem.d.ts` (modify)
- `src/@types/engine/subsystems/CreateSelectionSubsystemInput.d.ts` (modify)
- `src/services/engine/engine.ts` (modify — construction site)
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
- Slots become `FocusableTarget | null`.
- Setters: dedup via `targetEq` (Task 5); store the target directly; fire the callback
  with the stored target — no internal resolution. `setSelected`/`setFocused` keep
  their `requestRender()` wake; `setHovered` stays wake-free.
- **Delete** `selectionEq`, `galaxyInfoFor`, `resolveTarget`. The closure no longer
  resolves, so **remove** `getCloud`/`getFamousMeta`/`getStructure` from
  `CreateSelectionSubsystemInput` and from the `createSelectionSubsystem({ … })` call
  in `engine.ts`. Keep `cb` and `requestRender`.
- Rewrite the module header: it no longer owns resolution or the `prebuiltInfo` escape
  hatch — the race is now defended by callers passing an already-resolved target (cite
  spec Part 0 diagnosis).

**Tests:** the suite constructs the subsystem with cloud/structure stubs and asserts
callback *targets*. Rework to pass targets directly:
- [ ] Keep/rename `dedupes setHovered — fires onHoverChange only on real transitions`
      (pass the same target twice → one fire).
- [ ] Replace the `uses prebuiltInfo on setSelected …` test with `setSelected fires
      onSelectChange with the passed target` (no lookup).
- [ ] Delete `fires onHoverChange(null) for an out-of-range galaxy localIdx` (bounds
      guard moved to `resolveGalaxyInfo`, covered by Task 4).
- [ ] Structure-variant test: pass a `StructureInfo` directly; assert the callback
      receives the same reference.
- [ ] Delete the whole `selectedTarget` describe block (getter gone).
- [ ] Cross-kind transition test: galaxy then structure targets → one fire each.
- [ ] Keep focus-slot + render-wake + lifecycle blocks, swapping `Selection` literals
      for target fixtures.
- [ ] `npm test -- selectionSubsystem` green, `npm run typecheck`. Commit (fold the
      `engine.ts` construction-site edit into this commit so typecheck stays green).

---

## Task 8: Flip the pick boundary — `clickHandler`, `wireInput`, `runFrame` hover, `selectByAlias`

**Files:**
- `src/services/engine/interaction/clickHandler.ts` (modify)
- `src/@types/engine/ClickResolver.d.ts` (modify — return type)
- `src/@types/engine/CreateClickResolverInput.d.ts` (modify — add cloud/famousMeta accessors)
- `src/services/engine/phases/wireInput.ts` (modify)
- `src/services/engine/frame/runFrame.ts` (modify — hover `.then`)
- `src/services/engine/engine.ts` (modify — `selectFamous`, `selectByAlias`, `commitGalaxyFocus` callers)
- `src/services/engine/helpers/commitGalaxyFocus.ts` (modify — drop prebuilt forwarding)
- `src/services/engine/helpers/commitStructureFocus.ts` (modify — drop Selection literal)
- `tests/services/engine/interaction/clickHandler.test.ts` (modify)
- `tests/services/engine/phases/wireInput.test.ts` + `wireInput.structure.test.ts` (modify)
- `tests/services/engine/helpers/commitGalaxyFocus.test.ts` + `commitStructureFocus.test.ts` (modify)

**`commitGalaxyFocus`** (read current body): currently builds a
`{ kind:'galaxy', source, localIdx }` Selection and forwards `info` as the prebuilt
arg to both setters. New body: `setSelected(info)` → `setFocused(info)` →
`tweenToGalaxy(state, info)` — `info` *is* the target. Drop the prebuilt arg + the
Selection literal; update the docblock (the resolved target is the race defence).

**`commitStructureFocus`** (read current body): currently builds
`{ kind:'structure', id }` for both setters. New body: `setSelected(structure)` →
`setFocused(structure)` → `tweenToStructure(state, structure)`.

**`clickHandler` `resolveClick`** (read current `:48-66`): change the return type to
`Promise<FocusableTarget | null>` (update `ClickResolver.d.ts`) and replace
`pickToSelection(pick, structures)` with `resolvePick(pick, deps)`. The resolver now
needs cloud + famousMeta accessors — extend `CreateClickResolverInput` and the
`wireInput` construction site to pass
`getCloud: (s) => state.data.galaxies.catalogs.get(s)` and
`getFamousMeta: () => state.data.galaxies.famousMeta` (verify the exact state paths).
Rewrite the docblock (no more thin pick→Selection contract, no `selectedTarget()`
dblclick hand-off).

**`wireInput`:**
- `onClick` `.then((target) => setSelected(target))` — `target` is a
  `FocusableTarget | null`; rename the binding from `sel` and update the comment.
- `onDoubleClick`: replace `selectedTarget()` with `selected()` (now the resolved
  target). Body otherwise unchanged.

**`runFrame` hover** (read current hover `.then`): replace
`setHovered(pickToSelection(pick, state.data.structures))` with
`setHovered(resolvePick(pick, deps))`, building `ResolvePickDeps` from `state` (cloud
+ famousMeta + structures). Drop the `pickToSelection` import. Keep the no-wake comment.

**`engine.ts` `selectFamous` / `selectByAlias`:** both already build a `GalaxyInfo`
via `buildGalaxyInfo` and call `commitGalaxyFocus(state, info)` — confirm the new
`commitGalaxyFocus` signature still takes `GalaxyInfo` and leave the bodies as-is.

- [ ] `commitGalaxyFocus.test.ts`: assert setters called with the `info` object (no
      Selection literal, no second arg).
- [ ] `commitStructureFocus.test.ts`: assert setters called with the `StructureInfo`
      (not `{kind:'structure',id}`).
- [ ] `clickHandler.test.ts`: assert `resolveClick` resolves to a `GalaxyInfo` /
      `StructureInfo` / `null` (was a Selection); stub the new accessors.
- [ ] `wireInput.test.ts` / `wireInput.structure.test.ts`: click/dblclick pass
      resolved targets to the setters; dblclick reads `selected()`.
- [ ] `npm test -- clickHandler wireInput commitGalaxyFocus commitStructureFocus` green.
- [ ] `npm run typecheck`. Commit.

---

## Task 9: Flip the slot readers via `type` narrowing

**Files:**
- `src/services/engine/helpers/structureIdOf.ts` (modify)
- `tests/services/engine/helpers/structureIdOf.test.ts` (modify)
- `src/services/engine/presentation/produceStructureMarkers.ts` (verify — call sites)
- `src/services/engine/presentation/produceStructureLabels.ts` (verify — call sites)
- `src/services/engine/frame/runFrame.ts` (modify — focus-fade resolution)
- `src/services/engine/frame/passes/selectionRingPass.ts` (modify)
- `src/services/engine/frame/passes/diskRadiusRingPass.ts` (modify)
- `src/services/engine/frame/passes/pointSpritesPass.ts` (modify)
- `src/@types/engine/frame/RenderFrameSettings.d.ts` (modify — `selected` type)
- `tests/services/engine/helpers/structureIdOf.test.ts` (modify)
- `tests/services/engine/frame/passes/selectionRingPass.test.ts` (modify)

**`structureIdOf`** (read current — it takes `Selection | null` and reads
`sel.kind === 'structure'`): change the param to `FocusableTarget | null`; body
becomes `target !== null && target.type === 'structure' ? target.id : null`. Update
the docblock + the stale `Selection` import.

**Producers** (`produceStructureMarkers` / `produceStructureLabels` call
`structureIdOf(selection.selected())` / `.focused()`): now passing
`FocusableTarget | null`. No call-site change beyond typecheck; verify.

**`runFrame` focus fade** (read current `:~195-200`): currently
`focusSel?.kind === 'structure' ? byId(focusSel.id) : null`. Replace with the held
target directly: `const focused = selection.focused(); const focusedStructure =
focused !== null && focused.type === 'structure' ? focused : null;` — the slot holds
the resolved `StructureInfo`, so the `byId` lookup is gone. Update the comment.

**`selectionRingPass`** (read current — `selected()` now returns
`FocusableTarget | null`):
- `enabled()`: `sel !== null && sel.type === 'galaxyCatalog'` (galaxy targets drive
  the halo; structures render through the marker pass; the milkyWay arm is added in
  Part 2).
- `draw()`: narrow on `sel.type === 'galaxyCatalog'`. **Read `worldPos` + `diameterKpc`
  off the `GalaxyInfo`** (`sel.x/y/z`, `sel.diameterKpc`) instead of re-indexing the
  catalog. This drops the `catalogs.get(sel.source)` lookup + its tier-swap guard
  (target already resolved + bounds-checked at pick time). Keep `RING_SIZE_SCALE` /
  apparent-radius math. Update the docblock.

**`diskRadiusRingPass`** (read current — **does NOT fully convert**): this debug pass
needs `axisRatio`, `positionAngleDeg`, and famous-row calibration — none on
`GalaxyInfo` at top level — so it keeps re-indexing the catalog.
- `enabled()`: `sel !== null && sel.type === 'galaxyCatalog'`.
- `draw()`: narrow on `sel.type === 'galaxyCatalog'`, then use `sel.source` +
  `sel.index` to re-index `catalogs.get(sel.source)` exactly as today (`localIdx` is
  now `sel.index`). Keep the defensive `if (!catalog) return`. Add a comment: this
  pass still re-indexes because tilt/calibration fields aren't on `GalaxyInfo`.

**`pointSpritesPass`** (read current `:~67-70`): `settings.selected` is now
`FocusableTarget | null`. Replace the `.kind === 'galaxy'` branch with
`settings.selected !== null && settings.selected.type === 'galaxyCatalog'
? packSelection(settings.selected.source, settings.selected.index)
: SELECTION_NONE_SENTINEL` (note `.index`, not `.localIdx`).

**`RenderFrameSettings.d.ts`** (read current `selected` field): change
`selected: Selection | null` → `selected: FocusableTarget | null`; update the docblock.
`runFrame` feeds `selected: selection.selected()` — verify no change needed.

- [ ] `structureIdOf.test.ts`: a `GalaxyInfo` → null; a `StructureInfo` → its id;
      null → null.
- [ ] `selectionRingPass.test.ts`: feed a `GalaxyInfo` fixture as the selection;
      assert `setSelection` receives `worldPos` from `x/y/z` and the ring radius from
      `diameterKpc`. Assert `enabled()` false for a `StructureInfo` and for null.
- [ ] Run the marker/label producer tests if any. `npm test -- structureIdOf
      selectionRingPass passes pointSprites` (whichever exist) green.
- [ ] `npm run typecheck`. Commit.

---

## Task 10: Delete the dead surfaces

**Files (delete):**
- `src/@types/engine/subsystems/Selection.d.ts`
- `src/services/engine/helpers/pickToSelection.ts`
- `tests/services/engine/helpers/pickToSelection.test.ts`
- `src/services/engine/isStructure.ts` (delete — replaced by `type` narrowing + tables)
- `tests/services/engine/isStructure.test.ts`

> **`isStructure` survival exception:** delete it. Every dispatch site is now either a
> `type` table (Task 3) or a `target.type === 'structure'` narrow (Tasks 3d / 9). If a
> single site genuinely reads cleaner with a thin guard, it may survive **only** as
> `export function isStructure(t: FocusableTarget): t is StructureInfo { return t.type === 'structure'; }`
> — the structural `'category' in target` sniff is gone regardless. Default is full
> deletion.

**Files (verify clean):** grep the tree for `Selection`, `selectionEq`,
`prebuiltInfo`, `selectedTarget`, `pickToSelection`, `GalaxySelection`,
`StructureSelection`, `resolveTarget`, `galaxyInfoFor`, `'category' in`,
`StructureRecord` — every remaining hit must be gone or a comment that should also be
cleaned. Check the JSDoc references the spec/grep flag: `PickRenderer.d.ts`,
`PickResult.d.ts`, `BootstrapDeps.d.ts`, `EngineSelectionHandle.d.ts`,
`selectionEncoding.ts`, `tweenToGalaxy.ts`, `CommandPalette.tsx`, `EngineCallbacks.d.ts`,
`EngineCameraHandle.d.ts` — update prose naming the deleted symbols.

- [ ] Delete the dead files.
- [ ] `npm test` — full suite green.
- [ ] `npm run typecheck` — clean (both tsconfigs).
- [ ] Grep confirms no source/test references to `Selection` / `selectionEq` /
      `prebuiltInfo` / `selectedTarget` / `pickToSelection` / `'category' in` /
      `StructureRecord` / the structural `isStructure` sniff remain (comment-only refs
      updated).
- [ ] Commit.

---

## Definition of Done

- [ ] `npm test` — full suite green (net deletion of the `selectionEq` /
      `prebuiltInfo` / `selectedTarget` cases, plus new `resolveGalaxyInfo` /
      `resolvePick` / `targetEq` / table coverage).
- [ ] `npm run typecheck` — clean across `src` and `tools` tsconfigs.
- [ ] `Selection.d.ts`, `selectionEq`, `prebuiltInfo`, `selectedTarget()`,
      `pickToSelection.ts`, the subsystem's internal `resolveTarget` / `galaxyInfoFor`,
      and the structural `isStructure` sniff (`'category' in target`) are all gone.
- [ ] `StructureRecord` as a name is gone repo-wide — renamed `StructureInfo`.
- [ ] `FocusableTarget` is a **tagged union** on `type: FocusableTargetType`
      (`'galaxyCatalog' | 'structure'`); the InfoCard detail card, URL hash, and
      commit-focus dispatches are `Record<FocusableTargetType, …>` table lookups
      (`DETAIL_CARD` / `URL_HASH_FOR` / `COMMIT_FOCUS`); simple guards narrow on
      `target.type === '…'` with no `as` cast in any predicate false-branch.
- [ ] The three selection slots hold `FocusableTarget | null`; setters take a resolved
      target; resolution happens once at the pick / URL boundary via `resolvePick` /
      `resolveGalaxyInfo`.
- [ ] `CreateSelectionSubsystemInput` no longer carries `getCloud` / `getFamousMeta` /
      `getStructure` (resolution left the subsystem).
- [ ] No behaviour change: hover / single-click select / double-click focus /
      Esc-dismiss / cluster-focus fade / deep-link `selectByAlias` race all behave as
      before (the race is now defended by callers passing an already-resolved target,
      not the `prebuiltInfo` escape hatch).
- [ ] No new TODOs; comments that named deleted symbols updated, not left stale.
