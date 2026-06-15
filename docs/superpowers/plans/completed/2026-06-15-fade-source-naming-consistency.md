# Part 1 — Fade-layer / source naming consistency

**REQUIRED SUB-SKILL:** `superpowers:subagent-driven-development` (execute this plan
via a fresh subagent per task + spec + quality reviews — see CLAUDE.md "TDD via plans").

> **Sequencing.** This is **Part 1** of the three-part "Milky Way as a first-class
> source" effort (spec: `docs/superpowers/specs/2026-06-15-milky-way-first-class-source-design.md`).
> It builds on **Part 0** (`docs/superpowers/plans/2026-06-15-selection-target-unification.md`)
> and **Part 2** (`…-mw-selectable.md`) builds on this one. Part 1 is a **pure
> refactor with no behaviour change** — the suite is green before and after, and
> the `{ kind: 'milkyWay' }` disk fade behaves exactly as `overlay:'milkyWay'` did.

## Goal

Make every primary-render fade kind named by its **source type** (`galaxyCatalog`
/ `structure` / `volumeField` / `filament` / `flow` / `milkyWay`), collapse the
three "one-fade-per-source-id" kinds that were named three different ways, lift
the Milky-Way disk fade out of `overlay`, and rename `StructureCategory` →
`StructureId` so the codebase carries the parallel triple
`GalaxyCatalogId / StructureId / VolumeFieldId`. No runtime behaviour changes.

## Architecture

Two coupled, type-checker-guarded mechanical sweeps:

- **A. `FadeId` → Model A** — see the spec "Part 1 — Target — Model A" table and
  union (`spec §136–211`). `markerLayer`+`category` → `structure`+`id`;
  `scalarField`+`field` → `volumeField`+`id`; `filaments` → `filament`;
  `labelLayer.category` retyped `StructureId`; new `{ kind: 'milkyWay' }` for the
  MW disk; `OverlayId` drops `'milkyWay'`.
- **B. `StructureCategory` → `StructureId`** — rename the type file + type + every
  reference (settings keys, marker buckets, label categories, `resolvePick`) and
  tests. **Decision (confirmed):** full rename — the *type* **and** its runtime
  companion both move to the `Id` vocabulary, so no residual `category` naming
  remains for the structure-id enumeration:
  - type `StructureCategory` → `StructureId` (file `StructureCategory.d.ts` →
    `StructureId.d.ts`).
  - runtime file `src/data/structure/structureCategories.ts` → `structureIds.ts`,
    and its exports `STRUCTURE_CATEGORIES` → `STRUCTURE_IDS`,
    `STRUCTURE_CATEGORY_CODES` → `STRUCTURE_ID_CODES` (if present),
    `isStructureCategory` → `isStructureId`.
  - the predicate stays `(id: string): id is StructureId`.
  (`labelCategories.ts` and the `LabelCategory` type are a SEPARATE concern — the
  label-category space spans famousGalaxy + structures — and are **not** renamed.)

Both changes are guarded by `tsc`: a missed call site is a compile error, not a
silent behaviour change. **`npm run typecheck` is the primary driver** — after the
union + type-file changes land, the type errors enumerate the remaining sweep.

## Tech Stack

TypeScript (`tsc --noEmit` both tsconfigs via `npm run typecheck`), Vitest
(`npm test`). No WGSL, no binary-format, no GPU changes. Project conventions:
one type per file in `src/@types/` (filename = type name), `type` not `interface`,
deep relative imports / no barrels, didactic comments, tests mirror `src/`, typed
`vi.fn<() => void>()`.

---

> **Execution note:** Tasks 1–4 landed as ONE commit and 5–6 folded in: the `OverlayId` shrink (Task 2) immediately breaks the `overlay:'milkyWay'` construction sites (Task 4), so there is no intermediate green state — the whole rename is one no-behaviour-change changeset. Task 5's ON→1/OFF→0 disk-seed assertions were already covered by the existing `registerOverlayFades` milkyWay tests (repointed to `{ kind: 'milkyWay' }`).

## Task 1 — Rename the type file `StructureCategory` → `StructureId`

The type-side rename and the `FadeId` union change are interdependent (the union
imports the type), so do the type rename first, then the union (Task 2) in the
same compiling sweep — but commit Task 1 only once the tree compiles, which means
Tasks 1–3 land together (see the note at the end of Task 3).

**Files:**

- `src/@types/data/structure/StructureCategory.d.ts` → **rename to**
  `src/@types/data/structure/StructureId.d.ts` (rename file + the exported type
  `StructureCategory` → `StructureId`).
- Every importer of the type (Grep `from '.*StructureCategory'` and the
  `StructureCategory` identifier across `src/` + `tests/`). Per the Grep done at
  plan time these include (re-Grep — lines/sites may shift):
  `src/@types/animation/FadeId.d.ts`, `src/@types/camera/FocusTarget.d.ts`,
  `src/@types/data/structure/StructureCatalog.d.ts`,
  `src/@types/data/structure/StructureRecord.d.ts`,
  `src/@types/data/volume/VolumeFieldId.d.ts` (comment ref only — check),
  `src/@types/engine/data/{PickStructureStore,StructureStore}.d.ts`,
  `src/@types/engine/EngineCallbacks.d.ts`,
  `src/@types/engine/handles/EngineStructuresHandle.d.ts`,
  `src/@types/engine/state/FocusState.d.ts`,
  `src/@types/engine/UseEngineReturn.d.ts`,
  `src/@types/rendering/StructureMarkerDescriptor.d.ts`,
  `src/@types/settings/EngineSettingsState.d.ts`,
  `src/components/App/App.tsx`, `src/components/SettingsPanel/SettingsPanel.tsx`,
  `src/data/structure/{labelCategories,structureCategories}.ts`,
  `src/hooks/useEngine.ts`, `src/services/engine/engine.ts`,
  `src/services/engine/data/createStructureStore.ts`,
  `src/services/engine/handles/{setStructureItemEnabled,setStructureLabelEnabled}.ts`,
  `src/services/engine/helpers/{pickToSelection,resolveStructureFromPick}.ts`
  (note: Part 0 may delete `pickToSelection` — coordinate; if it still exists, sweep it),
  `src/services/engine/isStructure.ts`,
  `src/services/engine/presentation/{produceStructureLabels,structureMarkerStyles}.ts`,
  `src/services/engine/settingsStore/actions/{setStructureItemEnabledAction,setStructureLabelEnabledAction}.ts`,
  `src/services/engine/settingsStore/{projectLabelCategoryVisibility,projectMarkerCategoryVisibility}.ts`,
  `src/services/engine/settingsStore/reducers/{setStructureItemEnabled,setStructureLabelEnabled}.ts`,
  `src/services/engine/settingsStore/selectors/selectStructureItems.ts`,
  `src/services/engine/wiring/{assetWiring,registerOverlayFades}.ts`,
  `src/services/gpu/renderers/structureMarkerRenderer.ts`,
  `src/services/url/focusUrl.ts`, `src/data/galaxyCatalog/galaxyCatalogIds.ts`
  (comment ref only — check), `tools/structures/buildStructures.ts`.
- **Runtime companion rename** (Architecture B): `src/data/structure/structureCategories.ts`
  → `src/data/structure/structureIds.ts`; `STRUCTURE_CATEGORIES` → `STRUCTURE_IDS`,
  `STRUCTURE_CATEGORY_CODES` → `STRUCTURE_ID_CODES` (if present), `isStructureCategory`
  → `isStructureId`. Sweep every importer of these symbols (Grep
  `STRUCTURE_CATEGORIES` / `STRUCTURE_CATEGORY_CODES` / `isStructureCategory` /
  `structureCategories'` across `src/` + `tests/` — includes `App.tsx`,
  `SettingsPanel.tsx`, `projectLabelCategoryVisibility.ts`,
  `projectMarkerCategoryVisibility.ts`, and the structure store / wiring).
- **Docblock:** the renamed `StructureId.d.ts` docblock must state it is the
  **source-level** id (`cluster` / `supercluster` / `void` / `group`), the exact
  parallel of `GalaxyCatalogId` / `VolumeFieldId`, and that it is **distinct from
  the per-record `StructureRecord.id`** (e.g. `"A2703"`). The runtime companion
  `structureIds.ts` docblock follows the same `Id` vocabulary.

**Contract:** `StructureId.d.ts:12` shape unchanged —
`export type StructureId = Extract<AnyEntry, { readonly type: 'structure' }>['id'];`

- [x] Rename the type file + symbol AND the runtime companion file + its exports
  (`STRUCTURE_IDS` / `STRUCTURE_ID_CODES` / `isStructureId`); update both docblocks.
- [x] Sweep every `StructureCategory` identifier + import path to `StructureId`, and
  every `STRUCTURE_CATEGORIES` / `STRUCTURE_CATEGORY_CODES` / `isStructureCategory`
  reference to the renamed runtime symbols. In the renamed `structureIds.ts` the
  `Record<StructureCategory, …>` annotation and the `import type` become `StructureId`.
- [x] Sweep test files referencing the type (see Task 6).
- [x] (Compile gate deferred to Task 3 — the tree won't fully typecheck until the
  `FadeId` union also changes.)

---

## Task 2 — `FadeId` union → Model A + `OverlayId` shrink + `serializeFadeId`

**Files:** `src/@types/animation/FadeId.d.ts` (modify),
`src/@types/animation/OverlayId.d.ts` (modify),
`src/services/animation/fadeRegistry.ts` (modify),
`tests/services/animation/fadeRegistry.test.ts` (modify).

**Target union** (replaces `FadeId.d.ts:63–75`; import `StructureId` from the
Task-1 path; drop the `StructureCategory` import):

```ts
export type FadeId =
  | { readonly kind: 'galaxyCatalog'; readonly id: GalaxyCatalogId }
  | { readonly kind: 'structure'; readonly id: StructureId }
  | { readonly kind: 'volumeField'; readonly id: VolumeFieldId }
  | { readonly kind: 'milkyWay' }
  | { readonly kind: 'filament' }
  | { readonly kind: 'flow' }
  | {
      readonly kind: 'labelLayer';
      readonly layer: LabelLayerId;
      readonly category?: StructureId;
    }
  | { readonly kind: 'overlay'; readonly id: OverlayId }
  | { readonly kind: 'volumesMaster' };
```

- [x] Rewrite the union and its docblock (`FadeId.d.ts:1–76`): rename the
  `scalarField`/`markerLayer`/`filaments`/`overlay:milkyWay` doc paragraphs to
  `volumeField`/`structure`/`filament` and add a `milkyWay` paragraph (the MW disk
  fade, seeded from `settings.milkyWay.enabled`, multiplied into the renderer's
  distance fade — mirror the old `overlay` milkyWay wording).
- [x] `OverlayId.d.ts`: drop `'milkyWay'` → `export type OverlayId = 'proceduralDisks' | 'texturedDisks';`
  and remove the `milkyWay` bullet from its docblock.
- [x] `serializeFadeId` (`fadeRegistry.ts:52–74`): update the switch in lockstep —
  `case 'structure': return \`structure:${h.id}\``, `case 'volumeField': return \`volumeField:${h.id}\``,
  `case 'milkyWay': return 'milkyWay'`, `case 'filament': return 'filament'`.
  `labelLayer` key shape **unchanged** (`labelLayer:${layer}[:${category}]`).
- [x] `fadeRegistry.test.ts`: update the serialize round-trip assertions in
  lockstep — assert `serializeFadeId`-derived keys `structure:cluster`,
  `volumeField:cf4`, `milkyWay`, `filament` register/resolve distinctly (parity
  with the old `markerLayer:cluster` / `scalarField:cf4` / `filaments` cases). If
  the test references `overlay:milkyWay`, repoint to `{ kind: 'milkyWay' }`.

---

## Task 3 — Sweep all `FadeId` construction sites + `focusRecession` exhaustive switch

The union change in Task 2 makes every old-named construction site a compile
error. Sweep them. **This task's typecheck gate is the compile gate for Tasks 1–3
together** — commit only when `npm run typecheck` is clean.

**Files** (re-Grep `kind: 'scalarField'`, `kind: 'markerLayer'`, `kind: 'filaments'`,
`overlay', id: 'milkyWay'` across `src/`):

- `src/services/engine/frame/encodeVolumePrepass.ts:73` — `scalarField`/`field` → `volumeField`/`id`.
- `src/services/engine/frame/passes/volumeUpsamplePass.ts:55` — same.
- `src/services/loading/slots/cf4DensitySlot.ts:48`, `mcpmSlot.ts:44`,
  `syntheticVolumeSlots.ts:94` — same.
- `src/services/engine/phases/initGpu.ts:338,341` — `scalarField` register/unregister → `volumeField`.
- `src/services/engine/presentation/produceStructureMarkers.ts:70,136` —
  `markerLayer`/`category` → `structure`/`id`.
- `src/services/engine/presentation/produceStructureLabels.ts:121` — same.
- `src/services/engine/handles/setStructureItemEnabled.ts:37` — same.
- `src/services/engine/frame/passes/filamentsPass.ts:75,100` — `filaments` → `filament`.
- `src/services/loading/slots/filamentSlot.ts:30,51` — `filaments` → `filament`.
- `src/services/engine/settingsStore/reducers/setFilamentsEnabled.ts:18` —
  comment ref `{ kind: 'filaments' }` → `{ kind: 'filament' }`.
- `src/services/engine/presentation/focusRecession.ts:70–92` — the exhaustive
  `recessionTargetFor` switch: rename `case 'markerLayer'` → `'structure'`,
  `case 'filaments'` → `'filament'`, `case 'scalarField'` → `'volumeField'`, and
  add a `case 'milkyWay': return undefined;` (the MW disk does not recede on focus
  — non-recessing, like `overlay`/`galaxyCatalog`). Update the `labelLayer`
  comment's `'milkyWay'` reference only if it now reads ambiguously (it refers to
  the *label* layer id, not the new disk kind — leave it, the layer-id namespace
  is separate).

**Contract:** `recessionTargetFor` stays exhaustive over `FadeId['kind']` with no
`default` arm (the spec's "a new kind must add a case" discipline). Behaviour for
every renamed kind is **identical** to before — same recession constant, same
`undefined`.

- [x] Mechanically repoint each construction site above (kind + property rename;
  no value/logic change).
- [x] Add the `milkyWay` arm to `recessionTargetFor` returning `undefined`.
- [x] `npm run typecheck` → clean (this is the proof the sweep is complete — zero
  `scalarField` / `markerLayer` / `filaments` / `StructureCategory` left).
- [x] `npm test` → green (no behaviour change; existing tests pass under the new
  names once Task 6 updates the test-side constructions).
- [x] Commit Tasks 1–3 together (the tree only compiles with all three).

---

## Task 4 — Repoint the MW **disk** fade `overlay:'milkyWay'` → `{ kind: 'milkyWay' }`

**Files:**

- `src/services/engine/frame/passes/milkyWayPass.ts:62,75–78` — both
  `opacityOf({ kind: 'overlay', id: 'milkyWay' }, …)` reads → `opacityOf({ kind: 'milkyWay' }, …)`.
- `src/services/engine/wiring/registerOverlayFades.ts:62–65` — the seed
  `register({ kind: 'overlay', id: 'milkyWay' }, state.settings.milkyWay.enabled ? 1 : 0)`
  → `register({ kind: 'milkyWay' }, state.settings.milkyWay.enabled ? 1 : 0)`.
  Update the surrounding docblock/comment (the "Overlay handles — Milky Way"
  paragraph and the "three overlay handles" registration-order note) to reflect
  that MW disk is now its own kind, not an overlay; keep the proceduralDisks /
  texturedDisks overlay registers as-is.
- `src/services/engine/engine.ts:1216–1224` — the disk toggle handle
  (`handle.milkyWay.setEnabled`): the `fadeTo({ kind: 'overlay', id: 'milkyWay' }, …)`
  → `fadeTo({ kind: 'milkyWay' }, …)`. (This is the `EngineMilkyWayHandle.setEnabled`
  impl; the label toggle in `setMilkyWayLabelEnabled.ts` stays on `labelLayer` and
  is untouched.)

**Contract:** identical fade behaviour — seed value, toggle fadeTo, pass
opacityOf composition all unchanged; only the `FadeId` literal changes. After
this task there is **no** `overlay`-kind construction with `id: 'milkyWay'`
anywhere (Grep confirms `OverlayId` no longer admits it — already enforced by
Task 2's type, so a leftover is a compile error).

- [x] Repoint the three sites above.
- [x] `npm run typecheck` → clean.
- [x] Commit.

---

## Task 5 — Seed-coherence test for the `{ kind: 'milkyWay' }` disk fade

**Files:** `tests/services/engine/wiring/registerOverlayFades.test.ts` (modify).

The disk fade gets the same ON→1 / OFF→0 seed assertions the label-layer milkyWay
case already has (spec "Part 1 testing").

- [x] Update any existing `overlay:milkyWay` seed assertion to the new
  `{ kind: 'milkyWay' }` key.
- [x] Add/confirm test `registerOverlayFades seeds the milky-way disk fade from settings.milkyWay.enabled (on → 1)`
  — fixture with `settings.milkyWay.enabled = true`, assert
  `fades.opacityOf({ kind: 'milkyWay' })` is `1`.
- [x] Add test `registerOverlayFades seeds the milky-way disk fade off (off → 0)`
  — `enabled = false`, assert opacity `0`. (Mirror the existing label-layer
  milkyWay seed test; reuse the same fixture builder. Typed `vi.fn<() => void>()`
  for any `requestRender` stub.)
- [x] `npm test -- registerOverlayFades` → green.
- [x] Commit.

---

## Task 6 — Sweep remaining test files for renamed `FadeId` kinds + `StructureCategory`

Many of these are already touched by Tasks 1–3/5; this task is the cleanup pass
ensuring no test still constructs an old-named kind or imports the old type.

**Files** (re-Grep `kind: 'scalarField'|markerLayer|filaments|overlay`, and
`StructureCategory` / `STRUCTURE_CATEGORIES` / `STRUCTURE_CATEGORY_CODES` /
`isStructureCategory`, across `tests/`):

- `tests/services/engine/frame/passes/filamentsPass.test.ts` — `filaments` → `filament`.
- `tests/services/engine/phases/wireSlots.test.ts` — `overlay:milkyWay` / `scalarField` etc.
- `tests/services/engine/presentation/focusRecession.test.ts` —
  `markerLayer`/`scalarField`/`filaments` cases + add a `milkyWay → 1` (no
  recession) assertion if the suite asserts per-kind targets.
- `tests/services/engine/presentation/produceStructureLabels.test.ts`,
  `produceStructureMarkers.test.ts` — `markerLayer`/`category` → `structure`/`id`.
- `tests/services/engine/setCategoryVisibleFade.test.ts` — `markerLayer` →
  `structure`.
- `tests/@types/engine/data/structureRecord.types.test.ts`,
  `tests/@types/engineSettingsState.itemVisibility.test.ts`,
  `tests/data/sources.test.ts`, `tests/data/structure/labelCategories.test.ts`,
  `tests/services/engine/data/createStructureStore.test.ts`,
  `tests/services/engine/helpers/resolveStructureFromPick.test.ts`,
  `tests/services/engine/settingsStore/makeSettingsFixture.ts`,
  `tests/services/engine/settingsStore/projectLabelCategoryVisibility.test.ts`,
  `tests/services/engine/settingsStore/projectMarkerCategoryVisibility.test.ts`,
  `tests/services/gpu/renderers/structureMarkerRenderer.pick.test.ts` —
  `StructureCategory` type imports → `StructureId`.

**Contract:** parity only — same assertions under new names; **no new coverage**
except the milkyWay seed (Task 5) and the optional `milkyWay` recession arm above.

- [x] Sweep each file; keep assertions semantically identical.
- [x] `npm test` → full suite green.
- [x] `npm run typecheck` → clean.
- [x] Commit.

---

## Definition of Done

- [x] `npm test` green (same count as before plus the one milkyWay-seed test;
  Tasks 5/6 net no other coverage change).
- [x] `npm run typecheck` clean (both `src` and `tools` tsconfigs).
- [x] Repo-wide Grep finds **zero** `'scalarField'`, `'markerLayer'`, `'filaments'`
  (as a `FadeId` kind), `StructureCategory`, `STRUCTURE_CATEGORIES`,
  `STRUCTURE_CATEGORY_CODES`, `isStructureCategory`, `structureCategories` (file),
  and `overlay'.*'milkyWay'` / `id: 'milkyWay'` on an `overlay` kind. (`LabelCategory`
  / `labelCategories` are a separate concept and remain.)
- [x] `OverlayId` is exactly `'proceduralDisks' | 'texturedDisks'`.
- [x] `FadeId` carries the source-named kinds `galaxyCatalog` / `structure` /
  `volumeField` / `filament` / `flow` / `milkyWay` plus the unchanged
  `labelLayer` / `overlay` / `volumesMaster`.
- [x] MW disk fade flows through `{ kind: 'milkyWay' }` end-to-end (seed →
  toggle → pass read), behaviourally identical to the retired `overlay:'milkyWay'`.
- [x] `recessionTargetFor` stays exhaustive over `FadeId['kind']` (no `default`).
- [x] No new TODO/FIXME comments introduced.
- [x] No behaviour change observable in the running app (pure rename refactor).
