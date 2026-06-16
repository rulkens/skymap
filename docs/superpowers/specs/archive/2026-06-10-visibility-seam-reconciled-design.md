# Settings snapshot/restore seam — reconciled design

> **Folded into
> [`2026-06-15-fade-ownership-visibility-seam-merged-design.md`](../2026-06-15-fade-ownership-visibility-seam-merged-design.md)
> as Plan B.** The merged design builds `VISIBILITY_LAYERS` as the intent-bearing
> subset of the one fade manifest (so it isn't defined twice). This doc remains the
> **detailed reference** for the seam's shape (snapshot type, the per-row registry
> table, round-trip test) that Plan B implements.
>
> **Status:** approved (Option A — full consolidation).
> **Supersedes** §2 ("Settings snapshot/restore seam") of
> `docs/superpowers/specs/2026-06-08-pre-tour-decomplection-design.md`, which was
> written against the *pre-reshape* settings geography (a 7-fold
> `VisibilitySnapshot` anchored on `sources.drawMask`,
> `volumes.{masterEnabled,fields}`, and the two flat category records). Those
> shapes were deleted by the settings-by-source-type reshape (#295) and the
> demand/render-wake refactors (#298–#300). This document is the source of truth
> for the seam; the umbrella decomplection spec stays the source of truth for the
> camera-driver authority (§1) and the tour wiring (§3).

## Why a seam at all

The guided tour stages *scenes*: "show only 2MRS and the Virgo ring, hide
everything else, fly here," then put everything back exactly as the user left it
when the scene ends or the tour is skipped. That needs two operations a caller
should not hand-roll against the settings tree:

1. **capture** the current visibility of every toggleable layer, detached from
   live state, so it can be restored verbatim;
2. **set** layers on/off programmatically — sometimes **instantly** (a hard cut,
   or a fast restore on skip), sometimes **ramped** (a cinematic effect that
   *wants* the cross-fade).

## What the reshape changed (and why this is now simple)

Before #295 this was genuinely awkward — survey visibility lived in a bitmask,
volumes used a `masterEnabled`/`fields` shape, and structure categories had **no**
synchronous boolean at all (producers read fade opacity directly), so an instant
apply had to reach behind the fade controller. After #295 + #298–#300 every
toggleable layer has the **same** anatomy:

- an **intent boolean** in `settings` — the single source of truth the renderer
  and the demand loader both read;
- a **fade controller**, addressed by a `FadeHandle`, holding the cosmetic
  animated opacity the producer multiplies into alpha;
- `drawMask`/`pickMask` are **derived** (`deriveSourceMasks`) from survey intent +
  live fade opacity — nothing writes them directly anymore;
- survey **demand follows intent** (#298), not the fade-tail mask, so writing the
  intent boolean is sufficient to make the loader react next frame.

So the seam collapses to: *copy the intent (settings), and bridge intent to
animation (fades) in one place.*

## The two braids this removes

1. **A snapshot shape that mirrors settings but isn't settings.** A bespoke
   `VisibilitySnapshot = { filamentsEnabled, surveys: Record<…>, … }` forces a
   field-by-field *projection* on read and the inverse on write — a translation
   layer that must be edited every time `settings` grows or renames a field. This
   is the same braid as the React-mirror-shape follow-up
   (`2026-06-10-react-settings-mirror-shape-design.md`): a parallel shape chosen
   independently of the authoritative one.
2. **The intent↔handle pairing duplicated per layer.** Each interactive setter
   (`setSourceVisible`, `setStructureItemEnabled`, …) encodes "this boolean ↔ that
   fade handle." A second programmatic write-path that re-encodes the same
   pairings is a fresh copy of the same fact in two homes.

## The un-braided shape

### 1. The snapshot **is** settings

```ts
// src/@types/engine/settings/SettingsSnapshot.d.ts  (one type per file, plain data)
import type { EngineSettingsState } from './EngineSettingsState';

export type SettingsSnapshot = Readonly<
  Pick<
    EngineSettingsState,
    'surveys' | 'structures' | 'volumes' | 'filaments' | 'milkyWay' | 'flow'
  >
>;
```

The snapshot reuses the engine's own cluster shapes — no parallel geography.
`captureSettings(state)` is a **`structuredClone`** of those six sub-bags (detached
from live state so a held snapshot does not drift). There is no field
enumeration: add a field to `settings.surveys` tomorrow and the snapshot carries
it for free.

This deliberately snapshots **whole clusters**, so non-visibility look knobs
(`surveys.sizePx`, `volumes.items[id].intensity`, …) ride along. That is *more*
correct for the tour — if a scene changed brightness, restore puts it back — and
it is the choice that buys the zero-translation property. (The old "visibility-only"
scope guard is intentionally relaxed; narrowing back to visibility-only would
reintroduce a projection.) Clusters that have **no** fade-backed visibility
(`tonemap`, `bias`, `camera`, `thumbnails`, `debug`) stay out of the snapshot —
restoring them is a separate concern with no fade to bridge.

### 2. One value→time bridge

```ts
// src/services/engine/settings/syncVisibilityFades.ts
syncVisibilityFades(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'data'>,
  opts: { animate: boolean; only?: readonly VisibilityLayerKey[] },
): void
```

`syncVisibilityFades` is the **single home** for the intent↔handle pairing. It
walks a `VISIBILITY_LAYERS` registry (one row per fade-backed layer), reads each
layer's intent boolean from `settings`, and drives its fade controller toward it:

- `animate: true` → `fades.fadeTo(handle, target, dur)` (the cross-fade);
- `animate: false` → `fades.setImmediate(handle, target)` (a hard cut).

It does **not** write `settings` and does **not** echo React — it is purely the
bridge from intent (already in `settings`) to animation (the fade controllers).

#### The render-wake split (reconciled to #300)

#300 made `fades.fadeTo` own the render wake — it calls `requestRender()`
unconditionally, so the animate path needs no explicit wake. But `setImmediate`
**deliberately does not wake** (`fadeRegistry.ts` docblock: it "runs from
already-awake settings paths"). A tour-triggered instant restore is not
necessarily mid-frame, so:

- `animate: true` → no `requestRender` (each `fadeTo` wakes; the scheduler
  coalesces).
- `animate: false` → `syncVisibilityFades` calls
  `state.subsystems.scheduler.requestRender()` **once** after the `setImmediate`
  batch — the batch caller owns the wake the per-call mouth doesn't provide.

### 3. The layer registry

`VISIBILITY_LAYERS` is the discriminated enumeration of every fade-backed layer.
Each row carries the asymmetries that the scattered setters encode today, so the
registry is the *only* place they live:

| Layer | Iterates over | Intent boolean (read/write) | Fade handle | Per-row specifics |
|---|---|---|---|---|
| survey | each `SurveyId` | `surveys.items[id].enabled` | `{ kind:'survey', source }` | handle keys on `SourceType`, settings on `SurveyId` (`SOURCE_REGISTRY[source].id`); post: `deriveSourceMasks(state)` |
| survey label | each `SurveyId` *with* a `labelLayer` | `surveys.items[id].labelEnabled` | `{ kind:'labelLayer', layer }` | layer resolved from `SOURCE_ENTRIES[id].labelLayer` (only famous → `'galaxyNames'` today); label-free surveys have no row (flag is render-inert) |
| structure ring | each `StructureCategory` | `structures.items[cat].enabled` | `{ kind:'markerLayer', category }` | — |
| structure label | each `StructureCategory` | `structures.items[cat].labelEnabled` | `{ kind:'labelLayer', layer:'structure', category }` | — |
| volume field | each present `VolumeFieldId` | `volumes.items[id].enabled` | `{ kind:'scalarField', field }` | write via `writeVolumeFieldSetting` (copy-on-write; no-op if row absent); post: `maybeLazyLoadDebugVolume(id)` on enable |
| volumes master | singleton | `volumes.enabled` | `{ kind:'volumesMaster' }` | — |
| filaments | singleton | `filaments.enabled` | `{ kind:'filaments' }` | — |
| milkyWay | singleton | `milkyWay.enabled` | `{ kind:'overlay', id:'milkyWay' }` | — |
| flow | singleton | `flow.enabled` | `{ kind:'flow' }` | **drive-guard**: fire the fade only when `data.flow.loaded` (the first-enable fade is owned by the slot commit, mirroring `flow.set`) |

### 4. The public seam

```ts
// src/services/engine/settings/captureSettings.ts
captureSettings(state: Pick<EngineState, 'settings'>): SettingsSnapshot

// src/services/engine/settings/restoreSettings.ts
restoreSettings(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'data'>,
  snapshot: SettingsSnapshot,
  opts: { animate: boolean },
  cb?: …,            // optional React echo (see below)
): void
```

- `restoreSettings` deep-assigns the snapshot's clusters back into `state.settings`,
  then calls `syncVisibilityFades(state, { animate })`. Demand re-evaluates next
  frame from the restored intent (#298). If `cb` is supplied it echoes the
  affected clusters (so a reopened SettingsPanel matches reality); the tour may
  omit `cb` while the panel is hidden.
- `applyEffect(patch, { animate })` is the partial variant the tour uses for a
  single scene: deep-assign `patch` over `state.settings`, then
  `syncVisibilityFades(state, { animate, only: <touched layers> })`.

### 5. The interactive setters route through the bridge (the consolidation)

The four `handles/` setters and the volume/filaments/milkyWay/flow setters in
`engine.ts` keep their public signatures and their **React echo**, but their
intent↔handle dispatch becomes a call into the shared bridge: write the intent
boolean (via the registry row's writer where one is needed, e.g. the volume
copy-on-write), then `syncVisibilityFades(state, { animate: true, only: [layer] })`,
then echo. The result:

- the boolean↔handle pairing lives in **one** registry, consumed by both the
  checkbox path and the tour path — a checkbox click and a tour effect run the
  same code;
- the per-layer post-hooks (`deriveSourceMasks`, `maybeLazyLoadDebugVolume`, the
  flow `loaded` guard) live in the registry row, not duplicated in a setter and
  again in the seam.

This is **behaviour-preserving**: the existing fade tests
(`setSourceVisibleFade.test.ts`, `setCategoryVisibleFade.test.ts`,
`flowFieldsHandle.test.ts`, volume/filament/milkyWay coverage) must stay green
unchanged — same settings writes, same handles, same durations, same echoes.

## Decisions baked in

- **Snapshot = `Pick<EngineSettingsState, …>`**, deep-cloned. No bespoke shape, no
  projection. Whole clusters (look knobs ride along) to keep zero translation.
- **One bridge, one registry.** `syncVisibilityFades` + `VISIBILITY_LAYERS` are
  the single home for intent→animation and the intent↔handle pairing.
- **`syncVisibilityFades` does fades only** — not settings writes, not React
  echoes. Those stay with the caller (deep-assign for the seam; the setter body
  for the checkbox path).
- **Render-wake:** animate path relies on `fadeTo`'s wake (#300); instant path
  issues one `requestRender` after the `setImmediate` batch.
- **Demand is untouched** — it already follows intent (#298); restoring intent is
  sufficient.

## Scope guards (non-goals)

- **No** mask→registry migration; `drawMask`/`pickMask` stay derived.
- **No** `sources.tier` into settings.
- **No** `tonemap`/`bias`/`camera`/`thumbnails`/`debug` in the snapshot — they have
  no fade-backed visibility; a separate concern if the tour ever needs them.
- **No** new fade-handle `kind`s — the registry reuses the exact handles the
  producers already read.
- Keep `setSourceVisibleImpl`'s no-await, recompute-from-truth behaviour (#295/#298)
  — the bridge does not reintroduce an async fade-out-then-clear.

## Testing strategy

- **Round-trip (the core acceptance test):** `captureSettings` → mutate several
  clusters via `restoreSettings`/`applyEffect` → `restoreSettings(original)` →
  `captureSettings` deep-equals the first snapshot. Proves the tour can never
  leave the scene in a state the user didn't start in.
- **Detachment:** mutating `state.settings` after `captureSettings` does not change
  a held snapshot (structuredClone, not alias).
- **`syncVisibilityFades({animate:false})`** calls `setImmediate` for each layer
  with the correct handle + 0/1 and issues exactly one `requestRender`; **never**
  `fadeTo`.
- **`syncVisibilityFades({animate:true})`** calls `fadeTo` per layer with the
  correct handle + target + FADE_IN/OUT duration; issues **no** `requestRender`.
- **Per-row specifics:** survey rows call `deriveSourceMasks`; the flow row fires
  no fade when `data.flow.loaded === false`; the volume row writes via
  `writeVolumeFieldSetting` and no-ops on an absent field; a label-free survey has
  no row.
- **Consolidation regressions:** the existing fade tests pass unchanged.

## Execution

One PR off `main` (branch `settings-snapshot-seam`), executed via
`subagent-driven-development`. Behaviour-preserving throughout: the new seam ships
with its own tests; the setter consolidation keeps the existing fade tests green.
After this lands, the tour engine-seed plan
(`docs/superpowers/plans/2026-05-20-splash-screen-02-stub-tour.md`, §3 of the
umbrella spec) wires `snapshot`/`restore`/`applyEffect` onto `captureSettings` /
`restoreSettings` / `applyEffect`.
