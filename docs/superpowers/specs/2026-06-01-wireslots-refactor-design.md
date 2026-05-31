# wireSlots Refactor (Tier-1) — Design

- **Status:** Draft
- **Date:** 2026-06-01
- **Author:** Alexander Rulkens
- **ADR:** [0005](../../adrs/0005-engine-data-layer-and-asset-loading.md)
- **Sequence:** Spec 1 of 3 (ship first). Precedes
  [data stores](2026-06-01-engine-data-stores-design.md) and
  [presentation realignment](2026-06-01-poi-presentation-realignment-design.md).

## Summary

`wireSlots` is a ~530-line bootstrap phase doing eight jobs. This spec is the
**rework-proof first slice**: relocate the four non-loading concerns out of the
phase, adopt construction purity (factories return, never install), and replace
the three scattered slot passes + ~5 ad-hoc load triggers with the
**demand-driven** model from ADR 0005. It is deliberately scoped to *not* require
the per-type data-store reorg (Spec 2) — it operates against the current
`state.sources.*` / `state.assetSlots.*` shape, and what it touches there is
mechanical to rename when Spec 2 lands.

Goal: `wireSlots` becomes a thin orchestrator — build slots from a registry,
install once, wire non-loading subsystems via extracted modules, run the initial
demand evaluation.

## What moves out of `wireSlots`

Four concerns leave the phase as pure relocation (logic unchanged):

1. **Impostor-subsystem construction** → `wireImpostorSubsystems(state, deps)`.
   Builds galaxyAtlas, hiResFamousTexture + hiResFamous, texturedDisks,
   proceduralDisks; binds the atlas + hi-res views into the disk renderer;
   assigns `state.subsystems.*`. (Currently `wireSlots` L302–365.)
2. **Fade-handle registration** → `registerOverlayFades(state)`. Registers the
   overlay / volumesMaster / label-layer handles at their settings-derived
   opacities. (Currently L367–411.)
3. **POI merge → keyed groups** → `wirePoiProjection(state)` (interim home) +
   `poiSubsystem` gains `setGroup`/`clearGroup`. Each projection (static anchors,
   famous join, bulk clusters) writes its own keyed group; the subsystem
   concatenates internally. The central `rebuildAllPois` is deleted. (Currently
   L107–228; see ADR 0005 §"POI is a consumer".)
4. **Synthetic-fallback gate** → `createSyntheticFallback(state)`. A small unit
   that owns the "all real surveys settled without success → load synthetic"
   logic, reading its survey set from the wiring registry. (Currently L417–494.)

## The asset-wiring registry

A new declarative module `services/engine/wiring/assetWiring.ts` exposes
`ASSET_WIRING: readonly AssetWiringRow[]`, keyed by `AssetKey` (every fetchable
`Source` + `clusterCatalog` + `famousMeta` + `pgcAlias`).

```ts
type AssetKey = SourceType | 'clusterCatalog' | 'famousMeta' | 'pgcAlias';

type AssetWiringRow<T = unknown, R = unknown> = {
  key: AssetKey;
  // Pure constructor: builds + subscribes + RETURNS the slot. Does NOT
  // write state.assetSlots and does NOT call slot.load().
  factory: (deps: SlotDeps) => AssetSlot<T, R>;
  // Build the request from the current tier (void/empty for tier-agnostic).
  req: (tier: Tier) => R;
  // Required iff true. Replaces the load-policy union. See DemandCtx.
  demand: (ctx: DemandCtx) => boolean;
};
```

`SlotDeps` is the existing `(state, cb)`-style carrier (kept — the project
already rejected per-field DI for uniformity; see `SlotFactory` docstring), but
factories consume it read-mostly and return the slot.

### Demand model

```ts
type DemandCtx = {
  settings: EngineSettingsView;        // enable flags
  isVisible: (s: SourceType) => boolean; // drawMask
  request: (k: RequestKey) => boolean;   // one-shot flags (e.g. paletteOpened)
  slotState: (k: AssetKey) => LoadStateKind; // for fallback + joins
};

function reevaluateDemand(state: EngineState): void {
  for (const row of ASSET_WIRING)
    if (row.demand(ctx(state)))
      state.assetSlots[row.key]?.load(row.req(state.sources.tier));
  // slot.load is idempotent → already-loading/ready rows are no-ops.
}
```

Triggers that call `reevaluateDemand`: boot; settings change; visibility toggle;
a request flag set; any slot state transition (covers the famous 2-asset join and
the synthetic fallback). The two event-driven cases keep their explicit
triggering code but no longer hardcode their slot set:

- **Palette aliases:** `loadPgcAliases()` sets `request('paletteOpened')` then
  re-evaluates; the `pgcAlias` row's `demand` reads that flag.
- **Synthetic fallback:** `createSyntheticFallback` subscribes to survey slot
  transitions and sets the condition the `Synthetic` row's `demand` reads.

Example rows (demand replaces the old scattered behavior):

| key | demand (ctx) | note |
|---|---|---|
| SDSS/2MRS/Glade/Milliquas | `ctx.isVisible(src)` | was boot-if-visible |
| Famous | `ctx.isVisible(Famous)` | dual-role; also feeds POI |
| famousMeta | `ctx.slotState('Famous') !== 'idle'` | companion = predicate on owner |
| filaments | `ctx.settings.filaments.enabled` | **fixes** today's load-when-disabled |
| mcpm | `ctx.settings.volumes.fields.mcpm.enabled` | default-on ⇒ true at boot |
| cf4Density | `ctx.settings.volumes.fields['cf4-density'].enabled` | default-off |
| clusterCatalog | `ctx.settings.structures.enabled` | **fixes** unconditional boot load |
| pgcAlias | `ctx.request('paletteOpened')` | lazy |
| Synthetic | `allSurveysSettledWithoutSuccess(ctx)` | fallback |
| debug volumes | `ctx.settings.volumes.fields[id].enabled` (DEV) | panel-toggled |

## Construction purity & single install

Factories drop their `state.assetSlots.X = slot` install line and their inline
`state.subsystems.fades.register(...)` becomes the responsibility of the
extracted `registerOverlayFades` / the slot's own commit where it is a per-slot
fade. `wireSlots` becomes:

```ts
export async function wireSlots(state, deps) {
  // 1. Build every slot from the registry (pure constructors).
  const slots = buildSlotsFromRegistry(ASSET_WIRING, slotDeps(state, deps));
  installSlots(state, slots);             // the single mutation site
  // 2. Non-loading subsystems (extracted).
  wireImpostorSubsystems(state, deps);
  registerOverlayFades(state);
  wirePoiProjection(state);
  const fallback = createSyntheticFallback(state);
  // 3. Load-progress emitter over the now-complete slot set.
  installLoadProgress(state, deps);
  // 4. Fire status + initial demand evaluation (replaces the boot loop).
  deps.cb.lifecycle?.onStatusChange?.({ kind: 'loading' });
  reevaluateDemand(state);
}
```

`allSlots` population (the repeated `as unknown as AssetSlot<unknown,unknown>`
casts) is replaced by iterating the registry-built `slots` map once inside
`installLoadProgress`.

## Data flow

```
ASSET_WIRING ──factory(pure)──▶ slots map ──installSlots──▶ state.assetSlots
                                                  │
settings / visibility / requests / slot transitions
                                                  ▼
                                          reevaluateDemand ──▶ slot.load(req) (idempotent)
                                                  │
                                          fetch → commit → store write → requestRender
```

## Error handling

- Phase preconditions (renderer/device non-null) keep their explicit throws.
- Slot commit/error semantics are unchanged (per-slot graceful degradation:
  famousMeta → `[]`, clusterCatalog → `null`, etc.).
- A `demand` predicate that throws must not break the loop: `reevaluateDemand`
  guards each row and logs, so one bad predicate can't stall every asset.

## Testing

- **Unit:** each extracted module (`wireImpostorSubsystems`,
  `registerOverlayFades`, `wirePoiProjection`, `createSyntheticFallback`) tested
  in isolation against a stub `state`.
- **Demand table:** a data-driven test asserts, for representative settings/
  visibility/request states, exactly which rows `reevaluateDemand` loads — this
  is the regression net for the scattered-trigger consolidation.
- **POI keyed groups:** assert that out-of-order group arrivals never clobber
  (the bug the merge worked around); a famous group only appears once both Famous
  catalog + famousMeta are present.
- **Bootstrap integration:** existing `wireSlots.test.ts` / `bootstrap.test.ts`
  stay green (behavior parity), updated for the new structure.

## Out of scope (later specs)

- Renaming `state.sources.*` to per-type stores → Spec 2. (This spec writes the
  registry/predicates against the current shape; the rename is mechanical.)
- Splitting the per-frame label/marker producers + evicting famous-galaxy labels
  → Spec 3. Famous galaxies remain an interim labeled-anchor member until then.
