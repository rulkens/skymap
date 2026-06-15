# Milky Way as a First-Class Source — Design

**Date:** 2026-06-15
**Status:** Design (awaiting plan)
**Backlog item:** "Promote the Milky Way to a first-class `Source` (streamline its identity)" (`docs/BACKLOG.md`)

## Goal

Make the Milky Way's **identity / visibility / selection / focus** flow through
the same plumbing as every other source, retiring the bespoke identity hacks.
Its procedural-disk **renderer** stays its own subsystem — only the identity
axis is unified.

Alongside, fix a naming inconsistency the MW's absence exposed: the `FadeId`
union names its per-source-render fades three different ways, and the MW disk
fade is buried inside `overlay`. Bring the fade-layer names into line with the
source-type names.

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

---

## Part 1 — Fade-layer / source naming consistency

A refactor with **no behavior change**: green tests before and after.

### Diagnosis

`FadeId` mixes two axes — *which source* and *which render aspect* — and names
its kinds inconsistently:

| Current kind   | Discriminator             | Named by    | Source type        |
| -------------- | ------------------------- | ----------- | ------------------ |
| `galaxyCatalog`| `id: GalaxyCatalogId`     | source ✓    | galaxyCatalog      |
| `scalarField`  | `field: VolumeFieldId`    | render-tech | volume             |
| `markerLayer`  | `category: StructureCategory` | aspect  | structure          |
| `filaments`    | —                         | source (plural) | filament       |
| `flow`         | —                         | source ✓    | flow               |
| `overlay`      | `id: OverlayId`           | aspect      | milkyWay + galaxy-LOD |
| `labelLayer`   | `layer` (+`category?`)    | aspect      | cross-source       |
| `volumesMaster`| —                         | aspect      | volume             |

`galaxyCatalog`, `markerLayer`, and `scalarField` are the **same shape** (one
fade per source-level id) named three different ways. The MW disk is buried in
`overlay`.

### Target — Model A

Name every **primary-render** fade by its source type with an `id` discriminator.
Labels stay on the cross-source `labelLayer` axis (labels genuinely span sources
and have their own director — `galaxyNames` is shared across all famous galaxies;
folding labels into per-source kinds would be a large, risky restructure for
little gain — the rejected "Model B").

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

Decisions (confirmed during brainstorm):

- **Volume kind name = `volumeField`** (matches the `VolumeFieldId` type).
- **`structure`** kind with `id: StructureId` (was `markerLayer` / `category`).
- **`filament`** singular (matches the `filament` source type).

### `serializeFadeId` updates in lockstep

```ts
case 'structure':   return `structure:${h.id}`;
case 'volumeField': return `volumeField:${h.id}`;
case 'milkyWay':    return 'milkyWay';
case 'filament':    return 'filament';
// labelLayer key unchanged in shape (still layer + optional category suffix)
```

### MW disk fade moves out of `overlay`

- `OverlayId` drops `'milkyWay'` → `'proceduralDisks' | 'texturedDisks'` (the two
  galaxy-LOD render passes that legitimately remain always-on overlays).
- The MW disk fade is now `{ kind: 'milkyWay' }`. Repoint:
  - `milkyWayPass` reads `opacityOf({ kind: 'milkyWay' })`.
  - `registerOverlayFades` seeds `{ kind: 'milkyWay' }` from
    `state.settings.milkyWay.enabled ? 1 : 0` (it already seeds the label layer
    from `labelEnabled`).
  - The disk toggle handle (`setEnabled` / `EngineMilkyWayHandle.setEnabled`)
    `fadeTo`s `{ kind: 'milkyWay' }`.

### Repo-wide rename `StructureCategory` → `StructureId`

`StructureCategory` is `Extract<AnyEntry, { type: 'structure' }>['id']` — the
**source-level** id (`cluster` / `supercluster` / `void` / `group`), the exact
parallel of `GalaxyCatalogId` and `VolumeFieldId`. Rename it everywhere so the
codebase carries the parallel triple `GalaxyCatalogId / StructureId / VolumeFieldId`
with no two-names-one-concept. `'category'` is a POI-era leftover.

Scope of the sweep (mechanical, type-checker-guarded):

- The type file `src/@types/data/structure/StructureCategory.d.ts` → `StructureId.d.ts`.
- Every `StructureCategory` reference: settings keys, marker buckets, label
  categories, `pickToSelection`, the runtime companion `STRUCTURE_CATEGORIES`
  (rename the file/symbol to match), and their tests.
- `StructureId` is distinct in meaning from the per-record `StructureRecord.id`
  (e.g. `"A2703"`). The fade is keyed per-source-id (per category), exactly as
  `GalaxyCatalogId` keys per-catalog, not per-galaxy — so the name is sound. The
  rename docblock must state this to forestall confusion with the record id.

### Part 1 testing

Existing fade-registry / serialize / `registerOverlayFades` / per-producer fade
tests update in lockstep (parity, not new coverage). The `{ kind: 'milkyWay' }`
disk fade gets ON→1 / OFF→0 assertions in `registerOverlayFades.test.ts`,
mirroring the label-layer case.

---

## Part 2 — Milky Way as a first-class selectable source

Builds on Part 1's `{ kind: 'milkyWay' }` fade. Selectability level: **fully
selectable** — clickable in-scene, an InfoCard, and the standard select→focus
path.

### Selection variant

```ts
// src/@types/engine/subsystems/Selection.d.ts
export type MilkyWaySelection = { kind: 'milkyWay' };
export type Selection = GalaxySelection | StructureSelection | MilkyWaySelection;
```

`selectionEq` gains: both `milkyWay` → equal (singleton, no payload).

### Pick — strategy #1, pick-only

A tiny **screen-size-clamped pick billboard** at `MILKY_WAY_CENTER_WORLD` stamps
`pack(Source.MilkyWay, 0) + PICK_SENTINEL_OFFSET` into the r32uint pick texture.

- A small dedicated pick provider (mirrors `structureMarkerRenderer.pickRing` /
  `proceduralDiskRenderer.pickDisks`), called inside the existing pick pass —
  same unified pick texture, no CPU special-case.
- Clamped to a min pixel size so it is hittable at any zoom (like a galaxy point).
- **Invisible** (pick-only): the visible affordances are the existing disk
  impostor + the "You are here" label. No always-on marker.
- **Gated on MW disk visibility** — only contributes to the pick texture when the
  MW is on screen (both disk and label have faded out by the home framing, so the
  MW is never pickable at hundreds of Mpc — correct).

`pickToSelection` grows a branch:

```ts
if (entry?.type === 'milkyWay') return { kind: 'milkyWay' };
```

The decode (`unpackPick`) is unchanged — code 16 already round-trips.

### InfoCard target

`FocusableTarget` widens:

```ts
export type FocusableTarget = GalaxyInfo | StructureRecord | MilkyWayInfo;
```

`MilkyWayInfo` is a static const (one type, one value — `src/data/milkyWay/milkyWayInfo.ts`):
discriminant for the InfoCard, display name "Milky Way", a one-line "Our home
galaxy — you are here", barred-spiral type, and a distance note ("≈ 8 kpc to the
galactic centre; we are inside it"). No photometry / no `(source, localIdx)` —
it is not a catalog object.

`selectionSubsystem.resolveTarget` returns it for the `milkyWay` kind:

```ts
if (sel.kind === 'milkyWay') return MILKY_WAY_INFO;
```

The InfoCard grows one small branch keyed on the discriminant to render the MW
card (no thumbnail; a glyph or the impostor motif in the image slot).

### Selection ring

`selectionRingPass` grows a `sel.kind === 'milkyWay'` branch — the
`selectionRingRenderer` is already target-agnostic (`{ worldPos, ringRadiusPx }`),
and the pass's own docstring anticipates non-galaxy fold-ins:

- `worldPos = MILKY_WAY_CENTER_WORLD`.
- `ringRadiusPx` from the disk's apparent on-screen size (disk radius ≈ 25 kpc /
  camDist × pxPerRad), clamped to a sensible min so it reads at any zoom.
- `enabled()` returns true for `sel.kind === 'galaxy' || sel.kind === 'milkyWay'`.

Same on-select halo behavior as any galaxy.

### Focus

New `commitMilkyWayFocus` (parallel to `commitGalaxyFocus` / `commitStructureFocus`):

```ts
export function commitMilkyWayFocus(state: EngineState): void {
  const selection = { kind: 'milkyWay' as const };
  state.subsystems.selection.setSelected(selection);
  state.subsystems.selection.setFocused(selection);  // collapses any cluster focus
  tweenToCameraSnapshot(state, {
    target: [...MILKY_WAY_CENTER_WORLD],
    distance: MILKY_WAY_VIEW_DISTANCE_MPC,
    yaw: state.cam.yaw, pitch: state.cam.pitch,
    fovYRad: state.cam.fovYRad, near: state.cam.near, far: state.cam.far,
  });
}
```

- `setFocused({ kind: 'milkyWay' })` resolves to a non-structure focus, so
  `runFrame` collapses the member-isolation fade exactly as a galaxy focus does
  (verify `runFrame` treats non-`structure` focus kinds as "no structure" — it
  already does for `galaxy`; `milkyWay` falls in the same bucket).
- The bespoke `focusOnMilkyWay` camera method is **retired** — its framing logic
  is exactly this commit. A thin `selection.selectMilkyWay()` handle (on the
  selection handle namespace) calls `commitMilkyWayFocus`.
- `focusOnHome` (the wide bbox "reset camera" framing, bound to the reset button /
  keyboard) is **unchanged** — it is a different gesture.

Single click selects (InfoCard + ring); double-click and the palette focus (tween)
— same interaction grammar as galaxies and structures.

### Palette

- **Delete** `src/data/milkyWay/milkyWayEntry.ts` (sentinel + `FamousMetaEntry`
  masquerade) and the `App.tsx` `onSelect` `=== MILKY_WAY_ID` interception.
- The palette gets a **typed MW command** (a first-class palette entry that is not
  a `FamousMetaEntry`) whose select action calls `selection.selectMilkyWay()` —
  the same select→focus path `selectFamous` uses.
- `FamousMetaEntry.pseudo` and the glyph-fallback path: if `pseudo` exists solely
  for this MW pseudo-entry, retire it; if other entries use it, leave it. (Verify
  during planning.)

### Part 2 testing

- `selectionEq` — milkyWay self-equality and milkyWay-vs-other.
- `pickToSelection` — code 16 → `{ kind: 'milkyWay' }`.
- `resolveTarget` — `{ kind: 'milkyWay' }` → `MILKY_WAY_INFO`.
- `selectionRingPass` — `enabled()` true for milkyWay; ring worldPos = galactic center.
- `commitMilkyWayFocus` — sets both slots, tweens to the MW framing, collapses
  structure focus.
- Palette — the typed MW command routes to `selectMilkyWay`, no sentinel.

---

## What gets retired (summary)

- `milkyWayEntry.ts` (sentinel `__milky-way__` + pseudo-entry).
- `App.tsx` onSelect MW special-case.
- `focusOnMilkyWay` standalone camera method.
- `overlay:'milkyWay'` (→ `{ kind: 'milkyWay' }`).
- `StructureCategory` as a name (→ `StructureId`).
- `scalarField` / `markerLayer` / `filaments` fade kind names.

After this, the MW's identity / visibility / selection / focus all flow through
the same plumbing as every other source. Only the procedural-disk **renderer**
stays bespoke — by design.

## Plan split

Two plan files, in order:

1. **Naming consistency** (refactor, no behavior change): `FadeId` Model A,
   `serializeFadeId`, `OverlayId` shrink, MW disk fade → `{ kind: 'milkyWay' }`,
   repo-wide `StructureCategory` → `StructureId`.
2. **MW selectable** (feature, on top of Plan 1): `Selection` variant, pick
   provider + `pickToSelection` branch, `MilkyWayInfo` + `resolveTarget` +
   InfoCard branch, selection-ring branch, `commitMilkyWayFocus` +
   `selectMilkyWay` handle, palette typed command, delete the sentinel + onSelect
   special-case + `focusOnMilkyWay`.

## Out of scope (deferred)

- Model B (full source × aspect `FadeId`).
- Reworking the procedural-disk renderer (stays bespoke).
- Any change to `focusOnHome` (reset-camera) semantics.
