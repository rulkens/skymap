/**
 * StarsSectionContainer — store boundary for the star-catalogs settings section.
 *
 * Owns all Redux reach for the star-catalogs group: reads the cluster via
 * `selectStarCatalogs` (master gate + shared size + shared brightness +
 * per-catalog items) and wraps its dispatch calls in `useCallback`. The presentational
 * `StarsSection` imports nothing from `store/` or `state/`.
 *
 * The master toggle maps to `setStarCatalogEnabled` (a real gate on
 * `starCatalogs.enabled`), NOT a per-source fan-out like the Galaxies master —
 * the star-catalogs cluster owns that gate field, and it governs every row in
 * the cluster, the curated famous-star map included. The per-catalog rows
 * map to `setStarCatalogVisible`, the Advanced star-size slider to
 * `setStarCatalogSize`, and the star-brightness slider to
 * `setStarCatalogBrightness` (the twins of the Galaxies point-size + brightness
 * dispatches).
 * `setStarCatalogLabelEnabled` is intentionally left unwired here: star labels
 * live in the separate Labels section, mirroring how the Galaxies section
 * exposes no per-catalog label toggle.
 *
 * Per-catalog loaded counts ride the same engine slice the Galaxies section
 * reads: the star-catalog slot dispatches `engineSourceCountReported` as each
 * bin lands, keyed by the catalog's numeric `SourceType`. Because the section
 * iterates string `StarCatalogId`s, this container re-keys `selectSourceCounts`
 * (a `SourceType` map) into a `StarCatalogId` map via the registry, memoized on
 * the raw counts so the child's `memo` still bails on unrelated re-renders. A
 * seeded catalog reports no count and simply renders without a chip — the same
 * contract a not-yet-loaded survey row keeps.
 *
 * Why the handlers use `[dispatch]` only: `dispatch` from `useAppDispatch()` is
 * the invariant `store.dispatch`, so a `[dispatch]`-only dep array gives each
 * handler permanent stable identity and lets the child's `memo` bail on parent
 * re-renders.
 */

import { memo, useCallback, useMemo } from 'react';
import StarsSection from './StarsSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectStarCatalogs } from '../state/starCatalogs/selectors';
import { selectSourceCounts } from '../../../state/engine/selectors';
import {
  setStarCatalogEnabled,
  setStarCatalogSize,
  setStarCatalogBrightness,
  setStarCatalogVisible,
} from '../state/starCatalogs/slice';
import { STAR_CATALOG_IDS } from '../../../data/starCatalog/starCatalogIds';
import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import type { StarCatalogId } from '../../../@types/data/starCatalog/StarCatalogId';
import type { SourceType } from '../../../@types/data/SourceType';

function StarsSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();

  const { enabled, sizePx, brightness, items } = useAppSelector(selectStarCatalogs);

  // Per-catalog loaded counts from the engine slice, keyed by numeric
  // `SourceType`. Re-key into the string `StarCatalogId` domain the section
  // iterates; memoized on the raw counts so the derived map keeps a stable
  // identity across unrelated re-renders (preserving the child's `memo` bail).
  const sourceCounts = useAppSelector(selectSourceCounts);
  const counts = useMemo<Partial<Record<StarCatalogId, number>>>(() => {
    const byId: Partial<Record<StarCatalogId, number>> = {};
    for (const id of STAR_CATALOG_IDS) {
      const code = SOURCE_ENTRIES.find((e) => e.id === id)?.code as SourceType | undefined;
      const count = code !== undefined ? sourceCounts[code] : undefined;
      if (count !== undefined) byId[id] = count;
    }
    return byId;
  }, [sourceCounts]);

  const onToggleMaster = useCallback(
    (next: boolean) => dispatch(setStarCatalogEnabled(next)),
    [dispatch],
  );

  const onToggleCatalog = useCallback(
    (id: StarCatalogId, next: boolean) => dispatch(setStarCatalogVisible({ id, enabled: next })),
    [dispatch],
  );

  const onSizeChange = useCallback(
    (next: number) => dispatch(setStarCatalogSize(next)),
    [dispatch],
  );

  const onBrightnessChange = useCallback(
    (next: number) => dispatch(setStarCatalogBrightness(next)),
    [dispatch],
  );

  return (
    <StarsSection
      enabled={enabled}
      items={items}
      counts={counts}
      sizePx={sizePx}
      brightness={brightness}
      onToggleMaster={onToggleMaster}
      onToggleCatalog={onToggleCatalog}
      onSizeChange={onSizeChange}
      onBrightnessChange={onBrightnessChange}
    />
  );
}

export default memo(StarsSectionContainer);
