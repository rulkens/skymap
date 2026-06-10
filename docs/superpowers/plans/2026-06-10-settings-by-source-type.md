# Settings-by-source-type reshape — implementation plan

> **REQUIRED SUB-SKILL:** execute this plan via `superpowers:subagent-driven-development`
> (one fresh implementer subagent per task, plus spec + quality reviews). The
> MAIN thread runs `npm test` / `npm run typecheck` and makes the commits;
> implementers **edit files only** — they cannot run npm/npx (see project memory).

## Goal

Reshape `EngineSettingsState` so every per-entity visibility is
`settings.<sourceType>.items[id].enabled`, with `labelEnabled` as the optional
label axis on the source types that bear labels — replacing the two flat root
records (`labelCategoryVisibility` / `markerCategoryVisibility`), the mislabeled
`points` cluster, and the `masterEnabled`/`fields` volume naming. Then make
`settings.surveys.items[id].enabled` the **single source of truth** for survey
on/off, deriving the `state.sources.drawMask` / `pickMask` bitmasks from it
instead of mutating them as a parallel truth.

This ships as **one PR with two phases**: Phase A is the settings-shape reshape
(behaviour-preserving — the bitmask is still independently mutated by
`setSourceVisibleImpl`); Phase B collapses that async mask mutation into the
survey idiom and derives the masks. **Phase A is GREEN at every commit:** it
migrates ONE source-type at a time, end-to-end (type + construction seed + every
reader + writer/handle + React panel/hook/App), deleting the old field within the
same slice once it is fully unread. There is no type-only RED commit and no
transient dual-shape. Phase B rewrites the two mask-ordering tests to the new
model.

## Architecture (the three knots, from the design)

The category/marker/volume/survey visibility lives in **four shapes** today —
all four sources are the *same* `SOURCE_ENTRIES` registry, yet:

| Source type | visibility today | home |
|---|---|---|
| Survey points | `drawMask` / `pickMask` bitmask | `state.sources` (NOT settings) |
| Volume field | `settings.volumes.fields[id].enabled` | settings (per-entity) |
| Structure ring (marker) | `markerCategoryVisibility[cat]` → fade opacity | flat root record |
| Structure / famous label | `labelCategoryVisibility[cat]` → fade opacity | flat root record |

The reshape un-braids: (1) **shape** — uniform `<type>.items[id]` nesting; (2)
**handle overload** — split `handle.labels`'s two setters into `handle.structures.*`
+ the surveys label axis; (3) **value × time** — the structure producers read
the boolean as the authoritative gate, fade opacity becomes only the cosmetic
alpha. Phase B adds the fourth: (4) **survey on/off is a settings boolean**, the
bitmask a derived output.

Design source of truth:
`docs/superpowers/specs/2026-06-10-settings-by-source-type-design.md`. Read it
first; this plan implements it (folding the design's "PR-1 / PR-2" into phases A
and B).

## Skymap conventions reminder (for every implementer)

- `type` aliases, never `interface`. **ONE type per `@types` file** — never
  co-locate two exported types; create a new file per new type.
- `readonly` where the neighbouring file uses it (the settings leaf types are
  intentionally mutable — `EngineSettingsState` is mutated in place; match that).
- `Vec2`/`Vec3` aliases if any vector appears (none expected here).
- Didactic comments: explain *why* + the alternative the design rejected, as
  multi-paragraph module headers matching the surrounding files. **No history
  notes** (no dates / PR refs / "was X / pre-Y" — describe the current state).
- Deep relative imports; no barrels.
- **Pause before implementing:** reuse existing helpers (`maskWith`/`maskWithout`/
  `maskHas`/`ALL_VISIBLE_MASK` in `src/utils/sourceMask.ts`,
  `isStructureCategory`, `LABEL_LAYER_BY_CATEGORY`, `STRUCTURE_CATEGORIES`,
  `SOURCE_IDS`); surface the simplest alternative before editing. If a clean
  change is **blocked** by something structural, STOP and report rather than
  re-braiding around it.
- **Re-verify every cited `file:line`** — the engine.ts line numbers WILL have
  drifted by execution time. The setters/seeds are findable by name
  (`setSourceVisibleImpl`, `setCategoryLabelVisible`, `setCategoryMarkerVisible`,
  the `settings:` literal in `createEngine`, the `labels:` handle literal).
- Run bash **sequentially** (a permission denial cascade-cancels a parallel
  batch); use Read/Grep tools, not sed/awk/grep.
- The MAIN thread runs `npm test` / `npm run typecheck` and commits.

---

## Phase A — settings reshape (vertical slices, green at every commit)

Behaviour-preserving. At the end of Phase A the bitmask is STILL independently
mutated by `setSourceVisibleImpl` — only the settings shape, the structure
producers' gate, and the handle change. `setSourceVisibleFade.test.ts` (the
Phase-B survey-mask test) stays green **unchanged** through Phase A.

**The slicing principle.** A1 lands the additive new item types. Then each of
A2/A3/A4 migrates ONE source-type end-to-end in a single cohesive green commit:
the type leaf, the construction seed, every reader and writer, the handle, and
the React panel/hook/App rows for that type — DELETING the old field it replaces
within the same slice, once that field is fully unread. Order is volumes (fewest
readers, self-contained) → structures (frees `markerCategoryVisibility`) →
surveys (frees `labelCategoryVisibility` + the `labels`/`points` handle
namespaces, and removes the famous store flag). Each slice is bigger than a
micro-task but COHESIVE, and the tree typechecks + the suite passes at the end of
every one. The per-slice TDD step is "adjust/extend that concern's existing test
→ migrate → green"; the existing tests pin observable behaviour.

### Task A1 — new base + item types (additive, green)

**Files:**
- Create `src/@types/settings/DataItemSettings.d.ts`
- Create `src/@types/settings/SurveyItemSettings.d.ts`
- Create `src/@types/settings/StructureItemSettings.d.ts`
- Modify `src/@types/settings/VolumeFieldSettings.d.ts`
- Test `tests/@types/settingsItemTypes.test.ts` (type-smoke, mirror
  `tests/@types/engineState.test.ts` shape)

**Contract:**
```ts
// DataItemSettings.d.ts — the shared base; visibility is the only universal axis.
export type DataItemSettings = { enabled: boolean };

// SurveyItemSettings.d.ts
export type SurveyItemSettings = DataItemSettings & { labelEnabled: boolean };

// StructureItemSettings.d.ts
export type StructureItemSettings = DataItemSettings & { labelEnabled: boolean };
```
`VolumeFieldSettings` changes from a standalone `{ enabled; intensity; … }` to
`DataItemSettings & { intensity; contrast; densityScale; paletteId; trim; exposure }`
— drop the inline `enabled` field (now inherited from the base), keep every
other knob and its doc verbatim (`VolumeFieldSettings.d.ts:13-58`).

- [x] Add type-smoke test `DataItemSettings/SurveyItemSettings/StructureItemSettings
  carry enabled (+ labelEnabled)` constructing each literal via `satisfies` and a
  trivial runtime `expect`.
- [x] Add `VolumeFieldSettings extends DataItemSettings` assertion (a value of
  `VolumeFieldSettings` is assignable to `DataItemSettings`).
- [x] Run fails (types absent).
- [x] Create the three new types with didactic headers (why a shared base: the
  universal visibility axis; why label-bearing types add `labelEnabled` rather
  than a separate record). Refactor `VolumeFieldSettings` to extend the base.
- [x] Run passes.
- [x] Commit.

### Task A2 — volumes slice (one green commit)

The smallest, self-contained source-type: no flat records, no producers'
value×time braid, fewest readers. Migrate it end-to-end first to establish the
slice rhythm.

**Files:**
- Modify `src/@types/settings/EngineSettingsState.d.ts` (the `volumes` cluster only)
- Modify `src/services/engine/engine.ts` (the `volumes:` seed in the `settings:`
  literal + `seedVolumeFields`)
- Modify every `settings.volumes.masterEnabled` / `settings.volumes.fields`
  reader/writer (grep both names — they're the entire footprint of this slice)
- Modify the React panel/hook/App rows for volumes if they read the settings
  shape directly (the `EngineVolumesHandle` methods are the usual seam — see the
  handle decision below)
- Test: `tests/@types/engineState.test.ts` (volumes-cluster assertion) +
  whatever existing volumes test pins the seed/reader behaviour

**Contract** — rename inside the `volumes` cluster
(`EngineSettingsState.d.ts:190-200`):
```ts
volumes: {
  enabled: boolean;            // was masterEnabled
  items: Partial<Record<VolumeFieldId, VolumeFieldSettings>>;  // was fields
};
```
Seed: `volumes: { enabled: DEFAULT_VOLUMES_ENABLED, items: seedVolumeFields() }`
(rename `seedVolumeFields`'s output key/usages from `fields`→`items` if it
references the name). Every reader of `state.settings.volumes.masterEnabled`
→ `.enabled`, `.fields`→`.items`.

**Handle decision (documented, carried from the design's symmetry note):** the
`EngineVolumesHandle.setMasterEnabled` method (`EngineVolumesHandle.d.ts:22`) is
a *handle* name, distinct from the *settings* `masterEnabled→enabled` rename.
**Prefer keeping the handle method name `setMasterEnabled`** to avoid touching
the handle type + every `handle.volumes.setMasterEnabled` call site (`App.tsx`)
— the settings rename and the handle name vary independently. Note this in the
commit body; if the design's symmetry is judged to warrant the handle rename too,
do it, but it is not required for the settings reshape.

- [x] Update the engineState type-smoke test: `volumes.enabled` exists,
  `volumes.items` exists, `volumes.masterEnabled` / `volumes.fields` absent.
- [x] Run fails (or typecheck flags the renamed leaves).
- [x] Rename the type leaf + seed + every reader/writer; update the cluster's
  didactic comment (volumes' `items` joins the uniform per-item shape). Keep the
  handle method name per the decision above.
- [x] Run typecheck → GREEN. Run the suite → GREEN.
- [x] Commit (one cohesive volumes slice).

### Task A3 — structures slice (one green commit)

Add the `structures` cluster and migrate every structure reader/writer/handle/
React row end-to-end, then DELETE `markerCategoryVisibility` (after this slice it
is fully unread — only structures bear markers). `labelCategoryVisibility` still
exists at the end of A3 because famousGalaxy reads it; it is deleted in A4.

**Files:**
- Modify `src/@types/settings/EngineSettingsState.d.ts` — add the `structures`
  cluster; DELETE `markerCategoryVisibility` (`:139-142` / `:190-200` region —
  re-verify). Imports: add `StructureItemSettings`.
- Create `src/@types/engine/handles/EngineStructuresHandle.d.ts`
- Modify `src/@types/engine/EngineHandle.d.ts` (add `structures:
  EngineStructuresHandle`; the marker half of `labels` moves here)
- Modify `src/@types/engine/handles/EngineLabelsHandle.d.ts` (drop
  `setCategoryMarkerVisible`; `setCategoryLabelVisible` stays until A4 folds it)
- Modify `src/services/engine/engine.ts` — seed the `structures` cluster
  all-true; rewrite `setCategoryMarkerVisible` to write
  `structures.items[cat].enabled` + the structure half of `setCategoryLabelVisible`
  to write `structures.items[cat].labelEnabled`; the `structures:` handle literal.
- Modify the structure producers `produceStructureMarkers.ts` /
  `produceStructureLabels.ts` — the value×time un-braid (below).
- Modify `src/services/engine/wiring/registerOverlayFades.ts:97-105` — seed each
  category fade from `structures.items[cat].enabled` (marker) /
  `structures.items[cat].labelEnabled` (structure label).
- Modify `src/services/engine/wiring/assetWiring.ts:186-190` — the demand gate's
  structure half: `markerCategoryVisibility[cat]` →
  `structures.items[cat].enabled`; the `labelCategoryVisibility[cat]` half stays
  pointing at the old record until A4 (the OR keeps both readable mid-slice).
- Modify `src/services/engine/wiring/seedSettingsCallbacks.ts:69-70` /
  `phases/wireInput.ts:295-296` — the marker-record seed derives from
  `structures.items`.
- Modify `src/hooks/useEngineSettings.ts` / `SettingsPanel.tsx` /
  `App.tsx` — marker rows + structure-label rows re-point to
  `handle.structures.setItemEnabled` / `handle.structures.setLabelEnabled`.
- Tests: `tests/@types/engineState.test.ts`; the structure producer tests; the
  handle-setter test (`setCategoryVisibleFade.test.ts` — rename the marker/
  structure-label assertions to the new method names).

**Seed contract:**
```ts
structures: {
  enabled: true,
  items: Object.fromEntries(STRUCTURE_CATEGORIES.map((c) => [c, { enabled: true, labelEnabled: true }])),
};
```
Reuse `STRUCTURE_CATEGORIES`.

**Handle contract** — structure ring + text axes under `handle.structures.*`:
```ts
// EngineStructuresHandle.d.ts
export type EngineStructuresHandle = {
  setItemEnabled(category: StructureCategory, enabled: boolean): void;   // ring/marker axis
  setLabelEnabled(category: StructureCategory, enabled: boolean): void;  // text axis
};
```
The module-scope setters keep their fade-dispatch bodies but write the new leaf:
- `setItemEnabled` → `structures.items[cat].enabled` + `fadeTo({kind:'markerLayer', category}, …)`.
- structures' `setLabelEnabled` → `structures.items[cat].labelEnabled` +
  `fadeTo({kind:'labelLayer', layer:'structure', category}, …)`. This is the
  `isStructureCategory(category)` branch of the old `setCategoryLabelVisible`
  (`engine.ts:284-292`); keep it registry-driven (no `=== 'famousGalaxy'`
  literal). The `galaxyNames` branch (`:275-283`) stays in
  `setCategoryLabelVisible` until A4 routes it to surveys.

**Value × time un-braid** (the design's core subtlety) — the boolean is the
authoritative gate, opacity is only the cosmetic alpha (survey idiom: draw while
*intended-visible OR still fading out*):

`produceStructureMarkers.ts:66-67` — today:
```ts
const catOpacity = fades.opacityOf({ kind: 'markerLayer', category: p.category }, now);
if (catOpacity === 0) continue;
```
After: read `state.settings.structures.items[p.category].enabled` and skip only
when `!enabled && catOpacity === 0`. `catOpacity` still scales the descriptor
alpha (`weightedFade` at `:121`). `state` is already in scope.

`produceStructureLabels.ts:96-103` — gate on
`structures.items[p.category].labelEnabled`; skip when `!labelEnabled &&
catOpacity === 0`. The anchor gate at `:111` (the ring's own `markerLayer`
opacity) stays; its gate boolean is `structures.items[cat].enabled`.

**Echo decision (documented):** keep `onMarkerCategoryVisibilityChange` /
`onLabelCategoryVisibilityChange` (`EngineCallbacks.d.ts:246-252`)
record-shaped — derive the record from the new `items`
(`Object.fromEntries(STRUCTURE_CATEGORIES.map(c => [c, items[c].enabled]))`) so
the React mirror's `markerCategoryVisibility` / `labelCategoryVisibility` record
state (`useEngineSettings.ts:179-193`) stays the panel's prop contract. Least
React churn; the settings shape changes, the React-facing record does not.

- [x] engineState type-smoke: `structures.enabled` + `structures.items[cat]`
  present; `markerCategoryVisibility` absent.
- [x] Structure-producer tests: `produceStructureMarkers draws a category whose
  enabled is false but whose fade opacity is still > 0` (fade-out tail);
  `produceStructureMarkers skips a category that is disabled AND fully faded`;
  mirror both for `produceStructureLabels` against `labelEnabled`; plus the
  load-in-not-refired guard test.
- [x] Handle-setter test: the marker + structure-label setters write the new
  `structures.items` leaf and fire the same fade handle as before.
- [x] Run fails.
- [x] Implement: add the cluster + seed; create `EngineStructuresHandle`; rewrite
  the marker setter + the structure half of the label setter; the un-braid in
  both producers; the fade seed, demand gate (BOTH halves), echo derivation,
  React rows; DELETE `markerCategoryVisibility` (type + seed + every ref).
  Didactic headers: why structures own both axes (independent ring vs text); why
  the boolean is the gate and opacity only the alpha.
- [x] Run typecheck → GREEN. Run the suite → GREEN.
- [x] Commit (one cohesive structures slice; `markerCategoryVisibility` gone).

### Task A4 — surveys slice (one green commit; folds famous label to settings)

Rename `points→surveys`, add the survey master + `items`, fold the famousGalaxy
label into `surveys.items.famousGalaxy.labelEnabled` (REMOVING the
`galaxyStore.famousLabelsVisible` flag entirely — see below), split the surveys
half of the handle, and DELETE `labelCategoryVisibility` + the `labels`/`points`
handle namespaces (all fully unread after this slice).

**Files:**
- Modify `src/@types/settings/EngineSettingsState.d.ts` — rename `points`
  cluster → `surveys`; add `surveys.enabled` (master) + `surveys.items:
  Record<SurveyId, SurveyItemSettings>`; DELETE `labelCategoryVisibility`. Imports:
  add `SurveyId` + `SurveyItemSettings`; drop `LabelCategory`.
- Create `src/@types/engine/data/SurveyId.d.ts` (see keying note below).
- Rename `src/@types/engine/handles/EnginePointsHandle.d.ts` →
  `EngineSurveysHandle.d.ts`; add `setLabelEnabled(survey: SurveyId, enabled)`.
- Delete `src/@types/engine/handles/EngineLabelsHandle.d.ts` (now fully folded —
  marker went to structures in A3, galaxyNames label goes to surveys here).
- Modify `src/@types/engine/EngineHandle.d.ts` — drop `points` + `labels`; add
  `surveys: EngineSurveysHandle`.
- Modify `src/services/engine/engine.ts` — rename the `points:` seed → `surveys:`
  with `enabled: true` + the registry-derived `items`; fold the `galaxyNames`
  branch of `setCategoryLabelVisible` into the surveys label setter (the FAMOUS
  removal below); the `surveys:` handle literal; delete the now-empty
  `setCategoryLabelVisible` shell + `labels:` handle literal.
- Modify the FAMOUS removal sites (see the dedicated checkbox list below).
- Modify `assetWiring.ts` — the demand gate's `labelCategoryVisibility` half
  (famousGalaxy is the only `bearsLabel` survey; route it to
  `surveys.items.famousGalaxy.labelEnabled`). Structure label half already moved
  in A3.
- Modify `useEngineSettings.ts` / `SettingsPanel.tsx` / `App.tsx` — the survey
  appearance knobs move cluster name (`points`→`surveys`); the famous-label row
  re-points to `handle.surveys.setLabelEnabled('famousGalaxy', …)`.
- Tests: `tests/@types/engineState.test.ts`; the famous-removal test edits below.

**Survey seed contract:**
```ts
surveys: {
  enabled: true,
  sizePx: DEFAULT_POINT_SIZE_PX, brightness: DEFAULT_BRIGHTNESS,
  depthFade: DEFAULT_DEPTH_FADE_ENABLED, highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
  realOnly: DEFAULT_REAL_ONLY_MODE,
  items: Object.fromEntries(SURVEY_IDS.map((id) => [id, { enabled: true, labelEnabled: true }])),
};
```
`labelEnabled` is inert for every survey except `famousGalaxy` (the others have
`bearsLabel:false`) — default it `true` uniformly so the seed needs no per-id
branch (the design: "surveys `labelEnabled` all true, inert except
famousGalaxy").

**Keying note — `SurveyId`** (carried from the design's flagged decision):
`SOURCE_IDS` includes filament + volume ids, so `Record<SourceId, …>` is too
loose for `surveys.items`. Add a tight survey-only `SurveyId` alias as a new
one-type file `src/@types/engine/data/SurveyId.d.ts` derived from the
survey-filtered registry (`SOURCE_ENTRIES.filter(type==='survey')`), so the
construction seed can fill exactly the survey keys and `EngineSurveysHandle.
setLabelEnabled` types its `survey` param tightly. This is the documented
decision — do NOT default to a loose `Record<SourceId,…>`.

**FAMOUS-LABEL fold — single source of truth (store flag fully removed).** After
A4 `famousLabelsVisible` / `setFamousLabelsVisible` do NOT exist anywhere; the
famous label's single source of truth is `surveys.items.famousGalaxy.labelEnabled`.
The verified footprint is exactly one runtime reader + one writer + tests:
- `src/@types/engine/data/GalaxyStore.d.ts:35` (`readonly famousLabelsVisible`)
  + `:45` (`setFamousLabelsVisible`) — REMOVE both (and the doc paragraph at
  `:27-34` describing the axis).
- `src/services/engine/data/createGalaxyStore.ts:25,34-35,49-50` — REMOVE the
  `let famousLabelsVisible`, the getter, and the setter.
- `src/services/engine/engine.ts:276` — the `galaxyNames` branch (now the surveys
  label setter) STOPS calling `galaxies.setFamousLabelsVisible(visible)`; instead
  it writes `state.settings.surveys.items.famousGalaxy.labelEnabled = visible`,
  fires the unchanged `fadeTo({kind:'labelLayer', layer:'galaxyNames'}, …)`, and
  `requestRender()`.
- `src/services/engine/presentation/produceFamousLabels.ts:179` — gate on
  `state.settings.surveys.items.famousGalaxy.labelEnabled` (survey idiom:
  `labelEnabled || opacity>0`) instead of `galaxies.famousLabelsVisible`. The
  producer ALREADY takes `state: EngineState` (`:167-170`) and reads
  `state.subsystems.fades`, so `state.settings` is in scope — NO param threading
  needed; just swap the gate expression and update the module-header prose
  (`:5-18`, `:175-177`) that names `galaxyStore.famousLabelsVisible` as the home.
- Tests: `tests/services/engine/data/createGalaxyStore.test.ts:32-38` — DROP the
  `famousLabelsVisible defaults true and the setter flips it` test.
  `tests/services/engine/setCategoryVisibleFade.test.ts:48,137,153` — DROP the
  `setFamousLabelsVisible` mock + REPLACE the two `toHaveBeenCalledWith`
  assertions with `expect(state.settings.surveys.items.famousGalaxy.labelEnabled)
  .toBe(false/true)` settings-write assertions.
  `tests/services/engine/presentation/produceFamousLabels.test.ts:110,123,137` —
  drive visibility via `settings.surveys.items.famousGalaxy.labelEnabled = false`
  instead of `state.data.galaxies.setFamousLabelsVisible(false)`.

> **Half-delete guard:** if a reader of `famousLabelsVisible` beyond the producer
> (the verified footprint is producer + setter + tests only) turns up at
> execution time, STOP and report — do NOT half-delete the flag.

**Handle contract** — the surveys handle keeps its 5 appearance setters and gains
the label axis:
```ts
// EngineSurveysHandle.d.ts (renamed from EnginePointsHandle)
setLabelEnabled(survey: SurveyId, enabled: boolean): void;   // famousGalaxy today
```
`EngineHandle.d.ts:46,56`: drop `points` + `labels`; add `surveys:
EngineSurveysHandle`. The `structures` namespace (A3) already owns the structure
axes — after A4 the old `labels` namespace is empty and deleted.

- [x] engineState type-smoke: `surveys.enabled` + `surveys.items[id]` (with
  `labelEnabled`) present; `points` + `labelCategoryVisibility` absent.
- [x] Construction test: `state.settings.surveys.items.sdss.enabled === true`,
  `…surveys.items.famousGalaxy.labelEnabled === true`, `surveys.enabled === true`.
- [x] FAMOUS tests rewritten per the footprint list above (store test dropped,
  fade-setter test asserts the settings write, producer test drives the settings
  flag).
- [x] Surveys handle-setter test: `handle.surveys.setLabelEnabled('famousGalaxy',
  false)` writes `surveys.items.famousGalaxy.labelEnabled` + fires the
  `galaxyNames` fade.
- [x] Run fails.
- [x] Implement: rename cluster + handle; add `SurveyId` + the survey master +
  `items` seed; fold the galaxyNames label branch into the surveys setter and
  REMOVE the store flag everywhere per the footprint; re-point the demand gate's
  label half, the React appearance knobs + famous-label row; DELETE
  `labelCategoryVisibility`, `EngineLabelsHandle`, the `labels`/`points` handle
  namespaces. Didactic headers: why famous's label lives under surveys (it's a
  survey, not a structure); why a tight `SurveyId` over loose `SourceId`.
- [x] Run typecheck → GREEN. Run the suite → GREEN.
- [x] Commit (one cohesive surveys slice; store flag + flat label record gone).

### Task A5 — Phase A entanglement spot-check

**Files:** none (review only).

- [x] Quick `entanglement-radar` pass over the Phase A diff: confirm no flat
  visibility records remain (`labelCategoryVisibility` / `markerCategoryVisibility`
  both gone), the handle is split (`surveys` / `structures`, no `labels`
  namespace owning two axes), the structure producers gate on the boolean (not
  opacity-as-gate), `famousLabelsVisible` is fully removed (single source of truth
  = `surveys.items.famousGalaxy.labelEnabled`), and no `=== 'famousGalaxy'`
  literal crept in (registry-driven routing preserved). Record findings for the
  final A+B radar (Task B5).
  - **Result:** all five invariants PASS. Two accidental residuals found and
    fixed in commit `171ac649`: (a) dead export `LABEL_LAYER_BY_CATEGORY`
    (orphaned when A4 folded its consumer into the registry-driven survey label
    setter); (b) over-broad `Pick<…, 'data'|…>` on `setSurveyLabelEnabled` (never
    reads `state.data`). No braids remain in Phase A; carry nothing to B5.

---

## Phase B — derive drawMask from `surveys.items[].enabled`

`surveys.items[id].enabled` becomes the single source of truth for survey
on/off; the bitmask is DERIVED, never independently mutated by a setter. The
async fade-out-then-clear-bit dance collapses into the survey idiom.

### Task B1 — map every reader of `drawMask` / `pickMask` (REQUIRED FIRST)

**Files:** none (investigation; record the map in the PR description / this
plan's appendix as a comment).

Grep + read every consumer. As of authoring (re-verify — names not lines):
- `state.sources.drawMask` readers:
  - `src/services/engine/frame/runFrame.ts` — 4 sites: `proceduralDisks.runFrame`,
    `hiResFamous.runFrame`, `texturedDisks.runFrame` (each as `visibleSourceMask`),
    and `renderFrame({ settings: { visibleSourceMask } })`.
  - `src/services/engine/wiring/buildDemandCtx.ts` — `isVisible(s) = maskHas(drawMask, s)`.
  - `src/services/engine/wiring/createSyntheticFallback.ts` — `hiddenAtBoot = !maskHas(drawMask, …)`.
  - `src/services/engine/phases/wireInput.ts` — UI seed `visibleSourceMask`.
- `state.sources.pickMask` readers:
  - `src/services/engine/frame/runFrame.ts` — 2 sites (pick-debug overlay + hover
    pick), both via `collectPickTargets(…, pickMask, …)`.
  - `src/services/engine/helpers/collectPickTargets.ts` — `((pickMask >> s.source) & 1)`.
- Writers (to be removed / re-homed): `setSourceVisibleImpl` (engine.ts), the
  construction seed (`pickMask: ALL_VISIBLE_MASK, drawMask: ALL_VISIBLE_MASK`),
  `setTier` if it touches the masks (verify).

**Decision — derivation strategy.** Two options:

- **Option 1 — compute-at-each-consumer.** Each reader computes the mask inline
  from `surveys.items` + fade opacities. Pro: no stored field, zero parallel
  truth. Con: the derivation (boolean OR opacity>0 per survey, packed via
  `maskWith`) is duplicated across ~6 sites with subtly different needs (draw
  wants `enabled || opacity>0`; pick wants `enabled` only) — re-braids the same
  computation everywhere; high regression surface.
- **Option 2 — recompute the `drawMask`/`pickMask` fields once per frame as a
  derived cache.** A single derivation step at the top of `runFrame` (before any
  consumer reads them) recomputes `state.sources.drawMask` =
  pack(surveys where `enabled || fadeOpacity>0`) and `state.sources.pickMask` =
  pack(surveys where `enabled`), from `surveys.items` + the per-survey
  `{kind:'survey', source}` fade opacity. Every existing consumer reads the field
  unchanged. Pro: ONE derivation site; consumers untouched; the field is now an
  *output* of the derivation, never written by a setter. Con: the field still
  exists as storage — acceptable PER THE DESIGN'S CONSTRAINT *only because* no
  setter writes it (it's a per-frame-recomputed cache, an output of the
  derivation step).

**Pick Option 2**, reasoning: it honours "settings is the single source of
truth; NO setter independently mutates a stored drawMask" — the only writer
becomes the per-frame derivation, which is a pure function of settings + fades.
It also keeps the hot-loop consumers reading a packed int (no per-survey branch
in the render path) and confines the change to one new derivation helper + the
setter collapse, vs. touching 6 read sites. The drawMask/pickMask fields stay on
`EngineSourceState` but their doc is rewritten: "derived output, recomputed each
frame from `settings.surveys.items` + survey fades; never written by a setter."

- [x] Record the verified reader map (names + files) and the chosen strategy in
  the PR description. No code in this task.

**Verified reader/writer map (as of execution):**
- `drawMask` readers: `runFrame.ts:204,217,226,276` (`visibleSourceMask` ×4),
  `buildDemandCtx.ts:42` (`isVisible`), `createSyntheticFallback.ts:80`
  (`hiddenAtBoot`), `wireInput.ts:296` (UI seed), **`engine.ts:968` (`setTier`
  reload loop — non-frame, beyond the plan's original list)**.
- `pickMask` readers: `runFrame.ts:326,393` (via `collectPickTargets`),
  `collectPickTargets.ts:50`, `wireInput.ts:206` (click-resolver closure — reads
  LIVE at click time, NOT captured at bootstrap).
- Writers (to remove): `setSourceVisibleImpl` (`engine.ts:216-243`, the immediate
  pickMask flip + post-fade drawMask flips) + the construction seed
  (`engine.ts:494-495`). No `setTier` mask WRITE (it only reads).

**Strategy — Option 2, refined:** one `deriveSourceMasks(state)` is the sole
writer, called (a) at `runFrame` top before any mask read, AND (b) synchronously
inside `setSourceVisible` after the `enabled` flip, before `reevaluateDemand` —
so `setTier`/demand/pick readers are correct without a frame delay. Construction
seed STAYS `ALL_VISIBLE_MASK` (not `0`): the bootstrap demand eval reads
`drawMask` before frame 1, so `0` would load nothing at boot
(see [[feedback_lifecycle_vs_teardown_invariants]]); all-enabled defaults derive
to `ALL_VISIBLE_MASK` regardless, and the per-frame derive owns it from frame 1.

### Task B2 — `deriveSourceMasks` per-frame derivation step

**Files:**
- Create `src/services/engine/frame/deriveSourceMasks.ts` (one-function-one-file)
- Modify `src/services/engine/frame/runFrame.ts` (call it first, before any
  mask read)
- Modify `src/@types/engine/state/EngineSourceState.d.ts` (rewrite the
  drawMask/pickMask docs to "derived output")
- Test `tests/services/engine/frame/deriveSourceMasks.test.ts`

**Signature:** `deriveSourceMasks(state: Pick<EngineState, 'sources' | 'settings' | 'subsystems'>): void`
— recomputes `state.sources.drawMask` and `state.sources.pickMask` in place from
`settings.surveys.items[id].enabled` and the per-survey
`fades.opacityOf({kind:'survey', source})`.

**Behaviour:** for each survey source code, set the draw bit when
`items[id].enabled || opacityOf(survey) > 0` (draw through the fade-out tail);
set the pick bit when `items[id].enabled` (clickable only while intended-visible).
Map survey `id` ↔ source `code` via the registry (the `{kind:'survey', source}`
handle keys on the numeric `Source` code; `items` keys on `SourceId` — bridge
through `SOURCE_ENTRIES`). Pack with `maskWith` starting from `0` (NOT
`ALL_VISIBLE_MASK` — derive only the survey bits; confirm non-survey codes'
bits are irrelevant to the consumers, which they are: every consumer filters by
survey source).

- [x] Add test `deriveSourceMasks sets draw+pick bits for an enabled survey`.
- [x] Add test `deriveSourceMasks keeps the draw bit but clears the pick bit for
  a disabled survey still fading out (opacity > 0)` — the core derivation
  invariant (drawn-while-fading, unclickable-on-hide).
- [x] Add test `deriveSourceMasks clears both bits for a disabled, fully-faded survey`
  (+ `derives exactly ALL_VISIBLE_MASK when every survey enabled`).
- [x] Run fails.
- [x] Implement the helper. **NOTE:** the `runFrame` wiring is DEFERRED to B3 —
  wiring it while the old setter still mutates masks (and never flips `enabled`)
  would break toggling. B2 is the additive helper + unit test only. Didactic
  header explains single-writer + draw/pick divergence.
- [x] Run passes.
- [x] Commit.

### Task B3 — collapse `setSourceVisibleImpl` into the synchronous survey idiom

**Files:**
- Modify `src/services/engine/engine.ts` (`setSourceVisibleImpl` ~198-242, the
  construction seed of `pickMask`/`drawMask` ~483-484, the `sources.setVisible`
  handle literal ~939, the `EngineSourcesHandle` type)
- Modify `src/@types/engine/handles/EngineSourcesHandle.d.ts` (`setVisible`
  return type — no longer a Promise if the async-ness is gone)
- Modify `tests/services/engine/setSourceVisibleFade.test.ts` (rewrite — see B4)

**Contract** — replace the async dance with a synchronous flip + fade-fire:
```ts
// was: async setSourceVisibleImpl(...) : Promise<void>
// now: setSourceVisible(state, opts, source, visible): void  (rename — no async)
```
Body: flip `state.settings.surveys.items[id].enabled = visible` synchronously;
fire `fades.fadeTo({kind:'survey', source}, visible?1:0, visible?FADE_IN:FADE_OUT)`
(fire-and-forget, no `await`); `requestRender()`. NO pickMask/drawMask
assignment (the per-frame `deriveSourceMasks` now owns both); NO last-issued-wins
re-read (re-showing mid-fade just sets `enabled=true`; the derivation keeps
drawing it). The echo `cb.sources?.onMaskChange?.(…)` — **decide:** the mask is
no longer mutated here; if the React mirror needs the new visibility, echo the
derived mask (call `deriveSourceMasks` then echo `state.sources.drawMask`) OR
switch the echo to the settings boolean. Prefer echoing the survey's settings
state to keep the React mirror in sync without forcing a derivation here;
document the choice. Construction seed: drop the `pickMask`/`drawMask` literals
to `0` (or leave `ALL_VISIBLE_MASK` — they're recomputed frame 1 by
`deriveSourceMasks` before first read; **prefer `0`** so a stale value can't leak
if derivation is ever skipped, and document that the fields are derived).

Rename the export/test-alias `setSourceVisibleForTest` accordingly; rename
`sources.setVisible`'s return to `void`. Update `EngineSourcesHandle.setVisible`
doc (no longer returns a Promise; callers drop the `void` fire-and-forget).

- [x] (test rewrite in B4) Run typecheck after the impl edit; fix call sites that
  awaited `setVisible` (grep for `await …setVisible` / `.setVisible(`).
- [x] Implement the synchronous setter + seed + handle changes. **NOTE:** the
  setter ALSO calls `deriveSourceMasks(state)` synchronously (not just runFrame) so
  a same-tick reader — `setTier`, the demand eval, the `onMaskChange` echo — sees
  fresh masks; `runFrame` calls it before `reevaluateDemand`. Construction seed kept
  `ALL_VISIBLE_MASK` (boot value).
- [x] Commit (B3+B4 landed together as one green commit `422fd221`).

### Task B4 — rewrite `setSourceVisibleFade.test.ts` to the new model

**Files:**
- Modify `tests/services/engine/setSourceVisibleFade.test.ts`

These tests pin the OLD async ordering (pickMask-immediate, await fade-out, clear
drawMask, last-issued-wins). That model is gone — the tests are **rewritten to
the new behaviour, not preserved verbatim**. New assertions:
- [x] `setSourceVisible flips surveys.items[id].enabled synchronously` (no await).
- [x] `setSourceVisible fires fadeTo(0, FADE_OUT) on hide` / `fadeTo(1, FADE_IN) on show`.
- [x] `a hidden survey still fading out is DRAWN via deriveSourceMasks` — drive
  `enabled:false` + `opacityOf:()=>0.5`, run `deriveSourceMasks`, assert the draw
  bit is set and the pick bit is clear (clickability off on hide).
- [x] `re-show mid-fade sets enabled=true and keeps drawing` — replaces the old
  "last-issued wins drawMask" case: toggle off then on; assert
  `items[id].enabled === true` and (after `deriveSourceMasks`) both bits set. No
  await, no re-read.
- [x] Run passes (landed paired with B3 in one green commit; +`onMaskChange` echo case).

> `src/utils/sourceMask.ts` helpers (`maskWith`/`maskWithout`/`maskHas`/
> `ALL_VISIBLE_MASK`) are KEPT — `deriveSourceMasks` uses them to PACK the
> derived bitmask. Only the independent *mutation* of the stored mask by a setter
> is removed.

### Task B5 — entanglement-radar over the whole A+B diff

**Files:** none (review only).

- [x] Run the `entanglement-radar` skill over the full PR diff. Confirm:
  - every per-entity visibility is `settings.<type>.items[id].enabled`; no flat
    root visibility records remain. ✅
  - `drawMask`/`pickMask` are written by exactly ONE site (`deriveSourceMasks`),
    a pure function of settings + fades; no setter mutates them. ✅ (only writes
    are `deriveSourceMasks.ts:56-57`; `engine.ts:350-351` is the boot seed;
    setters don't import `maskWith`/`maskWithout`.)
  - the structure producers gate on the settings boolean, not opacity-as-gate. ✅
  - the handle is split (surveys / structures), no `labels` namespace owning two
    axes; routing stays registry-driven (no `=== 'famousGalaxy'` literals). ✅
  - any residual second-write-path or knot is NAMED in the PR description, not
    hidden.
- [x] Record the result (clean pass or named residuals) for the downstream
  snapshot/restore-seam plan to build on.
  - **Result: CLEAN PASS, no residuals.** Phase-A's two accidental residuals
    (dead `LABEL_LAYER_BY_CATEGORY`, over-broad `Pick`) were fixed in A5
    (`171ac649`). Bonus decomplection: the handle setters were extracted from the
    1487-line `engine.ts` into `services/engine/handles/` (one file each), so the
    orchestrator no longer owns them.

---

## Self-review notes

- **Spec coverage:** Phase A implements the design's "PR-1" (the `items` shape,
  `points→surveys` with knobs+items+`labelEnabled`, structures `enabled`+
  `labelEnabled`, volumes `masterEnabled→enabled`/`fields→items`, the value×time
  un-braid, the handle split, panel + `useEngineSettings` + demand-gate updates).
  Phase B implements "PR-2" (derive `drawMask` from `surveys.items[].enabled`,
  collapse `setSourceVisibleImpl`). Folded into one PR per the dispatch.
- **Phase A is green at every commit via vertical slices per source-type**
  (volumes → structures → surveys). Each slice migrates type + seed + readers +
  writers + handle + React together and DELETES the old field within the same
  slice once it is fully unread (`markerCategoryVisibility` in A3,
  `labelCategoryVisibility` + the `labels`/`points` handle namespaces + the famous
  store flag in A4). There is no type-only RED window and no transient dual-shape.
  The one ordering risk to watch (called out in A3): the demand gate's
  `labelCategoryVisibility[cat]` half must keep reading the OLD record through the
  structures slice — only the `markerCategoryVisibility[cat]` half flips in A3;
  the label half flips in A4. Don't delete `labelCategoryVisibility` early.
- **Subtlety 1 — value × time un-braid (A3):** today `produceStructureMarkers`/
  `produceStructureLabels` read `fades.opacityOf` as BOTH gate (`if opacity===0
  continue`) AND alpha. After: the settings boolean is the gate (`!enabled &&
  opacity===0 → skip`, the survey idiom), opacity is only the cosmetic alpha. The
  single thing most likely to regress; the structures slice's tests pin the
  fade-out-tail and disabled-and-faded cases.
- **RESOLVED — famous-label single source of truth (A4):** the
  `galaxyStore.famousLabelsVisible` flag is FULLY removed (type + factory + setter
  + setter-call in `engine.ts` + tests). The famous label's single source of truth
  is `settings.surveys.items.famousGalaxy.labelEnabled`; `produceFamousLabels`
  gates on it (the producer already takes `state`, so no param threading). No
  store-flag mirror, no second gate. The verified footprint is producer + setter +
  three test files; a half-delete guard in A4 says STOP if any other reader
  surfaces.
- **Subtlety 2 — async-collapse + test rewrite (B3/B4):** `setSourceVisibleImpl`
  is async (flips pickMask now, awaits fade-out, clears drawMask with a
  last-issued-wins re-read). It collapses to a synchronous `enabled`-flip +
  fade-fire; the derivation (B2) keeps drawing while `enabled || opacity>0` and
  disables pick on hide. `setSourceVisibleFade.test.ts` PINS the old ordering and
  is **rewritten to the new model, not preserved** — B3/B4 may need to land in
  one commit to stay green.
- **drawMask-reader-map dependency (B1):** the derivation strategy depends on the
  full reader map; B1 is the REQUIRED first task. Option 2 (per-frame recompute
  of the same field as a derived output) is chosen over Option 1
  (compute-at-each-consumer) because it gives ONE derivation site that honours
  "no setter mutates a stored mask", keeps the hot loop reading a packed int, and
  touches one helper instead of six read sites. The field stays on
  `EngineSourceState` but is re-documented as a per-frame derived output.
- **Line-numbers-will-drift caveat:** every `engine.ts:NNN` / `*.ts:NN-MM`
  citation is approximate as of authoring; implementers MUST re-verify by reading
  the current file. The setters/seeds are findable by name.
- **Under-specified spots flagged for implementer judgement (documented, not
  dodged):** (a) `surveys.items` keys on a new survey-only `SurveyId` alias, NOT
  the loose `SourceId` union (A4 — `SOURCE_IDS` includes filament/volume ids);
  (b) the echo callbacks stay record-shaped, derived from the new `items` (A3 —
  least React churn); (c) `EngineVolumesHandle.setMasterEnabled` keeps its handle
  method name despite the settings `masterEnabled→enabled` rename (A2 — handle
  name and settings leaf vary independently); (d) the `onMaskChange` echo's
  replacement after the mask stops being setter-mutated (B3 — prefer echoing the
  settings boolean).

---

> **Execution handoff:** run this plan via `superpowers:subagent-driven-development`
> (fresh implementer subagent per task, dispatched in the background; spec +
> quality review per task). The MAIN thread runs `npm test` / `npm run typecheck`
> and makes the commits; implementers edit files only. Phase A keeps the suite
> green at EVERY commit — one vertical slice per source-type (volumes →
> structures → surveys), each deleting the field it replaces within the same
> slice; no RED window. Phase B's B3/B4 may land as one green commit.
