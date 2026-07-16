// src/components/containers/StarsSectionContainer.tsx
/**
 * StarsSectionContainer — store boundary for the star-catalogs settings section.
 *
 * Owns all Redux reach for the star-catalogs group: reads the cluster via
 * `selectStarCatalogs` (master gate + shared size + per-catalog items) and wraps
 * three dispatch calls in `useCallback`. The presentational `StarsSection`
 * imports nothing from `store/` or `state/`.
 *
 * The master toggle maps to `setStarCatalogEnabled` (a real gate on
 * `starCatalogs.enabled`), NOT a per-source fan-out like the Galaxies master —
 * the star-catalogs cluster owns that gate field (Task 5). The per-catalog rows
 * map to `setStarCatalogVisible`, and the Advanced star-size slider to
 * `setStarCatalogSize` (the twin of the Galaxies point-size dispatch).
 * `setStarCatalogLabelEnabled` is intentionally left unwired here: star labels
 * live in the separate Labels section, mirroring how the Galaxies section
 * exposes no per-catalog label toggle.
 *
 * Why both handlers use `[dispatch]` only: `dispatch` from `useAppDispatch()` is
 * the invariant `store.dispatch`, so a `[dispatch]`-only dep array gives each
 * handler permanent stable identity and lets the child's `memo` bail on parent
 * re-renders.
 */

import { memo, useCallback } from 'react';
import StarsSection from '../SettingsPanel/StarsSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectStarCatalogs } from '../../state/settings/selectors';
import {
  setStarCatalogEnabled,
  setStarCatalogSize,
  setStarCatalogVisible,
} from '../../state/settings/settingsSlice';
import type { StarCatalogId } from '../../@types/data/starCatalog/StarCatalogId';

function StarsSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();

  const { enabled, sizePx, items } = useAppSelector(selectStarCatalogs);

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

  return (
    <StarsSection
      enabled={enabled}
      items={items}
      sizePx={sizePx}
      onToggleMaster={onToggleMaster}
      onToggleCatalog={onToggleCatalog}
      onSizeChange={onSizeChange}
    />
  );
}

export default memo(StarsSectionContainer);
