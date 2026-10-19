# Exhibits rebuild settings clusters by hand behind `as Record<…>` casts

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`mergeSettingsSnapshot.ts:41` replaces a whole cluster (the takeover camera-cluster line already covers the merge). On top of that, `src/layers/missions/exhibits/voyagerMissions.ts:51-52` writes `orbitTrails: { enabled: true }` as a bare literal and `:56-71` rebuilds `items` as `{ enabled: false, labelEnabled: false }` under `as Record<GalaxyCatalogId|StructureId, …>`; `solarSystem.ts` hand-lists every `picking.kinds` entry. `src/data/exhibits/utils/surveysOff.ts:14-22` spreads `...item` and is safe. `computeSceneEntering.ts:31-33,43` folds only settings-route actions.

## Direction

Author exhibit scene effects as per-item patches over the live item (the `surveysOff` form), and add a lint or test banning `as Record<` in `exhibits/` data. Lands with or after the per-cluster patch merge.
