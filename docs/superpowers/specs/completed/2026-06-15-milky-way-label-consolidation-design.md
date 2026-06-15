# Milky Way label consolidation — design

**Status:** design / awaiting review
**Date:** 2026-06-15
**Branch:** `milky-way-label-consolidation`

## Goal

Fold the bespoke `youAreHere` label subsystem into the standard
category-label machinery, so the Milky Way's "You are here" label works
"exactly like the other labels" (structures, famous galaxies) — driven by a
SOURCE_REGISTRY row, a user toggle, the label director, and the fade
registry — while keeping its signature distance fade.

This is the second half of the work that began by bringing `milkyWay` into
`SOURCE_REGISTRY` (PR #312). That row currently carries `bearsLabel: false`
as a placeholder; this change flips it to `true` and wires the consequences.

## Current state

Two separate things share the name "Milky Way":

- **The disk overlay** (`milkyWayRenderer` / `milkyWayPass`) — toggled by
  `settings.milkyWay.enabled` (→ the `overlay:milkyWay` fade) AND faded by
  camera distance in the renderer. Both axes multiply. This is the part that
  already has "a toggle and a distance fade".

- **The "You are here" label** (`youAreHereSubsystem`, a `LabelProducer`) —
  emits one label + a marker-line stem at the origin. Its alpha is
  `youAreHereAlpha(camDist)` (full ≤ 0.6 Mpc, gone ≥ 2 Mpc). It owns its own
  `LabelLayerId` `'youAreHere'`, whose layer fade just auto-fades to 1 on
  first appearance — it is **not** user-toggleable and is **not** tied to the
  disk toggle. This is the half-consolidated part: the label lacks the on/off
  axis every other label has.

The other labels (`produceStructureLabels`, `produceFamousLabels`) are
registry-driven: each `bearsLabel: true` row declares a `labelLayer`, the
fade registry holds a per-category label fade keyed by
`settings.<cluster>.items[id].labelEnabled`, and the producer emits text +
computes its own `fadeAlpha`.

## Target design

Make the Milky Way label a first-class category label:

### Registry

- `sources/milky-way.ts` row: `bearsLabel: true`, `labelLayer: 'milkyWay'`,
  plus the required copy `detailLabel` / `shortLabel` / `plural` (all
  `'Milky Way'` — it is a singleton, so the plural the SettingsPanel header
  uses is just the name).
- This widens `LABEL_CATEGORIES` / `LabelCategory` to include `'milkyWay'`,
  and `CATEGORY_DISPLAY_INFO` picks up its copy automatically.

### Label layer

- Rename `LabelLayerId` `'youAreHere'` → `'milkyWay'` and add `'milkyWay'` to
  `CategoryLabelLayer` (`Extract<LabelLayerId, 'galaxyNames' | 'structure' | 'milkyWay'>`).
- The fade registry's `{ kind: 'labelLayer', layer: 'milkyWay' }` handle is
  now registered at `settings.milkyWay.labelEnabled` in `registerOverlayFades`
  (the same pattern structures use), so frame 1 honours the persisted toggle.

### Settings

- `settings.milkyWay` gains a label axis:
  `{ enabled: boolean /* disk */, labelEnabled: boolean /* label */ }`.
- Seeded from the registry row at construction: `enabled` from `visible`,
  `labelEnabled` defaults `true` (the label was always-on-by-distance before).
- A `setMilkyWayLabelEnabled` action/reducer/selector mirrors the existing
  `setMilkyWayEnabled` and `setStructureLabelEnabled` trio.

### Producer — delete the subsystem, use a bare producer function

`youAreHereSubsystem` is the only label producer implemented as a stateful
_subsystem_ (with `destroy()` + a teardown slot); `produceStructureLabels` /
`produceFamousLabels` are bare functions registered via inline
`{ produceLabels }` wrappers in `engine.ts`. The subsystem exists solely for
its `didFireFadeIn` one-shot latch. The toggle model makes that latch
redundant (the load-in fade follows the `produceStructureLabels` pattern: a
module-level per-layer latch fires `fadeTo(1)` once on first intended-visible
emit), so the Milky Way label can be a bare function like the others.

- **Delete `youAreHereSubsystem`** — the file, its `@types`
  (`YouAreHereSubsystem`), its `EngineSubsystemHandles` slot, and its
  teardown / `initGpu` / `startLoop` / director-registration wiring.
- **Add `produceMilkyWayLabel(state, ctx)`** as a bare function in
  `src/services/engine/presentation/`, mirroring `produceStructureLabels`,
  registered via an inline `{ produceLabels }` wrapper in `engine.ts` next to
  the structure/famous registrations. It keeps:
  - the fixed label text **"You are here"** (the user-chosen wording; the
    registry `label` `'Milky Way'` drives only the settings/toggle UI, not the
    3D text);
  - the marker-line stem;
  - the distance fade `youAreHereAlpha(camDist)`.
- Effective label/line alpha = `youAreHereAlpha(camDist) × layerOpacity('milkyWay')`.
  The authoritative gate is `settings.milkyWay.labelEnabled`: skip wholesale
  when disabled AND faded to 0, keep emitting the fade-out tail otherwise —
  exactly the `produceStructureLabels` shape.

### Why the distance fade stays a producer concern

The distance fade is Milky-Way-specific: the label sits at the origin and is
only meaningful up close, unlike cluster/galaxy labels anchored at their
objects. Each producer already owns its own `fadeAlpha` (structures fade by
focus recession), so keeping `youAreHereAlpha` inside the milkyWay producer
introduces no asymmetry in the shared layer machinery — the layer fade is the
uniform toggle axis; per-producer alpha logic is expected to differ.

## Decisions (from brainstorming)

1. **Rendered text:** keep `"You are here"` (iconic orientation cue). Registry
   `label`/`id` is `Milky Way`/`milkyWay` for settings + toggle UI only.
2. **Toggle axis:** independent `labelEnabled`, separate from the disk
   `enabled` — exactly like structures separate ring vs label. The label can
   show without the disk and vice-versa.

## Blast radius

~30 files reference `'youAreHere'`. The rename + rewire touches:

- `@types/animation/LabelLayerId` (+ `CategoryLabelLayer`), `FadeId`.
- `sources/milky-way.ts` + `MilkyWaySourceEntry` (`bearsLabel` etc.).
- `@types/settings/EngineSettingsState` (`milkyWay.labelEnabled`) + the
  settings seed in `engine.ts` + `data/defaults.ts` + test fixtures.
- DELETE `youAreHereSubsystem` (+ its `@types/.../YouAreHereSubsystem`, the
  `EngineSubsystemHandles.youAreHere` slot, `initGpu`/`startLoop` wiring, and
  the teardown registration); ADD `produceMilkyWayLabel` in `presentation/`
  registered inline in `engine.ts` (replacing the
  `registerProducer(state.subsystems.youAreHere)` call at engine.ts:603).
- `registerOverlayFades` (register the `milkyWay` label layer at the toggle).
- `youAreHereVisibility` → `milkyWayLabelVisibility` (or keep the filename,
  rename the layer only — TBD in plan, lower-risk to rename for consistency).
- SettingsPanel (a Milky Way label toggle row), DebugPanel
  `LabelEffectsSection` + `labelStyleOverride` target `'youAreHere'` →
  `'milkyWay'`, `Splash.tsx`.
- Settings store: `setMilkyWayLabelEnabled` action/reducer/selector +
  `settingsTable` wiring + `EngineMilkyWayHandle`.

## Testing

- Registry: `milkyWay` row is `bearsLabel: true`, `labelLayer: 'milkyWay'`,
  carries display copy; `LABEL_CATEGORIES` includes `'milkyWay'`;
  `CATEGORY_DISPLAY_INFO['milkyWay']` resolves.
- Producer: emits the label + line at full alpha ≤ 0.6 Mpc and empty ≥ 2 Mpc
  (distance fade preserved); emits nothing when `labelEnabled` is off.
- Settings store: `setMilkyWayLabelEnabled` toggles only the label axis,
  leaving the disk `enabled` untouched (and vice-versa).
- Fade: `registerOverlayFades` seeds the `milkyWay` label layer at the
  persisted `labelEnabled` (frame-1 honours a last-session-off toggle).

## Out of scope

- No change to the disk overlay's existing toggle + distance fade.
- No change to the label's wording or anchor position beyond the toggle wiring.
- The `scaleBar` / other singleton label layers stay as-is.

## Risks

- Broad rename (`'youAreHere'` → `'milkyWay'`) across ~30 files; mechanical but
  must stay in lockstep across types, fade keys, and the DebugPanel target
  string. TypeScript + the existing label tests are the guard.
- `bearsLabel: true` makes `CATEGORY_DISPLAY_INFO` throw at construction if the
  copy fields are missing — the registry row must add all three.
