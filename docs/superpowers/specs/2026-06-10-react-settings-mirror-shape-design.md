# React settings mirror shape — design (follow-up)

> Status: **agreed design, DEFERRED to its own PR.** Surfaced during the
> settings-by-source-type PR (#295) review: now that the engine clusters
> settings by source-type with per-entity `items[id]`, the React mirror in
> `useEngineSettings` still carries the *old* flat category records, bridged by
> a translation layer. This spec captures the un-braiding so it survives
> context compaction; the implementation is a separate PR after #295 merges.
> It is NOT implemented in #295.

## Why

The engine reshape (#295) moved every per-entity visibility to a uniform
`settings.<sourceType>.items[id]` shape and **de-conflated** the famous-galaxy
label (a *survey*) from the structure-category labels (different clusters). The
React mirror did not follow — it still holds two flat records and a bridge:

| Concern | Engine (authoritative, post-reshape) | React mirror (`useEngineSettings`) |
|---|---|---|
| Structure ring on/off | `settings.structures.items[cat].enabled` | `markerCategoryVisibility[cat]` (flat `Record<StructureCategory, bool>`) |
| Structure label on/off | `settings.structures.items[cat].labelEnabled` | `labelCategoryVisibility[cat]` |
| Famous-galaxy label on/off | `settings.surveys.items.famousGalaxy.labelEnabled` | `labelCategoryVisibility.famousGalaxy` |

Two strands are braided — **the mirror's shape vs the engine's shape**:

1. **A translation layer exists only to bridge the shapes.**
   `deriveMarkerCategoryVisibility` / `deriveLabelCategoryVisibility`
   (`src/services/engine/helpers/`) project the nested `items` into the flat
   records, fired through `onMarkerCategoryVisibilityChange` /
   `onLabelCategoryVisibilityChange`. They have no other purpose.

2. **The flat `labelCategoryVisibility` record re-conflates what the reshape
   separated.** It is keyed by `LabelCategory` = `famousGalaxy` + the structure
   categories, so `deriveLabelCategoryVisibility` *merges* `structures.items`
   and `surveys.items.famousGalaxy` back into one record — re-introducing the
   famous/structure mixing that A4 dissolved on the engine side.

**The cost:** two helpers + a re-conflation that exist purely because the React
mirror's shape was chosen independently of the engine's. A reader tracing
"where does the structure-label checkbox state live?" hits four homes (engine
item, derive helper, echo callback, React record) instead of one mirrored pair.

## Target model — React mirrors the engine's per-cluster item shape

`useEngineSettings` holds the same per-entity shape the engine owns, and the
echo carries the **authoritative items** (copy-on-write) rather than a derived
projection:

```ts
// React mirror state (replaces the two flat records)
structures: Record<StructureCategory, { enabled: boolean; labelEnabled: boolean }>;
//   ↑ mirrors settings.structures.items 1:1
famousLabelEnabled: boolean;
//   ↑ mirrors settings.surveys.items.famousGalaxy.labelEnabled (the only survey label today)
```

- Each handle setter echoes **its own cluster's** authoritative state, not a
  cross-cluster merge:
  - `setStructureItemEnabled` / `setStructureLabelEnabled` →
    `cb.structures.onItemsChange({ ...state.settings.structures.items })`.
  - `setSurveyLabelEnabled` → `cb.surveys.onLabelEnabledChange(survey, enabled)`
    (or echoes the famous-label boolean). The two structure axes share **one**
    echo (the items record) instead of two parallel records.
- **Both derive helpers are deleted** (`deriveMarkerCategoryVisibility`,
  `deriveLabelCategoryVisibility`) — the mirror matches the source, so there is
  nothing to translate.
- **The SettingsPanel composes its own views.** The panel renders "all label
  toggles in one list" and "all marker toggles in one list"; that grouping is a
  *view* concern, so the panel derives it (a small `useMemo` / inline map) from
  `structures` + `famousLabelEnabled`, rather than the engine pre-merging a flat
  record. View-composition belongs in the view, not in an engine helper.

## Key decisions

- **Panel composes the unified label list** (recommended, pending review).
  Famous-label and structure-labels stay in their separate engine clusters all
  the way to the view; the panel branches `isStructureCategory(cat)` when
  rendering the label rows. The alternative — keeping a merged
  `labelCategoryVisibility` record fed by a derive helper — is exactly the
  re-conflation this un-braiding removes, so it is rejected.
- **Famous label as a survey-cluster field.** `famousLabelEnabled` (or a
  `surveys.items.famousGalaxy` mirror) lives under the surveys concern, not
  among structures — matching the engine.
- **Echo carries authoritative items, copy-on-write.** The setter spreads
  `state.settings.structures.items` into the echo so React gets an immutable
  snapshot; no `derive*` projection.
- **Scope: the category-visibility records only.** The other flat fields in the
  React mirror (`pointSize → surveys.sizePx`, `exposure → tonemap.exposure`,
  `volumesEnabled → volumes.enabled`, …) are simple scalars echoed 1:1 with no
  translation layer — a flat-vs-nested *naming* difference, not a braid with a
  cost. Reshaping the whole React `settings` bag to mirror every engine cluster
  is lower-value naming churn and is **explicitly out of scope** here (revisit
  separately if desired).

## Blast radius (~12 files)

- `src/hooks/useEngineSettings.ts` — replace the two `useState` records with the
  new mirror shape; rewire the echo subscriptions.
- `src/@types/settings/UseEngineSettingsState.d.ts` (+ `UseEngineSettingsReturn`)
  — the two record fields → the new shape.
- `src/@types/engine/EngineCallbacks.d.ts` (+ `EngineSettingsCallbacks`) — the
  `labels.onMarker/LabelCategoryVisibilityChange` echoes → `structures.onItemsChange`
  + a surveys label echo.
- `src/services/engine/handles/setStructureItemEnabled.ts` /
  `setStructureLabelEnabled.ts` / `setSurveyLabelEnabled.ts` — echo the
  authoritative items instead of calling the derive helpers.
- `src/services/engine/phases/wireInput.ts` + `wiring/seedSettingsCallbacks.ts`
  — the init seed echoes the new shape.
- `src/components/SettingsPanel/SettingsPanel.tsx` (~6 sites) — read
  `structures[cat].{enabled,labelEnabled}` + `famousLabelEnabled`; compose the
  label-list view; the count reducers + checkboxes.
- `src/components/App/App.tsx` — prop passing (the write-side routing already
  targets `handle.structures.*` / `handle.surveys.setLabelEnabled`, unchanged).
- **Delete** `src/services/engine/helpers/deriveMarkerCategoryVisibility.ts` +
  `deriveLabelCategoryVisibility.ts` and their tests.
- Update `tests/services/engine/setCategoryVisibleFade.test.ts`,
  `wiring/seedSettingsCallbacks.test.ts`, and any fixture asserting the old echo
  records.

## Sequencing

Lands as its own simplify PR **after #295 merges** (base `main`). It is one
coherent un-braiding (the category-visibility mirror shape); keeping it off #295
preserves that PR's verified state and keeps each decomplection reviewable on
its own.
