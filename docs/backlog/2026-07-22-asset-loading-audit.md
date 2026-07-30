# Asset-loading audit + Asset debug UI design sweep

`needs-design`

## The problem

Two related asks:

1. **Audit the loading policy** — what loads, when, and what never unloads. The wiring is demand-driven, but almost nothing ever releases: once a volume, catalog tier, or structure catalog loads it stays resident for the session. Establish the actual memory story (JS heap vs GPU) and add load/evict-on-demand where it pays.
2. **Design-sweep the Asset debug UI** — `AssetLoadingSection` renders one row per slot, and the slot count has grown (catalog×tier bins, per-body textures, volumes, star catalogs, sidecars) to the point where the flat list is clunky.

## Verified current state

- Registry: `src/services/engine/wiring/assetWiring.ts:203-313` — `ASSET_WIRING` rows `{key, factory, req, demand, release?}`. Demand predicates exist for every row; `release` exists for **body textures only** (`:186-201` — load inside `loadRadiusMpc(body)`, release past 2×, hysteresis gap prevents thrash). Filaments, MCPM, CF4 density, flow, structure catalog, star catalogs, galaxy catalogs: demand-load, never release.
- Demand loop: `src/services/engine/wiring/reevaluateDemand.ts` re-runs the whole table on any relevant state change and re-issues `req(tier)`.
- Slot machinery: `src/services/loading/AssetSlot.ts` (forceReload/cancel/subscribe), fetchers + slot builders under `src/services/loading/`, `aggregateRegistry.ts` snapshots for UI.
- Debug UI: `src/components/DebugPanel/AssetLoadingSection.tsx` — subscribes to every slot (`:40-46`), one `SlotRow` each with state/summary/Reload/Cancel (`:76-108`), MB progress formatting (`:111-126`). Toggled via `d` (`useKeyboardShortcuts.ts:129-132`).

## The inventory half is done

The "what loads, when, and how big" audit was completed during the boot load-priority grill: `docs/grill-sessions/boot-load-priority-2026-07-24.md`. It carries the full `ASSET_WIRING` row-by-row inventory, per-asset byte sizes, defaults, and the ~101.7 MB boot total (~420 MB at tier `large`). Do not redo it.

What remains here is the **policy** half (eviction/residency) and the **debug UI** sweep.

## Directions to explore (design decides)

- **Policy, informed by the inventory above** — what a tier switch leaves behind (does the old tier's bin/GPU buffers linger?), volumes after layer-off.
- **Eviction candidates** — old-tier catalog bins on tier switch; volumes when their layer disables; texture atlas already has LRU. Follow the body-texture hysteresis pattern (`release` in the wiring row) rather than a new mechanism.
- **Debug UI sweep** — group rows by category (catalogs / volumes / textures / sidecars), collapse idle slots, aggregate totals (N loaded, X MB), keep Reload/Cancel on expand. Fold into the DebugPanel modules+containers migration (existing backlog item).

## Open questions

- Is memory pressure real on target devices, or is this hygiene? Measure before adding eviction complexity.
- Should any of this surface user-facing (loading indicator) or stay debug-only?

## Related

- DebugPanel sections → modules + containers: `backlog/2026-06-30-debugpanel-sections-modules-containers.md` (the UI sweep should ride or follow it).
- Source-registry factory: `backlog/2026-06-29-source-registry-factory.md` (same wiring table is its subject).
