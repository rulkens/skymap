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

### Target

```
PickResult { sourceCode, localIdx }                 // raw GPU decode — unchanged
        │  resolvePick(pick, deps): FocusableTarget | null   // pure
        ▼
FocusableTarget = GalaxyInfo | StructureRecord       // the ONE held type
        │  hover / select / focus slots
        ▼
onHoverChange / onSelectChange / onFocusChange       // unchanged signatures
```

Concrete changes:

- **Delete the `Selection` union** (`src/@types/engine/subsystems/Selection.d.ts`)
  and `selectionEq`. The slots hold `FocusableTarget | null`.
- **Extract pure resolvers** (one function per file, project convention):
  - `resolveGalaxyInfo(cloud, localIdx, source, famousMeta): GalaxyInfo | null`
    — lifted from `galaxyInfoFor`; the bounds-check is the tier-swap race guard.
  - `resolvePick(pick: PickResult, deps): FocusableTarget | null` — merges
    `pickToSelection` + `resolveTarget`; dispatches on `SOURCE_REGISTRY[code].type`
    (`galaxyCatalog` → `resolveGalaxyInfo`; `structure` → structure-store lookup;
    falls through to null + warn for non-pickable codes). `deps` carries the
    cloud/structure/famousMeta accessors.
- **`setHovered`/`setSelected`/`setFocused`** take `FocusableTarget | null`
  directly. Dedup via a small `targetEq` comparing identity fields
  (galaxy: `source` + `index`; structure: `id`). **Drop `prebuiltInfo`.**
- **`selectedTarget()`** collapses into `selected()` (now identical) — remove the
  redundant getter; update `wireInput`'s dblclick (`focusOn(selected())`).
- **Boundary resolution** moves to the pick/URL edge:
  - `wireInput` hover/click: `resolvePick(pick, deps)` → `setHovered`/`setSelected(target)`.
  - `clickHandler` returns a `FocusableTarget | null` (resolves via `resolvePick`)
    instead of a `Selection`.
  - `selectByAlias` resolves to a target and passes it straight in (it already
    builds the info).
- **Slot readers** read off the target:
  - `selectionRingPass` / `diskRadiusRingPass`: read `worldPos` (`x/y/z`) +
    `diameterKpc` from the `GalaxyInfo` instead of re-indexing the catalog by
    `localIdx` (drops their own tier-swap-race guards).
  - `structureIdOf(target)` = `isStructure(target) ? target.id : null`.
  - `runFrame` focus fade: `isStructure(focused())`.

### Part 0 testing

`selectionSubsystem` tests update to assert targets in the slots (not
`Selection`s). New focused unit tests for `resolveGalaxyInfo` (incl. the
out-of-bounds → null race guard) and `resolvePick` (galaxy / structure / null
dispatch). Ring-pass tests assert worldPos read from the target. Net deletion of
the `selectionEq` / `prebuiltInfo` cases.

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
the per-record `StructureRecord.id` (e.g. `"A2703"`): the fade keys per-source-id
(per category), exactly as `GalaxyCatalogId` keys per-catalog, not per-galaxy —
the rename docblock must say so.

### Part 1 testing

Existing fade-registry / serialize / `registerOverlayFades` / per-producer fade
tests update in lockstep (parity, not new coverage). The `{ kind: 'milkyWay' }`
disk fade gets ON→1 / OFF→0 assertions in `registerOverlayFades.test.ts`,
mirroring the label-layer case.

---

## Part 2 — Milky Way as a first-class selectable source

Builds on Part 0 (one resolved-target type) and Part 1 (`{ kind: 'milkyWay' }`
fade). Selectability level: **fully selectable** — clickable in-scene, an
InfoCard, and the standard select→focus path. Because of Part 0 there is **no
`Selection` variant to add** — only a resolved-target variant.

### `MilkyWayInfo` target

`FocusableTarget` widens:

```ts
export type FocusableTarget = GalaxyInfo | StructureRecord | MilkyWayInfo;
```

`MilkyWayInfo` is a static const (one type file, one value
`src/data/milkyWay/milkyWayInfo.ts`): a discriminant so `FocusableTarget` stays
discriminable (and `isStructure` keeps working), display name "Milky Way", a
one-line "Our home galaxy — you are here", barred-spiral type, and a distance
note ("≈ 8 kpc to the galactic centre; we are inside it"), plus the `x/y/z` of
`MILKY_WAY_CENTER_WORLD` so ring/focus readers treat it uniformly. No photometry,
no `(source, localIdx)` — it is not a catalog object. The InfoCard grows one
small branch keyed on the discriminant (no thumbnail; a glyph in the image slot).

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

`selectionRingPass` grows a milkyWay branch — the `selectionRingRenderer` is
already target-agnostic (`{ worldPos, ringRadiusPx }`), and the pass's own
docstring anticipates non-galaxy fold-ins. With Part 0 the pass already reads the
target: `worldPos = MILKY_WAY_CENTER_WORLD` (off `MilkyWayInfo`), `ringRadiusPx`
from the disk's apparent on-screen size (disk radius ≈ 25 kpc / camDist ×
pxPerRad) clamped to a min. `enabled()` returns true for galaxy **or** milkyWay
targets. Same on-select halo as any galaxy.

### Focus — generic, no MW-specific method

`camera.focusOn(target: FocusableTarget)` is the single public focus entry.
`commitFocus` dispatches on the target's kind:

- structure → `commitStructureFocus`
- milkyWay → tween to `MILKY_WAY_VIEW_DISTANCE_MPC` at `MILKY_WAY_CENTER_WORLD`,
  setting both the select and focus slots (so the InfoCard pins and any cluster
  focus collapses — a milkyWay focus resolves to a non-structure, so `runFrame`
  drops the member-isolation fade exactly as a galaxy focus does)
- galaxy → `commitGalaxyFocus`

The bespoke `focusOnMilkyWay` camera method is **retired** — its framing logic is
exactly the milkyWay dispatch branch. `focusOnHome` (the wide bbox "reset camera"
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
  `pickToSelection`'s Selection output, internal lazy resolution (Part 0).
- `scalarField` / `markerLayer` / `filaments` fade kind names; `overlay:'milkyWay'`;
  `StructureCategory` as a name (Part 1).
- `milkyWayEntry.ts` (sentinel `__milky-way__` + pseudo-entry); the `App.tsx`
  onSelect MW special-case; the `focusOnMilkyWay` standalone method (Part 2).

After this, the MW's identity / visibility / selection / focus all flow through
the same plumbing as every other source. Only the procedural-disk **renderer**
stays bespoke — by design.

## Plan split

Three plan files, in order:

1. **Selection/target unification** (Part 0): collapse `Selection` → `FocusableTarget`,
   pure `resolvePick`/`resolveGalaxyInfo`, drop `prebuiltInfo`, slot readers off
   the target.
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
