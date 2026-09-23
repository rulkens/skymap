# Source-registry factory

> **Backlog item** · `needs-design` · area: Engine & State
> **Promote to:** a spec in `docs/superpowers/specs/` when picked up.

## Problem

Adding a star-catalog or scalar-volume source is a multi-site hand-edit.
`SOURCE_REGISTRY` (`src/data/sources.ts`) is already the single source of
truth for an entry's _metadata_ axes, but the _fetcher + slot + UI wiring_
are still authored per source. Galaxy catalogs no longer need this — plan
04c derived their point rows and slot-mint loop straight from the registry
entry. The remainder is the star-catalog and volume families: one
`SOURCE_REGISTRY` entry should auto-generate the fetcher, the GPU slot, and
the SettingsPanel rows for those too.

## Current state (verified 2026-09-15, post-04c)

Hand-wired per source:

- Dedicated slot files in `src/services/loading/slots/` (`cf4DensitySlot.ts`,
  `flowFieldSlot.ts`, `filamentSlot.ts`, `starCatalogSlot.ts`, …).
- A per-asset row in `ASSET_WIRING` (`src/services/engine/wiring/assetWiring.ts`):
  `starCatalogRow` per star catalog, one row per volume field.

The `add-data-source` skill — which exists to "map the full edit surface so
no parallel site is missed" — is itself the evidence this is still a
multi-site manual process for these two families.

## Direction

Drive fetcher + slot + UI-row creation off the registry entry so a new star
catalog or volume is one declarative addition. Watch the genuine differences
between source _kinds_ — they wire differently, so the factory likely
dispatches on a `kind`/`type` discriminant rather than collapsing them.

## Notes

- Pairs with the `add-data-source` skill (the checklist the factory would
  obsolete for these two families).
- Related: `BULK_CATALOG_CATEGORIES` registry-flag derivation (same "derive
  from the registry, stop hand-listing" theme).
