# Settings-by-source-type — design

> Status: **agreed design, awaiting plan + execution.** Captured 2026-06-10 from a
> live decomplection discussion so it survives context compaction. This is the
> source of truth for the reshape; the older
> `2026-06-08-settings-visibility-seam.md` plan was written against the *flat*
> category-record shape and must be **revised to this model** before execution.

## Why

`labelCategoryVisibility` / `markerCategoryVisibility` are the only `Record<…, boolean>`
settings sitting **flat at the root** — every other setting nests under a cluster.
The deeper fact the reader/writer map surfaced: **label & marker categories are
`SOURCE_ENTRIES`** (`LABEL_CATEGORIES = SOURCE_ENTRIES.filter(bearsLabel)`,
`STRUCTURE_CATEGORIES = SOURCE_ENTRIES.filter(type==='structure')`) — the *same*
registry that drives surveys and volumes. Yet that one registry's entries store
visibility in four different shapes:

| Source type | visibility today | where |
|---|---|---|
| Survey points | `drawMask` / `pickMask` bitmask | `state.sources` (NOT settings) |
| Volume field | `settings.volumes.fields[id].enabled` | settings (per-entity) |
| Structure ring (marker) | `markerCategoryVisibility[cat]` → fade opacity | flat root record |
| Structure / famous label | `labelCategoryVisibility[cat]` → fade opacity | flat root record |

Three braided knots fall out:

1. **Shape** — the two category records are flat at the root; everything else nests.
2. **Handle overload** — `handle.labels` owns *both* `setCategoryLabelVisible` and
   `setCategoryMarkerVisible`; its own doc apologises for it.
3. **Value × time** — category visibility lives as *both* a settings boolean (read by
   the demand gate + the React panel) *and* a fade opacity (read by the producers as
   `if (catOpacity === 0) continue` + the alpha). Two sources of truth, hand-synced.

Plus a fourth, simpler one the user named: **`settings.points` is mislabeled** — those
knobs (`sizePx`, `brightness`, …) are the *survey* point renderer (structures use
markers, volumes raymarch), so the cluster is really `settings.surveys`.

## The target model — settings grouped by source type, uniform per-item shape

```ts
// the shared base every data item has
type DataItemSettings = {
  enabled: boolean;            // the item's PRIMARY visibility
};

type SurveyItemSettings = DataItemSettings & {
  labelEnabled: boolean;       // surveys can bear labels (famous today)
};

type StructureItemSettings = DataItemSettings & {
  labelEnabled: boolean;       // a structure category: enabled = ring/marker, labelEnabled = text
};

type VolumeFieldSettings = DataItemSettings & {
  // ...existing per-field knobs (intensity, palette, …)
};

settings.surveys: {
  enabled: boolean;                                   // survey-layer master
  sizePx; brightness; depthFade; highlightFallback; realOnly;   // ← was settings.points
  items: Record<SurveyId, SurveyItemSettings>;        // registry-derived; famous has labelEnabled
};

settings.structures: {
  enabled: boolean;                                   // structures master (for symmetry)
  items: Record<StructureCategory, StructureItemSettings>;
};

settings.volumes: {
  enabled: boolean;                                   // ← rename masterEnabled → enabled
  items: Record<VolumeFieldId, VolumeFieldSettings>;  // ← rename fields → items
};
```

Why this is right: every per-entity visibility is now `settings.<sourceType>.items[id].enabled`,
with `labelEnabled` as the optional label axis on the types that bear labels. A
structure category co-locates its ring (`enabled`) and text (`labelEnabled`) in one
row instead of two parallel flat records. famousGalaxy stops being conflated into a
structure record — it's a *survey*, so its label is `surveys.items[famous].labelEnabled`.

## Key decisions

- **`DataItemSettings` base with `enabled`.** Visibility is the only universal axis;
  no `{ enabled }`-wrapping-a-single-boolean debate — the base IS that object, and
  label-bearing types add `labelEnabled`. Volumes' existing per-field knobs ride on
  top via `VolumeFieldSettings extends DataItemSettings`.
- **`drawMask` becomes DERIVED, not stored.** `settings.surveys.items[id].enabled` is
  the single source of truth for survey on/off. The bitmask is computed at the
  consumer (the renderer/pick path packs the bits right where the hot loop reads
  them) — a pure function of settings, not a parallel mutable mirror. This is
  expected to **simplify** `setSourceVisibleImpl`: its async fade-out-then-clear-bit
  dance collapses into the survey idiom (flip `enabled`, fire fade; consumer draws
  while `enabled || opacity > 0`).
- **Value × time un-braid (the old "S2b").** The structure producers
  (`produceStructureMarkers`, `produceStructureLabels`) read the **boolean** as the
  authoritative gate (`!enabled && opacity === 0 → skip`, the survey idiom); fade
  opacity becomes *only* the cosmetic alpha ramp. Behaviour-preserving: at rest the
  setter drives opacity to match the boolean, and defaults are all-true.
- **famousGalaxy label** moves from the structure label record to
  `surveys.items[famous].labelEnabled`. `produceFamousLabels` reads `surveys`,
  `produceStructureLabels` reads `structures` only.
- **Handle reshape** follows the settings: `handle.surveys.*`, `handle.structures.*`
  (split the overloaded `labels` handle: marker vs label become item axes under the
  structures namespace, e.g. `setItemEnabled` / `setLabelEnabled`).
- **Out of scope (this pass):** `settings.bias` and `settings.thumbnails` are
  survey-adjacent but stay their own clusters — folding them balloons the blast
  radius for little gain. `tonemap` / `camera` / `debug` / singleton overlays
  (`milkyWay` / `filaments` / `flow`) are render-stage / overlay concerns, not
  source-types — they stay.

## Reader/writer geography (from the Explore map, post-#288)

- **Writers / defaults:** seeded all-true at construction — `engine.ts:452-462`
  (`Object.fromEntries(LABEL_CATEGORIES…)` / `STRUCTURE_CATEGORIES…`); React mirror
  `useEngineSettings.ts:179-193`; setters `engine.ts:293-296` (label) / `317-320`
  (marker) + echo callbacks `297-299` / `321-323`; bootstrap seed
  `seedSettingsCallbacks.ts:69-70`, `wireInput.ts:295-296`.
- **Readers:** producers `produceStructureMarkers.ts:66-67,121` /
  `produceStructureLabels.ts:99-102,176` (read `fades.opacityOf`, NOT the boolean —
  the value×time braid); fade seed `registerOverlayFades.ts:98-106` (boolean →
  opacity at boot); demand gate `assetWiring.ts:186-190`
  (`markerCategoryVisibility[cat] || labelCategoryVisibility[cat]`); panel
  `SettingsPanel.tsx:456-458,477-479,816,850`; `App.tsx:64-65,240-241`.
- **Handle:** `EngineLabelsHandle.d.ts:26,40` — the overloaded `labels` namespace.

## #288 renames this work must use (poi-free already landed)

- Label-layer fade id: `{kind:'labelLayer', layer:'structure', category}` (was
  `layer:'poi'`). `LabelLayerId = 'youAreHere' | 'structure' | 'galaxyNames' | 'scaleBar'`
  (`src/@types/animation/LabelLayerId.d.ts:21`).
- Structure marker styles: `STRUCTURE_MARKER_STYLES`
  (`src/services/engine/presentation/structureMarkerStyles.ts:66`) — was
  `STRUCTURE_POI_STYLES`.
- `LABEL_CATEGORIES` `src/data/labelCategories.ts`; `STRUCTURE_CATEGORIES`
  `src/data/structureCategories.ts`; both from `SOURCE_ENTRIES`.

## Phasing

Recommended two PRs (the user leans "drawMask-derived is easy" — PR-2 may be small):

- **PR-1 — settings-by-source-type reshape.** The clusters + `DataItemSettings` /
  `items` shape; `points → surveys` (knobs + items + `labelEnabled`); structures'
  `enabled` + `labelEnabled` rows; volumes rename (`masterEnabled→enabled`,
  `fields→items`); the value×time un-braid in the producers; handle reshape; panel +
  `useEngineSettings` + demand-gate updates. No mask machinery touched (survey
  `items[].enabled` exists, but `drawMask` still derived from `state.sources` for now
  OR wired in PR-2 — decide at plan time).
- **PR-2 — derive `drawMask` from `surveys.items[].enabled`.** Make settings the
  single truth, compute the bitmask at the consumer, collapse `setSourceVisibleImpl`
  into the survey idiom; update pick/selection/`{kind:'survey'}` fades/demand.

## Sequencing (whole tour effort)

1. Camera-driver authority — **PR #286 open** (done).
2. **This reshape (PR-1, maybe +PR-2)** — foundation.
3. Snapshot/restore seam (`VisibilitySnapshot` / `readVisibility` / `applyVisibility`)
   — **rebuilt on this shape** (the old S1/S2 were on the deleted `PoiCategory`; old
   branch `settings-visibility-seam` kept as backup reference only).
4. Cinematic tour seed (camera core + tour subsystem).

Branch state at capture: `settings-seam` = latest `main` (#290) + the pre-tour docs
commit; working tree clean. The earlier S1/S2/S2b commits are NOT on this branch
(they referenced the now-deleted `PoiCategory`); reflog SHAs `f6236c19`/`691b8921`/`6b911fd3`.
