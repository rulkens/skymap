# Famous Galaxy Labels Design

**Status:** Draft, awaiting user review
**Date:** 2026-05-17
**Author:** Alexander Rulkens (with Claude)

## Problem

The MSDF label pipeline shipped in PR #132 renders world-anchored text
through `LabelRenderer`, fed by two `LabelProducer` implementations:
`youAreHereSubsystem` (one label at the origin) and `poiSubsystem`
(hand-curated cluster / supercluster / void anchors from in-code
constants in `wireSlots.ts`).

The Famous catalog (`Source.Famous`, 75 hand-curated entries at
`public/data/famous_meta.json`) is the natural next consumer of
labels: each entry already has a curated name, a world position, a
physical diameter, and a description. Today the engine uses the
Famous metadata for command-palette search, `InfoCard`, and the
`focusOn` / `selectFamous` deep-links, but the entries render only
as anonymous points in the sky — the user has no way to see
"that's M31" without clicking.

This spec adds Famous-galaxy labels using the existing
`poiSubsystem`, with a settings toggle to control visibility.

## Goal

When the user enables the **Settings → Overlays → Labels → Famous
galaxies** toggle, every loaded Famous entry renders a Cormorant
Garamond label at its world position, gated by apparent on-screen
size so far-away entries (whose underlying galaxy is invisible
anyway) don't clutter the view. The label text is the entry's
curated common name when one is available, falling back to its
primary catalog identifier.

## Non-goals

- **No new `LabelProducer` subsystem.** `poiSubsystem` is the right
  home — Famous galaxies are POIs in the common sense, and the
  existing per-category visibility, styling, and crosshair
  infrastructure carries over.
- **No rename of `poiSubsystem` or `PoiCategory`.** "POI" is a
  generic, functional term and the subsystem doesn't care what
  category of thing it labels. If it ever grows substantially
  beyond "label + optional crosshair", revisit then.
- **No changes to `famous.bin` or its v4 PointCloud encoding.** All
  per-entry data the producer needs is already in the seed and
  meta sidecar.
- **No labels for SDSS / 2MRS / GLADE points.** The other surveys
  contain hundreds of thousands to millions of objects — labels
  would be unreadable noise. Famous is curated specifically to
  be the labellable subset; xref'd survey points piggyback on the
  Famous label (one physical galaxy, one label, even if multiple
  binary rows represent it).
- **No collision culling between labels.** ~75 Famous entries plus
  the existing ~50 anchor POIs is small enough that screen-space
  overlap is rare; apparent-size gating naturally thins the visible
  set at typical zooms. If clutter is observed in practice, add
  culling in a follow-up.
- **No per-entry style overrides.** All Famous labels share the
  category style. If a future need arises (e.g., Messier objects
  styled differently from Caldwell), add another category.
- **No URL-state synchronisation of the toggle.** Like the existing
  Overlays toggles, the Labels controls live in settings only —
  not in the deep-link URL.

## Design

### 1. Data-model change: `commonName` on the Famous seed

The seed entry's `names: string[]` today holds catalog IDs
(`["C101", "NGC 6744"]`). The widely-recognised human name (e.g.
"Sombrero Galaxy", "Andromeda Galaxy", "Fireworks Galaxy") sometimes
appears only inside the prose `description`, which is the wrong
place to read from at label-pack time.

Add an optional field to `FamousEntry` in
`tools/parsers/famousSeed.ts`:

```ts
export type FamousEntry = {
  id: string;
  names: string[];
  /** Curated human-friendly display name (e.g. "Andromeda Galaxy"). */
  commonName?: string;
  ra: number;
  dec: number;
  // ... unchanged
};
```

The build (`tools/buildFamous.ts`) propagates `commonName` through
to `famous_meta.json` alongside `id`, `names`, `description`, `type`.
The runtime `FamousMetaEntry` type gains the same optional field.

**Resolution order at label-pack time** (one helper, used by the
producer):

```
displayNameFor(entry) =
    entry.commonName
 ?? entry.names[entry.names.length - 1]   // last name in array — often the more readable one
 ?? entry.names[0]
 ?? entry.id
```

The fallback through `names` keeps existing entries (without a
`commonName`) producing readable labels from day one ("NGC 6744"
rather than "c101"). Filling in `commonName` for as many entries
as makes sense is incremental, hand-curated work — not gated by
this spec.

### 2. Reshape `PoiCategory` into kind-based categories

Today's `PoiCategory = 'cluster' | 'galaxy' | 'void'` mixes two axes:
the `'cluster'` slot bundles both galaxy clusters and superclusters
(`wireSlots.ts:194-214` maps both to `category: 'cluster'`,
differentiating only via `crosshairSizeMpc`), and the `'galaxy'`
slot exists in the union but no current POI uses it.

Reshape the union to be purely kind-based, with each entry naming a
distinct astronomical object kind:

```ts
// src/services/engine/subsystems/poiSubsystem.ts
export const POI_STYLES = {
  cluster:      { labelColor: [1.0, 0.85, 0.4, 1],  lineColor: [0.9, 0.75, 0.3, 1],  pixelSize: 16, worldEmMpc: 0.5, pixelWidth: 2 },
  supercluster: { labelColor: [1.0, 0.92, 0.6, 1],  lineColor: [0.92, 0.82, 0.5, 1], pixelSize: 17, worldEmMpc: 1.0, pixelWidth: 2 },
  famousGalaxy: { labelColor: [1.0, 0.95, 0.8, 1],  lineColor: [0.9, 0.85, 0.7, 1],  pixelSize: 15, worldEmMpc: 0.05, pixelWidth: 1.5 },
  void:         { labelColor: [0.6, 0.85, 0.95, 1], lineColor: [0.45, 0.7, 0.85, 1], pixelSize: 16, worldEmMpc: 1.0, pixelWidth: 2 },
} as const satisfies Readonly<Record<string, CategoryStyle>>;

export type PoiCategory = keyof typeof POI_STYLES;
//        = 'cluster' | 'supercluster' | 'famousGalaxy' | 'void'
```

`PoiCategory` lives alongside `POI_STYLES` in `poiSubsystem.ts`
rather than in `src/@types/engine/subsystems/PoiCategory.d.ts` —
this mirrors the `FONTS` / `FontId` pattern from PR #132 (the const
and its derived union are co-located so they can't drift). The
existing `PoiCategory.d.ts` file is deleted; consumers import
`PoiCategory` from `'../../engine/subsystems/poiSubsystem'`.

**Naming rationale for `'famousGalaxy'`:** "famous" alone isn't an
object kind, but `famousGalaxy` IS — it names the specific kind of
POI fed by the curated Famous catalog, distinguishable from a
hypothetical future `'galaxy'` slot that might come from a generic
catalog source. Reads as self-documenting in the union, in
`category: 'famousGalaxy'`, and in the settings checkbox label.
camelCase is the only sensible casing for a multi-word literal here
— the existing single-word categories stay lowercase.

**Style differentiation:**

- `cluster` (warm yellow): galaxy clusters — Coma, Virgo, etc. Same
  numbers as today.
- `supercluster` (slightly lighter yellow, larger `pixelSize`,
  larger `worldEmMpc`): supercluster centres — Local, Hercules, etc.
  Visually adjacent to `cluster` but readable as a different scale.
- `famousGalaxy` (warm off-white): curated individual galaxies.
  Smaller `worldEmMpc` (0.05) than the cluster categories because
  Famous entries span 0.7 → 78 Mpc and need to read at sub-Mpc
  zooms.
- `void` (soft cyan): same as today.

The dropped `'galaxy'` slot can be reintroduced later as a one-line
config edit if a future generic-galaxy POI source appears.
`PointOfInterest`, `setPois`, `setCategoryVisible`, and the
per-frame `produceLabels` path are otherwise unchanged.

### 3. Apparent-size gating in `poiSubsystem`

Today's `poiSubsystem` emits a label every frame for every POI
whose category is visible. For Famous (where physical size varies
3 orders of magnitude — LMC at 30 kpc vs distant NGC 1275 at 50 kpc
seen from 78 Mpc), unconditional emission produces clutter at far
zooms and tiny unreadable labels when a galaxy is too small on
screen to make out.

Add an optional `minApparentSizePx` field to `PointOfInterest`. When
present, the producer computes the entry's projected pixel size at
the current camera distance using the same math
`engine.ts:perGalaxyApparentSizePx` uses for thumbnail enqueue
gating:

```
apparentSizePx = (diameterKpc / 1000) / camDistMpc × viewportPxY × 0.5 × cotHalfFov
```

If `apparentSizePx < minApparentSizePx`, the producer skips emission
for that POI this frame.

Cluster / void anchors (which span 10–100 Mpc physically and have no
sensible "diameter") omit the field and continue to emit
unconditionally. Famous entries set `minApparentSizePx = 6` (a
conservative threshold — galaxies smaller than ~6 px are visually
indistinguishable from the dot anyway).

This computation runs per-POI per-frame inside the producer. With
~125 POIs total (50 static anchors + 75 Famous), the per-frame cost
is sub-microsecond. The pre-existing change-detection signature in
`labelDirectorSubsystem` still skips the GPU upload when no labels
enter or leave the visible set.

### 4. Wiring famous → POIs on the meta slot's commit

Today `wireSlots.ts:188-228` builds the POI list from in-code
constants once at engine boot. To pick up Famous entries, the wire
must also fire after `famousMetaSlot` commits — at which point we
have both the meta sidecar (for names + diameter) and the loaded
`famous.bin` cloud (for `worldPos`).

The clean fit is a single `setPois` call site that runs:

1. After both the engine state is ready AND `famousMetaSlot.commit`
   has fired AND the Famous cloud has finished loading. (The slot
   commit is the load signal — its callback fires after the data is
   in `state.assetSlots.famousMeta`.)
2. Reads the static anchors (unchanged).
3. Reads `state.assetSlots.famousMeta.value` + the loaded Famous
   point cloud's `positions` buffer.
4. For each Famous entry, builds a `PointOfInterest` with:
   - `id`: `'famous-' + entry.id` (namespace-prefixed to avoid
     collision with `wireSlots.ts`'s `slug`-derived ids)
   - `name`: `displayNameFor(entry)` (the helper above)
   - `category`: `'famousGalaxy'`
   - `worldPos`: `positions[i * 3 .. i * 3 + 3]`
   - `crosshairSizeMpc`: omitted — Famous galaxies are already
     rendered as point billboards and most have a thumbnail; a
     crosshair would over-decorate
   - `minApparentSizePx`: 6
5. Skips entries with `pseudo: true` (the Milky Way — the
   `youAreHereSubsystem` already labels the user's position).
6. Combines static anchors + Famous POIs and calls
   `state.subsystems.pois.setPois(merged)`.

The static-anchor wire in `wireSlots.ts` also updates:

- `SUPERCLUSTER_ANCHORS.map(...)` now emits `category: 'supercluster'`
  instead of `'cluster'`. Cluster and void anchors keep their
  existing categories.
- The `if (hasUrlGate('anchors'))` gate at `wireSlots.ts:187` is
  **removed**. The cluster / supercluster / void anchors graduate
  from debug-only diagnostic overlays into proper user-facing
  features, controllable via the Settings → Overlays → Labels
  toggles introduced in section 5. The `hasUrlGate` import is
  dropped when no other use remains in the file.

When `famousMetaSlot.commit` fires before the engine state is ready
(possible on a cold load), the wire defers — `setPois` is called
later, once both inputs are present.

The xref system **does not** participate in label emission. A
Famous entry that's xref'd to 2MRS row 35 still emits one label (at
the Famous worldPos); the xref'd survey row does not get its own
label. The xref is a UI-side selection-unification mechanism and is
already plumbed through `pointInfoBuilder` — labels piggyback on
the Famous entry's identity.

### 5. Settings panel: Overlays → Labels

The settings panel already has an `Overlays` `CollapsibleSection`
(per `src/components/SettingsPanel/CollapsibleSection.tsx`'s header
docstring). Add a "Labels" sub-group inside it with one always-
visible toggle per POI category:

```
▸ Overlays
    ▸ Labels
        [✓] Famous galaxies
        [✓] Galaxy clusters
        [✓] Superclusters
        [✓] Voids
```

All four toggles are first-class user controls — none are gated on
URL flags. (See section 4 for the removal of the
`?anchors=1` debug gate that previously hid the lower three.)

Each row is a checkbox that mirrors a boolean in
`EngineSettingsState.labelCategoryVisibility: Record<PoiCategory, boolean>`.
The React control writes through a new
`onSetLabelCategoryVisibility(category, visible)` callback in
`EngineSettingsCallbacks`, which the engine forwards to
`state.subsystems.pois.setCategoryVisible(category, visible)`.

Default state: every category ON. Users see all four label kinds
out of the box; turning any off is a one-click adjust.

State persistence: same convention as other settings — held in
local component state inside `useEngineSettings`, not URL-synced.

### 6. Loading guarantees

The famous meta + xref sidecars load in `App.tsx` via the
`useFamousMeta` hook; the famous point cloud loads via the
`cloudLoader` pipeline. Both are eager — they fire during initial
bootstrap.

The wire described in section 4 runs once when both inputs are
ready. If the user has the toggle OFF at that point, the POIs are
still emitted but their category is hidden — flipping the toggle
later doesn't require a re-wire.

Failure cases:

- **`famous_meta.json` fails to load:** `useFamousMeta` returns
  `null` for the meta; the wire defers indefinitely; only static
  anchors render as POIs. Same end-state as today.
- **`famous.bin` fails to load:** the Famous source is missing
  from `state.sources`; the wire defers indefinitely; only static
  anchors render. Same end-state as today.
- **A specific Famous entry has no xref:** orthogonal to labels —
  the label still emits because the worldPos comes from
  `famous.bin`, not from the xref'd survey row.

## Data flow

```
data/famous_galaxies.seed.json (build-time)
                │
                ▼ buildFamous.ts (now propagates commonName through)
public/data/famous_meta.json + famous.bin
                │
                ▼  runtime fetch
state.assetSlots.famousMeta  +  state.sources[Source.Famous]
                │
                ▼  wireSlots — buildPoisFromFamousMeta(meta, cloud)
PointOfInterest[] with category: 'famousGalaxy', minApparentSizePx: 6
                │
                ▼  combined with static anchors → setPois(merged)
poiSubsystem.produceLabels(state, ctx)
                │  per-POI per-frame:
                │    if (category invisible) skip
                │    if (minApparentSizePx set && projected < threshold) skip
                ▼
LabelProducerOutput → labelDirectorSubsystem → LabelRenderer
                │
                ▼  uiOverlay pass, post-tone-map
Cormorant Garamond serif labels at Famous galaxies
```

## Error handling

- **Missing `displayNameFor` resolution:** if an entry has no
  `commonName`, no `names`, and no `id`, the label text falls
  through to the empty string. The renderer silently emits zero
  glyphs; the label takes up no space. This is so unlikely
  (every parsed seed entry validates `id` as non-empty in
  `famousSeed.ts`) that no special-case logging is warranted.
- **Apparent-size math NaN:** if `diameterKpc` is NaN for a Famous
  entry (the seed validation catches this at build time — every
  entry has a finite, positive `diameterKpc`), the producer
  treats the gate as "skip" so the label silently disappears
  rather than rendering at corrupt position. The build-time
  validation makes this impossible in practice; the runtime guard
  is defence-in-depth.
- **Category style lookup miss:** impossible after the
  `keyof typeof POI_STYLES` derivation — the type system rejects
  any `category` value that isn't a key.

## Testing

- **`tests/services/engine/subsystems/poiSubsystem.test.ts`** —
  extend with:
  - A test that an entry with `minApparentSizePx` set is omitted
    when the projected size at the current camera distance falls
    below the threshold.
  - A test that an entry without `minApparentSizePx` is always
    emitted (existing behaviour, regression-proof).
  - A test that `category: 'famous'` is accepted and styled with
    the `POI_STYLES.famous` entry.
- **`tests/data/poiCategories.test.ts` (new)** — asserts that
  `PoiCategory` is the literal union of `POI_STYLES` keys (the
  type-level check encoded as a value-level expect, mirroring the
  fonts.test.ts pattern).
- **`tests/services/engine/phases/wireSlots.famousPois.test.ts`
  (new)** — feeds a stub meta + stub cloud through the wire and
  asserts the resulting `setPois` payload includes one
  `'famous-<id>'` POI per non-pseudo entry, with `worldPos` taken
  from the cloud's `positions` buffer and `category: 'famous'`.
- **Manual visual verification** before merging:
  - Toggle the new "Famous galaxies" checkbox; labels appear /
    disappear without flicker.
  - Zoom in on a Famous galaxy — its label scales naturally with
    the existing `worldEmMpc`-driven hybrid sizing.
  - Zoom out until the galaxy's apparent size drops below 6 px —
    the label disappears.
  - Zoom into Andromeda (M31) — the label should read "Andromeda
    Galaxy" after we seed `commonName` for it (the implementation
    plan will include seeding `commonName` for a handful of
    obvious entries; the rest can be filled in later).

## Open questions

None blocking. Two decisions deferred to implementation, both
non-load-bearing:

1. The exact list of Famous entries to seed `commonName` for in
   the first PR — recommend a small set (M31, M33, M81, M87,
   Sombrero, Centaurus A, Whirlpool, Pinwheel, Triangulum, plus
   the dozen most-clicked) and leave the rest filled-in over time.
2. Whether the master Overlays → Labels group gets its own
   parent enable (one checkbox that disables all four category
   toggles), or just stays as four sibling checkboxes. The
   implementation plan can pick whichever reads better in the UI.

## Impact on consumers

- **`poiSubsystem`** — gains a fourth category style; `setPois`
  now accepts `minApparentSizePx` on each POI; `produceLabels`
  gains an apparent-size gate.
- **`wireSlots.ts`** — gains a `buildPoisFromFamousMeta` helper
  and a wire-once-both-ready trigger after `famousMetaSlot`
  commits. The existing `if (hasUrlGate('anchors'))` gate is
  removed so cluster / supercluster / void anchors wire
  unconditionally. `SUPERCLUSTER_ANCHORS.map(...)` now emits
  `category: 'supercluster'`.
- **`SettingsPanel.tsx`** — gains an Overlays → Labels sub-group
  with four checkboxes.
- **`EngineSettingsState`** — gains a
  `labelCategoryVisibility: Record<PoiCategory, boolean>` field.
- **`EngineSettingsCallbacks`** — gains an
  `onSetLabelCategoryVisibility(category, visible)` callback.
- **`tools/parsers/famousSeed.ts`** — `FamousEntry` gains an
  optional `commonName: string` field; parser validates it as a
  non-empty string when present.
- **`tools/buildFamous.ts`** — propagates `commonName` through
  to `famous_meta.json`.
- **`FamousMetaEntry`** — gains the same optional `commonName`
  field.
- **`useFamousMeta`** — no change; the new field flows through
  unchanged.
- **React UI outside SettingsPanel** — no change. Existing
  consumers of `famousMeta` (command palette, InfoCard,
  `selectFamous` API) don't need `commonName`; if they later
  want to show it, that's a separate edit.
- **Famous binary format (`famous.bin`)** — no change.
- **Famous xref sidecar (`famous_xrefs.json`)** — no change.
