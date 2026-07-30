# Body sources bear labels

**Status:** approved design, spec'd 2026-07-28. Every decision below was settled in
[`docs/grill-sessions/body-sources-bear-labels-2026-07-28.md`](../../grill-sessions/body-sources-bear-labels-2026-07-28.md)
(9 questions, with the rejected alternatives recorded there). This spec is written against
that transcript and against the code as it stands; it does not re-open settled questions.
Where the code contradicted a claim made during the grill, the correction is recorded in
"Corrections to the grill record" at the end.

## Problem

`FAMOUS_STAR_ENTRY`, `PLANET_ENTRY`, and `EARTH_ENTRY` are `SOURCE_REGISTRY` rows that
render text captions through `foregroundLabelsLayer` — yet all three carry
`bearsLabel: false`, each with the same justification:

> Bodies bypass the COSMO label/marker systems — star captions ship through the
> foreground-labels layer — so neither capability flag is set.

The flag is being set from an **implementation-routing fact** rather than the capability it
names. `LABEL_CATEGORIES` defines `bearsLabel` as "every source that renders a text label in
the 3D scene", which is false for these three rows.

Two consequences follow.

**Their label gates were exiled.** Every other label-bearing source co-locates its two axes:

| Source         | Layer gate                                  | Label gate                            |
| -------------- | ------------------------------------------- | ------------------------------------- |
| `milkyWay`     | `milkyWay.enabled`                          | `milkyWay.labelEnabled`               |
| structures     | `structures.items[id].enabled`              | `structures.items[id].labelEnabled`   |
| `famousGalaxy` | `galaxyCatalogs.items.famousGalaxy.enabled` | `…famousGalaxy.labelEnabled`          |
| `famousStar`   | `famousStars.enabled`                       | `labels.starLabelsEnabled` ← exiled   |
| `planet`       | _(none — always drawn)_                     | `labels.planetLabelsEnabled` ← exiled |
| `earth`        | _(none — always drawn)_                     | `labels.planetLabelsEnabled` ← exiled |

`LabelSettings` claims its knobs "apply across every label producer at once". Those two
don't — they are per-source gates. Only `focusedOnly` is genuinely cross-cutting.

**The SettingsPanel section carries a residue.** `LabelsAndGuidesSection` takes two prop
shapes and sums its master tri-state across two differently-shaped collections, because six
rows derive from `bearsLabel` and four are hand-authored. That boundary tracks storage, not
meaning: "Star names" and "Planet names" are labels, while `constellations` in the same
bucket is a line overlay. No name makes the bucket honest, because it is a residue rather
than a category.

Separately, the Sun carries **four** special cases — its own `kind` in the caption union,
its own `SCALE_FADE_BANDS.sunCaption` band, the top `CAPTION_PRIORITY` tier, and an
exemption from the `famousStars.enabled` gate in both `visibleStars` and
`foregroundLabelsLayer`.

## Decisions

| #   | Decision                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------ |
| D1  | Earth gets its own label row; today's merged "Planet names" toggle splits.                             |
| D2  | `famousStar` becomes a `starCatalogs.items` row — the mirror of `famousGalaxy`, **not** a body.        |
| D3  | `earth` / `planet` become `type: 'body'` with a new `bodies.items` cluster.                            |
| D4  | Two cluster-level `VisibilityLayerKey`s: `starCatalogLabel`, `bodyLabel`.                              |
| D5  | The Sun becomes its own `bodies.items.sun` row; the gate exemption dissolves into data.                |
| D6  | `sun.labelEnabled` is live (own panel row); `sun.enabled` is seeded true and inert.                    |
| D7  | `FadeId.category?: StructureId` → `item?: LabelCategory`; `LabelLayerId` renamed to source-type names. |
| D8  | Row text comes from the registry `plural` — "Star names" → "Famous Stars", "Planet names" → "Planets". |
| D9  | Green vertical slices, one PR, prep commit first.                                                      |

## Ground preparation

Ideal-diff pass run 2026-07-28; this section records its checkpoint, approved by the user.

**Growth (seams exist, no prep needed):**

- `bearsLabel` / `labelLayer` / `detailLabel` / `shortLabel` / `plural` on
  `SourceEntryBase` (`src/@types/data/SourceEntryBase.d.ts:36-67`). The registry already
  models "this source bears labels, on this layer, with this display text". Four rows flip
  the flag and fill the fields.
- `LABEL_CATEGORIES` (`src/data/structure/labelCategories.ts`) derives from
  `SOURCE_ENTRIES.filter(e => e.bearsLabel)`, and `LabelCategory` derives from it. Both
  widen 6 → 10 with no edit.
- `CATEGORY_DISPLAY_INFO` (`src/data/structure/categoryDisplayInfo.ts:22-33`) builds from
  the same filter and **throws** if a `bearsLabel: true` row lacks display text — so the
  data delta is enforced, not merely intended.
- `StarCatalogId` (`src/@types/data/starCatalog/StarCatalogId.d.ts`) is
  `Extract<AnyEntry, { type: 'starCatalog' }>['id']`, and `STAR_CATALOG_IDS` filters the
  same way. Retyping `famousStar` widens both automatically. The `starCatalogs` docblock
  already anticipates this row.
- `FADE_LAYERS` rows (`src/services/engine/wiring/fadeLayers.ts`) already express per-item
  fan-out via `expand()` / `handle()` / `seed()` / `intent()`. Two new rows.
- `VISIBILITY_ACTION_ROW` (`src/services/animation/visibilityActionRow.ts`) already has a
  per-item factory shape reading `settings` to enumerate ids. Two new rows.
- `Source` codes are append-only by value (`src/data/source.ts:167-181`, "Never renumber the
  codes below it"). `Sun` appends as 25.

**Bolt-on (missing joint — prep required):**

- `projectLabelCategoryVisibility` (`src/state/settings/projectLabelCategoryVisibility.ts`)
  routes with a hardcoded `isStructureId → === 'milkyWay' → else galaxy-catalog` chain, and
  `LabelsAndGuidesSectionContainer`'s `onSetLabelCategoryVisibility` mirrors it for writes.
  Adding star-catalog and body routing takes both to five ways, and `milkyWay` is already
  the second special case. **Prep: replace both chains with one table keyed on
  `SOURCE_REGISTRY[cat].type`.** This is the joint the feature needs and the only prep.

**Rejected joint (recorded so it is not re-derived):** the panel cannot drive off
`VISIBILITY_ACTION_ROW` / `FADE_LAYERS`, despite both being total tables over
`VisibilityLayerKey` that already know how to read and write every layer's intent. They are
**layer-granularity** — `structureLabel` fans out across every structure id in one action,
`surveyLabel` across every catalog — while the panel needs **per-item** rows. Forcing the
fit would either coarsen the panel or grow `VisibilityLayerKey` with per-item keys, which
its docblock explicitly rules out ("a stable, hand-curated enumeration of _intents_, not a
mechanical mirror of the registry").

**Left alone deliberately:** `milkyWay` stays a singleton scalar.
`projectLabelCategoryVisibility`'s docblock argues that synthesising a one-entry `items`
record to force uniformity would "pretend the overlay is a catalog". Essential difference —
the dispatch table carries one singleton branch, documented, not un-braided.

## Design

### 1. Registry entries

Four rows change. `labelLayer` is `present iff bearsLabel`, so each needs one.

```ts
// src/data/sources/famous-star.ts
FAMOUS_STAR_ENTRY = {
  type: 'starCatalog', // was 'famousStar'
  code: Source.FamousStar, // 21, unchanged
  id: 'famousStar',
  bearsLabel: true, // was false
  labelLayer: 'starCatalog',
  detailLabel: 'Famous Star',
  shortLabel: 'Star',
  plural: 'Famous Stars',
};

// src/data/sources/earth.ts   — type 'earth' → 'body'
// src/data/sources/planet.ts  — type 'planet' → 'body'
//   both: bearsLabel: true, labelLayer: 'body'
//   earth  → detailLabel 'Earth',  shortLabel 'Earth',  plural 'Earth'
//   planet → detailLabel 'Planet', shortLabel 'Planet', plural 'Planets'

// src/data/sources/sun.ts (NEW)
SUN_ENTRY = {
  type: 'body',
  code: Source.Sun /* 25, appended */,
  id: 'sun',
  label: 'Sun',
  allSky: true,
  visible: true,
  bearsLabel: true,
  labelLayer: 'body',
  bearsMarker: false,
  detailLabel: 'Sun',
  shortLabel: 'Sun',
  plural: 'Sun',
};
```

`FamousStarSourceEntry` folds into the star-catalog entry type. `EarthSourceEntry` and
`PlanetSourceEntry` keep their distinct shapes under the shared `'body'` discriminant; a new
`SunSourceEntry` joins them.

```ts
// src/@types/data/body/BodyId.d.ts (NEW — one type per file)
export type BodyId = Extract<AnyEntry, { readonly type: 'body' }>['id'];
```

with the runtime companion `BODY_IDS` in `src/data/bodies/bodyIds.ts`, mirroring
`STAR_CATALOG_IDS`.

### 2. Settings shape

```ts
// src/@types/settings/BodyItemSettings.d.ts (NEW)
export type BodyItemSettings = DataItemSettings & {
  /** Whether this body's caption is shown (the body itself is the base `enabled`). */
  labelEnabled: boolean;
};

// EngineSettingsState — new cluster, fifth of the source-type clusters
bodies: {
  items: Record<BodyId, BodyItemSettings>;
}

// starCatalogs.items gains its second row; StarCatalogItemSettings unchanged
```

Deleted: the `famousStars` cluster, `labels.starLabelsEnabled`,
`labels.planetLabelsEnabled`. `LabelSettings` shrinks to `{ focusedOnly }`.

`bodies` carries **no cluster-level `enabled`** — unlike the four data clusters there is no
"hide all bodies" intent, and inventing one is out of scope. `sun.enabled` is seeded `true`
and never read (D6), the same inert-axis idiom `gaiaStars.labelEnabled` already uses.

### 3. Prep: type-keyed label dispatch

One table replaces the read chain in `projectLabelCategoryVisibility` and the write chain in
the container.

```ts
// src/data/labels/labelHomeBySourceType.ts (NEW)
export type LabelHome = {
  readonly read: (settings: EngineSettingsState, id: LabelCategory) => boolean;
  readonly write: (id: LabelCategory, enabled: boolean) => Action;
};

export const LABEL_HOME_BY_SOURCE_TYPE: Record<LabelBearingSourceType, LabelHome>;
```

`LabelBearingSourceType` is the set of `SOURCE_REGISTRY` types that can bear labels —
`'structure' | 'galaxyCatalog' | 'starCatalog' | 'body' | 'milkyWay'`. Callers resolve a
category's home with `LABEL_HOME_BY_SOURCE_TYPE[SOURCE_REGISTRY[cat].type]`, so a sixth
label-bearing source type is one row rather than two `if`-chain edits.

The `milkyWay` singleton is one row in that table, reading and writing its scalar directly.

### 4. Fade identity and intents

```ts
// src/@types/animation/LabelLayerId.d.ts
export type LabelLayerId =
  | 'milkyWay' | 'structure' | 'galaxy'   // 'galaxyNames' → 'galaxy'
  | 'scaleBar' | 'starCatalog' | 'body';  // two new producers

// src/@types/animation/CategoryLabelLayer.d.ts — widen the Extract to include the new two

// src/@types/animation/FadeId.d.ts
| {
    readonly kind: 'labelLayer';
    readonly layer: LabelLayerId;
    readonly item?: LabelCategory;        // was `category?: StructureId`
  }

// src/@types/animation/VisibilityLayerKey.d.ts
| 'starCatalogLabel' | 'bodyLabel'
```

`item?: LabelCategory` subsumes `StructureId` — after this change `LabelCategory` is exactly
"the label-bearing source ids", so the field's type is the honest domain rather than a union
of unrelated id types.

Two `FADE_LAYERS` rows, following the `structureLabel` row's shape (per-item `expand`, no
demand-loaded guard, settings-derived seed):

```ts
layer({
  key: 'bodyLabel',
  expand: () => BODY_IDS,
  handle: (id) => ({ kind: 'labelLayer', layer: 'body', item: id }),
  seed: (s, id) => (s.bodies.items[id].labelEnabled ? 1 : 0),
  intent: (s, id) => s.bodies.items[id].labelEnabled,
});
// starCatalogLabel: same shape over STAR_CATALOG_IDS / starCatalogs.items
```

Two `VISIBILITY_ACTION_ROW` rows, per-item factories fanning out over the live id set, and
matching `FADE_ROW` entries in `watchFadesSaga` for the two new settings actions.

### 5. Sun decomplection

`visibleStars`' exemption filter becomes two independent gates:

```ts
// src/services/engine/frame/visibleStars.ts — contract unchanged
export function visibleStars(state: EngineState): readonly StarBody[];
```

The Sun is no longer a member of the famous-star map, so the `SUN_BODY_ID` filter and the
"the Sun is exempt" docblock section both go. The map contributes iff
`starCatalogs.items.famousStar.enabled`; the Sun contributes iff `bodies.items.sun.enabled`
(inert, always true) — same drawn set as today, expressed as membership rather than
exemption.

In `foregroundLabelsLayer`, the caption target's nested ternary loses its `famousStarsEnabled`
arm and its `!starLabelsEnabled` short-circuit; each caption kind reads its own source's
`labelEnabled` through the same registry lookup the panel uses. The `sun` caption kind, the
`sunCaption` fade band, and the `CAPTION_PRIORITY` tiers are **unchanged** — those are
declutter and pacing concerns, not visibility routing.

### 6. Panel

`LabelsAndGuidesSection` drops to a single row array. `LABEL_CATEGORIES` grows 6 → 10 and
supplies every Labels row; the two Guides rows (`constellations`, `orbitTrails`) are the only
remaining hand-authored entries, and they are the only genuine _layer_ gates.

```
Labels                       Guides
  Clusters                     Constellations
  Superclusters                Orbit trails
  Voids
  Groups
  Famous Galaxies
  Milky Way
  Famous Stars
  Sun
  Earth
  Planets
```

`NonCategoryRow` is deleted along with the two-shape prop contract.

## Testing

Per [`testing.md`](../conventions/testing.md) — judge each test by "will it fail on a real
bug no other test or compiler check catches?"

**Worth testing:**

- `visibleStars` returns the Sun when the famous-star map is off, and the full set when on
  — the behaviour the exemption used to guarantee, now emergent from two gates. This is the
  single highest-value test in the change.
- The caption target for each kind under each combination of the new gates, in
  `foregroundLabelsLayer` — specifically that `famousStar.labelEnabled: false` no longer
  mutes the Sun's caption (a deliberate behaviour change from today).
- `LABEL_HOME_BY_SOURCE_TYPE` round-trips read-after-write for one category of each of the
  five source types — the prep table's whole contract.
- Tour snapshot capture/restore carries the four new `labelEnabled` values.
- `hide(['bodyLabel'])` / `show(['bodyLabel'])` dispatches one action per body id.

**Not worth testing:** that `LABEL_CATEGORIES` contains ten entries (a registry
restatement); that each new row renders (the generic row path is already covered); that
`CATEGORY_DISPLAY_INFO` throws on missing display text (its existing test covers the
mechanism, and the compiler plus that throw already gate the new rows).

## Verification

- `npm test` green at every slice boundary — the slices are vertical, so no slice may leave
  a field half-migrated.
- `npm run typecheck` clean on both tsconfigs.
- Type-level test asserting `FADE_LAYERS` keys exactly cover `VisibilityLayerKey` still
  passes with the two new keys.
- Visual: the section shows ten Labels rows and two Guides rows; toggling "Famous Stars"
  leaves the Sun's caption visible; toggling "Sun" mutes it; the Sun's sphere is unaffected
  by every toggle.
- `entanglement-radar` over the full diff as the last slice.

## Out of scope

- A cluster-level `bodies.enabled` ("hide all bodies") — no such intent exists today.
- Making `sun.enabled` live. Hiding the render origin has unclear meaning for the sphere,
  bloom, and orbit foci (grill Q6).
- Per-item `VisibilityLayerKey`s (`earthLabel` / `planetLabel`). Added when a tour beat
  needs one, not preemptively (grill Q4).
- Moving Earth's look dials into `bodies.items.earth` (grill Q3 — appearance and visibility
  stay separated as `galaxyCatalogs` separates them).
- `bearsMarker` for bodies. Bodies draw no COSMO markers; only the label flag was wrong.
- Rendering the Labels / Guides subheadings. The `group` distinction is carried by
  `SOURCE_REGISTRY[cat].type` already; the visual grouping is a separate UI call.

## Corrections to the grill record

- **`CategoryLabelLayer` must widen.** `SourceEntryBase.labelLayer` is typed
  `CategoryLabelLayer` (`Extract<LabelLayerId, 'galaxyNames' | 'structure' | 'milkyWay'>`),
  not `LabelLayerId`. Q7 discussed renaming `LabelLayerId` but not this `Extract`, which must
  gain `'starCatalog' | 'body'` or the four new entries cannot declare a `labelLayer`.
- **A `Source.Sun` code is required.** Q5 established the Sun as a registry row without
  noting it needs an enum code. Codes are append-only by value, so `Sun: 25` follows
  `GaiaStars: 24`; the three "contiguous body codes" comments at `source.ts:162-179` need
  updating since the body set is no longer contiguous.
- **`milkyWay` is a label-bearing source type in its own right.** The grill described the
  dispatch table as keyed on source type with `milkyWay` as "one singleton branch"; concretely
  that means `LabelBearingSourceType` includes `'milkyWay'` as a member, not that the table has
  an escape hatch.
