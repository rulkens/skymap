# Singleton overlay layers

> **Audience.** You're adding (or touching) a renderer overlay that is _one
> global layer_ the user toggles on and off — filaments, the Milky-Way
> impostor, the flow field — not a per-point survey and not a per-field volume.
>
> **Status.** Skymap convention. It names the pattern those layers already
> follow so the next one slots in the same way instead of inventing a fourth
> mechanism.

## TL;DR

A singleton overlay layer keeps **all user-facing state in `settings.<layer>`**
and keeps its **`data.<layer>` store status-only**. Demand reads
`settings.<layer>.enabled`; the renderer reads the rest of `settings.<layer>`
each frame; the asset slot's commit flips `data.<layer>.setLoaded()`. No
bespoke `DemandCtx` surface, no `enabled` bit on the store, no second home for
the same value.

## What counts as a singleton overlay layer

One global on/off layer drawn over the scene, with at most a handful of scalar
/ enum knobs. Examples: `filaments` (enabled + intensity), `milkyWay`
(enabled), `flow` (enabled + mode + look/motion knobs).

It is **not**:

- A **per-point survey source** (SDSS, GLADE, 2MRS, Famous, Milliquas).
  Those carry per-survey `enabled` rows in `settings.surveys.items` (which
  demand reads via `DemandCtx.isVisible`), and the _render_ hot path is
  gated by the per-source `drawMask` — a 32-bit bitmask, derived from those
  settings + fade opacity, with ~600M lookups/sec. drawMask exists for that
  per-point performance; do not extend it to singleton layers, and do not
  fold singleton layers' visibility into it.
- A **per-field scalar volume** (CF-4 density, MCPM). Those carry per-field
  params (`enabled` / `intensity` / `palette` / …) in `settings.volumes.items`
  and are gated by the direct settings read
  `settings.volumes.items[id]?.enabled`. A singleton layer has exactly one
  instance, so it needs neither a per-field record nor a field-id key.

If the thing you're adding is one of those two, follow their pattern instead.

## The four rules

1. **User-facing state lives in `settings.<layer>`.** The master `enabled`
   gate plus every simple scalar/enum knob. Shape it like the existing
   singletons — `settings.filaments = { enabled, intensity }`,
   `settings.flow = { enabled, mode, intensity, … }`. Defaults live in
   `data/defaults.ts` (one `DEFAULT_<LAYER>` seed), shared with the engine's
   initial `settings` object and with App.tsx so the panel never flashes a
   stale value.

2. **The `data.<layer>` store is status-only.** It carries only what the CPU
   owns about loading — `loaded` plus any geometry counts — exactly like
   `FilamentStore` (`{ loaded, stripCount, vertexCount, setLoaded(…) }`). No
   `enabled`, no user knobs. GPU resources live on the renderer, never the
   store.

3. **Demand reads `settings.<layer>.enabled`.** The asset-wiring row's
   `demand(ctx)` predicate reads the existing `ctx.settings` surface
   (`(ctx) => ctx.settings.<layer>.enabled`). Do **not** add a bespoke
   `DemandCtx` surface for the layer — `settings` already expresses it.

4. **The renderer reads `settings.<layer>` each frame; commit flips
   `loaded`.** The per-frame pass reads the look/motion knobs straight off
   `settings.<layer>`; the asset slot's commit calls
   `data.<layer>.setLoaded()` once the geometry/cube is uploaded.

## Why — the fragmentation this prevents

Before this convention, singleton-layer toggles were expressed three different
ways: `settings.X.enabled` (filaments, milkyWay), a per-field
`settings.volumes.items[id]?.enabled` read (volumes — correct _for volumes_,
which are per-field), and, briefly, a bespoke one-off `DemandCtx.flow` surface
backed by an `enabled` bit on the data store. The third put the same value in
two places (store + ctx) and added a read surface that only one row used. Rule
1 + rule 3 collapse that: one home for the value, read through the surface
that already exists.

## Worked reference — flow

Flow is the canonical example as of its integration:

- `settings.flow = { enabled, mode, intensity, count, trail, flowSpeed,
densityBias, wander }` — see `@types/settings/EngineSettingsState.d.ts`,
  seeded from `DEFAULT_FLOW` in `data/defaults.ts`.
- `FlowFieldStore = { loaded, setLoaded() }` — status-only, mirrors
  `FilamentStore`. See `@types/engine/data/FlowFieldStore.d.ts`.
- Demand: the `flow` row in `services/engine/wiring/assetWiring.ts` reads
  `(ctx) => ctx.settings.flow.enabled`. No `DemandCtx.flow` surface.
- Commit: `services/loading/slots/flowFieldSlot.ts` calls
  `state.data.flow.setLoaded()`.
