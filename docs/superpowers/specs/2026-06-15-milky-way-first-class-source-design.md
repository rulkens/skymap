# Milky Way as a First-Class Source — Design

**Date:** 2026-06-15
**Status:** Design (awaiting plan)
**Backlog item:** "Promote the Milky Way to a first-class `Source` (streamline its identity)" (`docs/BACKLOG.md`)

## Goal

Make the Milky Way's **identity / visibility / selection / focus** flow through
the same plumbing as every other source, retiring the bespoke identity hacks.
Its procedural-disk **renderer** stays its own subsystem — only the identity
axis is unified.

Designing this surfaced two adjacent decomplections worth doing first, because
they make the MW work fall out almost for free:

- **The `Selection` ↔ `FocusableTarget` mirror** — two parallel discriminated
  unions for the same entities. `Selection` is purely an internal intermediate;
  collapsing it removes a mirror the MW work would otherwise have to pay twice.
- **`FadeId` naming** — the per-source-render fade kinds are named three
  different ways, and the MW disk fade is buried inside `overlay`.

The work is therefore three sequenced parts: **Part 0** (selection/target
unification) and **Part 1** (fade/source naming) are pure refactors with no
behavior change; **Part 2** (MW selectable) is the feature, built on both.

## Background — what already landed

- **PR #312:** `milkyWay` (and `flow`) became real `SOURCE_REGISTRY` rows
  (`type: 'milkyWay'`, code 16).
- **PR #313:** the "You are here" label became a first-class `milkyWay` label
  category — stateless `produceMilkyWayLabel` producer, `settings.milkyWay.labelEnabled`
  toggle, fade on the `labelLayer` axis. The `'youAreHere'` subsystem and union
  extension are gone.

## What is still bespoke (the targets)

1. **Palette pseudo-entry** — `src/data/milkyWay/milkyWayEntry.ts` injects a
   `FamousMetaEntry`-shaped fake with sentinel id `__milky-way__`.
2. **`App.tsx` onSelect interception** — `if (id === MILKY_WAY_ID) camera.focusOnMilkyWay()`.
3. **Bespoke `focusOnMilkyWay`** in `engine.ts` — off the standard selection→focus path.
4. **Not pickable** — `bearsMarker: false`, no pick geometry; you cannot click the MW.
5. **`FadeId` naming** — `scalarField` / `markerLayer` are named by render-tech /
   aspect rather than source; the MW disk fade lives under `overlay:'milkyWay'`.
6. **The `Selection` ↔ `FocusableTarget` mirror** — adding the MW would mean
   adding a `milkyWay` variant to *both* unions.

---

## Part 0 — Collapse `Selection` into `FocusableTarget` (refactor, no behavior change)

### Diagnosis

Two parallel discriminated unions describe the same set of entities:

```ts
Selection       = { kind:'galaxy', source, localIdx } | { kind:'structure', id }
FocusableTarget = GalaxyInfo | StructureRecord
```

`Selection` is the lightweight identity decoded from the GPU pick
`(sourceCode, localIdx)`; `FocusableTarget` is the resolved, display-ready data.
But:

- The selection subsystem's **callbacks already emit `FocusableTarget`**
  (`onHoverChange` / `onSelectChange` / `onFocusChange`). `Selection` never
  reaches the outside — it lives *only* between the pick decode and the slot.
- The identity is a **subset of fields on the resolved target**: `GalaxyInfo`
  carries `source` + `index` + `x/y/z` + `diameterKpc`; `StructureRecord`
  carries `id`. Every internal reader of the slots (`selectionRingPass`,
  `diskRadiusRingPass`, `produceStructureMarkers`/`Labels` via `structureIdOf`,
  `runFrame`'s focus fade) needs only those fields.

So the second union is accidental complexity. Two consequences fall out:

- **`prebuiltInfo`** exists only because `setSelected`/`setFocused` resolve
  `Selection → target` *internally*, and the `selectByAlias` deep-link race can
  make that internal lookup return null (GPU upload not yet done) → blank card.
  Once callers pass an already-resolved target, there is no internal lookup to
  race, and the escape hatch dissolves.
- **`galaxyInfoFor`** is already pure-in-disguise (takes everything as args; the
  closure only captures the `getCloud`/`getFamousMeta` accessors).

### Target — a tagged `FocusableTarget` union with table dispatch

The collapse isn't just "delete the second union" — the survivor becomes a
**properly tagged discriminated union**, so dispatch is a **table lookup**, not an
`isStructure` ternary (simplicity.md #7 — the N-way tag+table form). This is what
makes Part 2's MW arm a one-row add instead of a predicate-chain edit.

```
PickResult { sourceCode, localIdx }                 // raw GPU decode — unchanged
        │  resolvePick(pick, deps): FocusableTarget | null   // pure
        ▼
type FocusableTargetType = 'galaxyCatalog' | 'structure' | 'milkyWay';
FocusableTarget = GalaxyInfo | StructureInfo | MilkyWayInfo   // tagged on `type`
        │  hover / select / focus slots
        ▼
onHoverChange / onSelectChange / onFocusChange       // unchanged signatures
```

Each arm carries a `type` discriminant mirroring its `SOURCE_REGISTRY` row's
`type`, keeping its finer id:

- `GalaxyInfo`    → `type: 'galaxyCatalog'` (keeps `source: SourceType`)
- `StructureInfo` → `type: 'structure'` (keeps its `id`/category `StructureId`)
- `MilkyWayInfo`  → `type: 'milkyWay'` (Part 2)

**Rename `StructureRecord` → `StructureInfo`** (confirmed) — full parallel naming
for the union arms (`GalaxyInfo | StructureInfo | MilkyWayInfo`); a 54-file
mechanical sweep (it's the structure store's element type too). The provenance
difference (galaxy info is derived on-demand; structure info is the stored record)
is an implementation detail, not what they are as targets.

Concrete changes:

- **Delete the `Selection` union** (`src/@types/engine/subsystems/Selection.d.ts`)
  and `selectionEq`. The slots hold `FocusableTarget | null`.
- **Add the `type` tag** to `GalaxyInfo` (`'galaxyCatalog'`, set in
  `galaxyInfoBuilder`) and `StructureInfo` (`'structure'`, set at every
  construction site — structure store / catalog slot / static-anchor builder).
  `FocusableTarget` becomes a tagged union; add `FocusableTargetType`.
- **Retire the structural `isStructure` sniff** (`'category' in target`).
  Replace its dispatch sites with **tables keyed on `type`** for the genuine
  N-way dispatches: the InfoCard detail/compact card (`DETAIL_CARD[target.type]`),
  the URL hash resolver (`URL_HASH_FOR[target.type]`), and `commitFocus`
  (`COMMIT_FOCUS[target.type]`). For simple guards (member-count, focus-fade
  collapse, ring enable) narrow on `target.type === 'structure'` (type-safe —
  no `as` cast). `isStructure` may survive only as a thin `t.type === 'structure'`
  type-guard if a site genuinely reads cleaner with it.
- **Extract pure resolvers** (one function per file):
  - `resolveGalaxyInfo(cloud, localIdx, source, famousMeta): GalaxyInfo | null`
    — lifted from `galaxyInfoFor`; the bounds-check is the tier-swap race guard.
  - `resolvePick(pick: PickResult, deps): FocusableTarget | null` — merges
    `pickToSelection` + `resolveTarget`; dispatches on `SOURCE_REGISTRY[code].type`
    (`galaxyCatalog` → `resolveGalaxyInfo`; `structure` → structure-store lookup;
    falls through to null + warn). `deps` carries the cloud/structure/famousMeta
    accessors.
- **`setHovered`/`setSelected`/`setFocused`** take `FocusableTarget | null`
  directly. Dedup via a small `targetEq` keyed on `type` then identity fields
  (galaxy: `source` + `index`; structure: `id`; milkyWay: singleton). **Drop
  `prebuiltInfo`.**
- **`selectedTarget()`** collapses into `selected()` — remove the redundant getter;
  `wireInput`'s dblclick uses `focusOn(selected())`.
- **Boundary resolution** moves to the pick/URL edge: `wireInput` hover/click and
  `runFrame` hover call `resolvePick`; `clickHandler` returns `FocusableTarget |
  null`; `selectByAlias` resolves and passes the target in.
- **Slot readers** read off the target via `type` narrowing:
  - `selectionRingPass`: galaxy → `worldPos`/`diameterKpc` off `GalaxyInfo` (no
    catalog re-index); structure → marker pass handles it.
  - `diskRadiusRingPass`: galaxy-only — it needs `axisRatio`/`positionAngleDeg`/
    calibration not on `GalaxyInfo`, so it keeps re-indexing the catalog by
    `source`/`index`, gated on `type === 'galaxyCatalog'`.
  - `structureIdOf(target)` = `target.type === 'structure' ? target.id : null`.
  - `runFrame` focus fade narrows on `type === 'structure'`.

### Part 0 testing

`selectionSubsystem` tests assert targets in the slots (not `Selection`s). New
unit tests for `resolveGalaxyInfo` (incl. out-of-bounds → null) and `resolvePick`
(galaxy / structure / null dispatch). Table tests assert `DETAIL_CARD` /
`URL_HASH_FOR` / `COMMIT_FOCUS` resolve the right entry per `type`. Net deletion
of `selectionEq` / `prebuiltInfo` / the structural `isStructure` sniff.

---

## Part 1 — Fade-layer / source naming consistency (refactor, no behavior change)

### Diagnosis

`FadeId` mixes two axes — *which source* and *which render aspect* — and names
its kinds inconsistently:

| Current kind   | Discriminator                 | Named by    | Source type        |
| -------------- | ----------------------------- | ----------- | ------------------ |
| `galaxyCatalog`| `id: GalaxyCatalogId`         | source ✓    | galaxyCatalog      |
| `scalarField`  | `field: VolumeFieldId`        | render-tech | volume             |
| `markerLayer`  | `category: StructureCategory` | aspect      | structure          |
| `filaments`    | —                             | source (plural) | filament       |
| `flow`         | —                             | source ✓    | flow               |
| `overlay`      | `id: OverlayId`               | aspect      | milkyWay + galaxy-LOD |
| `labelLayer`   | `layer` (+`category?`)        | aspect      | cross-source       |
| `volumesMaster`| —                             | aspect      | volume             |

`galaxyCatalog`, `markerLayer`, and `scalarField` are the **same shape** (one
fade per source-level id) named three different ways; the MW disk is buried in
`overlay`.

### Target — Model A

Name every **primary-render** fade by its source type with an `id` discriminator.
Labels stay on the cross-source `labelLayer` axis (labels genuinely span sources
and have their own director — `galaxyNames` is shared across all famous galaxies;
folding labels into per-source kinds is a large, risky restructure for little
gain — the rejected "Model B").

```ts
export type FadeId =
  | { readonly kind: 'galaxyCatalog'; readonly id: GalaxyCatalogId }   // unchanged
  | { readonly kind: 'structure';     readonly id: StructureId }        // ← markerLayer + category
  | { readonly kind: 'volumeField';   readonly id: VolumeFieldId }      // ← scalarField + field
  | { readonly kind: 'milkyWay' }                                       // ← NEW (MW disk)
  | { readonly kind: 'filament' }                                       // ← 'filaments'
  | { readonly kind: 'flow' }                                           // unchanged
  | {
      readonly kind: 'labelLayer';
      readonly layer: LabelLayerId;
      readonly category?: StructureId;                                  // type rename only
    }
  | { readonly kind: 'overlay'; readonly id: OverlayId }                // shrinks (see below)
  | { readonly kind: 'volumesMaster' };
```

Decisions (confirmed during brainstorm): volume kind = **`volumeField`**;
**`structure`** kind with `id: StructureId`; **`filament`** singular.

`serializeFadeId` updates in lockstep (`structure:${id}`, `volumeField:${id}`,
`milkyWay`, `filament`; `labelLayer` key shape unchanged).

### MW disk fade moves out of `overlay`

- `OverlayId` drops `'milkyWay'` → `'proceduralDisks' | 'texturedDisks'`.
- The MW disk fade is now `{ kind: 'milkyWay' }`. Repoint `milkyWayPass`
  (`opacityOf({ kind: 'milkyWay' })`), `registerOverlayFades` (seed from
  `state.settings.milkyWay.enabled ? 1 : 0`, mirroring the label-layer seed),
  and the disk toggle handle (`EngineMilkyWayHandle.setEnabled`).

### Repo-wide rename `StructureCategory` → `StructureId`

`StructureCategory` is `Extract<AnyEntry, { type: 'structure' }>['id']` — the
**source-level** id (`cluster` / `supercluster` / `void` / `group`), the exact
parallel of `GalaxyCatalogId` and `VolumeFieldId`. Rename it everywhere so the
codebase carries the parallel triple `GalaxyCatalogId / StructureId / VolumeFieldId`
with no two-names-one-concept. `'category'` is a POI-era leftover.

Scope of the (mechanical, type-checker-guarded) sweep: the type file
`StructureCategory.d.ts` → `StructureId.d.ts`; every reference (settings keys,
marker buckets, label categories, `resolvePick`, the runtime companion
`STRUCTURE_CATEGORIES` symbol/file), and tests. `StructureId` is distinct from
the per-record `StructureInfo.id` (e.g. `"A2703"`; `StructureRecord` is renamed
`StructureInfo` in Part 0): the fade keys per-source-id (per category), exactly as
`GalaxyCatalogId` keys per-catalog, not per-galaxy — the rename docblock must say so.

### Part 1 testing

Existing fade-registry / serialize / `registerOverlayFades` / per-producer fade
tests update in lockstep (parity, not new coverage). The `{ kind: 'milkyWay' }`
disk fade gets ON→1 / OFF→0 assertions in `registerOverlayFades.test.ts`,
mirroring the label-layer case.

---

## Part 2 — Milky Way as a first-class selectable source

Builds on Part 0 (the tagged `FocusableTarget` union + table dispatch) and Part 1
(`{ kind: 'milkyWay' }` fade). Selectability level: **fully selectable** —
clickable in-scene, an InfoCard, and the standard select→focus path. Because of
Part 0 the MW is **a new arm + one table row per dispatch** — there is **no
`Selection` variant to add, no `isMilkyWay` predicate, and no `as`-cast audit**
(the tagged union narrows safely; that whole hazard class is gone).

### `MilkyWayInfo` target — a third union arm

`FocusableTarget` widens to a third tagged arm:

```ts
export type FocusableTarget = GalaxyInfo | StructureInfo | MilkyWayInfo;
```

`MilkyWayInfo` is a static const (type `src/@types/engine/MilkyWayInfo.d.ts`,
value `src/data/milkyWay/milkyWayInfo.ts`): `type: 'milkyWay'` (the union tag),
display name "Milky Way", a one-line "Our home galaxy — you are here",
barred-spiral type, a distance note ("≈ 8 kpc to the galactic centre; we are
inside it"), plus the `x/y/z` of `MILKY_WAY_CENTER_WORLD` so ring/focus readers
treat it uniformly. No photometry, no `(source, localIdx)` — it is not a catalog
object.

The MW slots into the Part 0 tables by **adding one row each** — no edits to the
existing dispatch logic:

- `DETAIL_CARD['milkyWay'] = MilkyWayDetailCard` (new card; glyph, no thumbnail).
- `URL_HASH_FOR['milkyWay'] = () => null` (clears the focus hash — deep-linking deferred).
- `COMMIT_FOCUS['milkyWay'] = commitMilkyWayFocus`.

### Pick — strategy #1, pick-only

A tiny **screen-size-clamped pick billboard** at `MILKY_WAY_CENTER_WORLD` stamps
`pack(Source.MilkyWay, 0) + PICK_SENTINEL_OFFSET` into the r32uint pick texture.

- A small dedicated pick provider (mirrors `structureMarkerRenderer.pickRing` /
  `proceduralDiskRenderer.pickDisks`), called inside the existing pick pass —
  same unified pick texture, no CPU special-case.
- Clamped to a min pixel size so it is hittable at any zoom (like a galaxy point).
- **Invisible** (pick-only): the visible affordances are the existing disk
  impostor + the "You are here" label. No always-on marker.
- **Gated on MW disk visibility** — only contributes when the MW is on screen
  (both disk and label have faded out by the home framing, so the MW is never
  pickable at hundreds of Mpc — correct).

`resolvePick` grows a branch: `type === 'milkyWay'` → `MILKY_WAY_INFO`. The decode
(`unpackPick`) is unchanged — code 16 already round-trips.

### Selection ring

`selectionRingPass` narrows on `type` — the `selectionRingRenderer` is already
target-agnostic (`{ worldPos, ringRadiusPx }`). The milkyWay arm: `worldPos =
MILKY_WAY_CENTER_WORLD` (off `MilkyWayInfo`), `ringRadiusPx` from the disk's
apparent on-screen size (disk radius ≈ 25 kpc / camDist × pxPerRad) clamped to a
min. `enabled()` is true for `galaxyCatalog` **or** `milkyWay` targets (structures
render through the marker pass). Same on-select halo as any galaxy.

### Focus — generic, no MW-specific method

`camera.focusOn(target: FocusableTarget)` is the single public focus entry, and
`commitFocus` is the Part 0 `COMMIT_FOCUS[target.type]` table lookup. The MW adds
`commitMilkyWayFocus`: tween to `MILKY_WAY_VIEW_DISTANCE_MPC` at
`MILKY_WAY_CENTER_WORLD`, setting both the select and focus slots (the InfoCard
pins; any cluster focus collapses — a milkyWay focus is non-structure, so
`runFrame` drops the member-isolation fade exactly as a galaxy focus does).

The bespoke `focusOnMilkyWay` camera method is **retired** — its framing logic is
exactly `commitMilkyWayFocus`. `focusOnHome` (the wide bbox "reset camera"
framing) is **unchanged** — a different gesture.

Single click selects (InfoCard + ring); double-click and the palette focus
(tween) — same interaction grammar as galaxies and structures, all driven by the
one `FocusableTarget` value.

### Palette

- **Delete** `src/data/milkyWay/milkyWayEntry.ts` (sentinel + `FamousMetaEntry`
  masquerade) and the `App.tsx` `onSelect` `=== MILKY_WAY_ID` interception.
- The palette gets a **typed MW command** (a first-class entry, not a
  `FamousMetaEntry`) whose select action calls `camera.focusOn(MILKY_WAY_INFO)`
  — the same select→focus path every other target uses.
- `FamousMetaEntry.pseudo` + the glyph-fallback path: retire iff the MW
  pseudo-entry is its only user (verify during planning).

### Part 2 testing

`resolvePick` code 16 → `MILKY_WAY_INFO`; `targetEq` milkyWay self-equality;
`selectionRingPass` enabled + worldPos for milkyWay; `commitFocus` milkyWay branch
(both slots set, tween framing, structure-fade collapse); the palette command
routes to `focusOn(MILKY_WAY_INFO)` with no sentinel.

---

## What gets retired (summary)

- The `Selection` union, `selectionEq`, `prebuiltInfo`, `selectedTarget()`,
  `pickToSelection`'s Selection output, internal lazy resolution, **and the
  structural `isStructure` sniff** (replaced by the `type` tag + dispatch tables);
  `StructureRecord` renamed `StructureInfo` (Part 0).
- `scalarField` / `markerLayer` / `filaments` fade kind names; `overlay:'milkyWay'`;
  `StructureCategory` / `STRUCTURE_CATEGORIES` as names (Part 1).
- `milkyWayEntry.ts` (sentinel `__milky-way__` + pseudo-entry); the `App.tsx`
  onSelect MW special-case; the `focusOnMilkyWay` standalone method (Part 2).

After this, the MW's identity / visibility / selection / focus all flow through
the same plumbing as every other source. Only the procedural-disk **renderer**
stays bespoke — by design.

## Plan split

Three plan files, in order:

1. **Selection/target unification** (Part 0): collapse `Selection` → a **tagged**
   `FocusableTarget` (`type` discriminant + `DETAIL_CARD`/`URL_HASH_FOR`/`COMMIT_FOCUS`
   table dispatch, retiring the `isStructure` sniff), `StructureRecord → StructureInfo`,
   pure `resolvePick`/`resolveGalaxyInfo`, drop `prebuiltInfo`.
2. **Naming consistency** (Part 1): `FadeId` Model A, `serializeFadeId`,
   `OverlayId` shrink, MW disk fade → `{ kind: 'milkyWay' }`, repo-wide
   `StructureCategory` → `StructureId`.
3. **MW selectable** (Part 2): MW pick provider, `MilkyWayInfo`, `resolvePick`
   milkyWay branch, ring branch, `commitFocus` milkyWay dispatch, palette typed
   command, delete the sentinel + onSelect special-case + `focusOnMilkyWay`.

## Out of scope (deferred)

- Model B (full source × aspect `FadeId`).
- Reworking the procedural-disk renderer (stays bespoke).
- Any change to `focusOnHome` (reset-camera) semantics.
- Converging the URL deep-link descriptor (`FocusTarget`) with `FocusableTarget`
  — a separate concern (it's a parse-time *request*, not a resolved target).
- **MW URL deep-linking** (`#focus=milkyway` round-trip). A MW focus clears the
  focus hash (matching prior behavior); making the MW shareable-by-URL would
  need the `FocusTarget` parser + resolver to grow a milkyWay kind — a follow-up.
