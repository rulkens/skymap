# Source-registry factory

> **Backlog item** · `needs-design` · area: Engine & State
> **Promote to:** a spec in `docs/superpowers/specs/` when picked up.

## Problem

Adding a data source is a multi-site hand-edit. `SOURCE_REGISTRY` (`src/data/sources.ts`) is already the single source of truth for an entry's _metadata_ axes (colourIndex, fluxLimits, tierTargets, drawMask, the settings-by-source-type rows), but the _fetcher + slot + UI wiring_ are still authored per source. The goal: one `SOURCE_REGISTRY` entry should auto-generate the fetcher, the GPU slot, and the SettingsPanel rows.

## Current state (verified 2026-06-29)

Hand-wired per source:

- Dedicated slot files in `src/services/loading/slots/` (`cf4DensitySlot.ts`, `mcpmSlot.ts`, `flowFieldSlot.ts`, `filamentSlot.ts`, …).
- A per-asset row in `ASSET_WIRING` (`src/services/engine/wiring/assetWiring.ts`).
- Point-slot minting in `initGpu` / `wireGalaxyCatalogSourceSlot`.

The existence of the `add-data-source` skill — which exists to "map the full edit surface so no parallel site is missed" — is itself the evidence that this is a multi-site manual process, not a single-entry factory.

## Direction

Drive fetcher + slot + UI-row creation off the registry entry so a new source is one declarative addition. Watch the genuine differences between source _kinds_ (survey vs structure vs volume vs singleton overlay) — they wire differently, so the factory likely dispatches on a `kind`/`type` discriminant rather than collapsing them.

## Notes

- Pairs with the `add-data-source` skill (the checklist the factory would obsolete).
- Related: `BULK_CATALOG_CATEGORIES` registry-flag derivation (same "derive from the registry, stop hand-listing" theme).
