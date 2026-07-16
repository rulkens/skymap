// src/components/containers/StarsSectionContainer.tsx
/**
 * StarsSectionContainer — store boundary for the star-catalogs settings section.
 *
 * Owns all Redux reach for the star-catalogs group: reads the cluster via
 * `selectStarCatalogs` (master gate + shared size + shared brightness + refine
 * threshold + glow overlap + the two exposure-ramp anchors + per-catalog items)
 * and wraps its dispatch calls in `useCallback`. The presentational
 * `StarsSection` imports nothing from `store/` or `state/`.
 *
 * The master toggle maps to `setStarCatalogEnabled` (a real gate on
 * `starCatalogs.enabled`), NOT a per-source fan-out like the Galaxies master —
 * the star-catalogs cluster owns that gate field (Task 5). The per-catalog rows
 * map to `setStarCatalogVisible`, the Advanced star-size slider to
 * `setStarCatalogSize`, and the star-brightness slider to
 * `setStarCatalogBrightness` (the twins of the Galaxies point-size + brightness
 * dispatches). The two lattice knobs unique to the octree-cut renderer map to
 * `setStarCatalogRefineThreshold` (the "Detail" slider) and
 * `setStarCatalogGlowOverlap` (the "Glow overlap" slider). The two
 * exposure-ramp anchors map to `setStarCatalogExposureNearX` /
 * `setStarCatalogExposureFarX` (the "Exposure (near/far)" tuning sliders).
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
  setStarCatalogBrightness,
  setStarCatalogRefineThreshold,
  setStarCatalogGlowOverlap,
  setStarCatalogExposureNearX,
  setStarCatalogExposureFarX,
  setStarCatalogVisible,
} from '../../state/settings/settingsSlice';
import type { StarCatalogId } from '../../@types/data/starCatalog/StarCatalogId';

function StarsSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();

  const {
    enabled,
    sizePx,
    brightness,
    refineThreshold,
    glowOverlap,
    exposureNearX,
    exposureFarX,
    items,
  } = useAppSelector(selectStarCatalogs);

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

  const onRefineThresholdChange = useCallback(
    (next: number) => dispatch(setStarCatalogRefineThreshold(next)),
    [dispatch],
  );

  const onGlowOverlapChange = useCallback(
    (next: number) => dispatch(setStarCatalogGlowOverlap(next)),
    [dispatch],
  );

  const onExposureNearXChange = useCallback(
    (next: number) => dispatch(setStarCatalogExposureNearX(next)),
    [dispatch],
  );

  const onExposureFarXChange = useCallback(
    (next: number) => dispatch(setStarCatalogExposureFarX(next)),
    [dispatch],
  );

  return (
    <StarsSection
      enabled={enabled}
      items={items}
      sizePx={sizePx}
      brightness={brightness}
      refineThreshold={refineThreshold}
      glowOverlap={glowOverlap}
      exposureNearX={exposureNearX}
      exposureFarX={exposureFarX}
      onToggleMaster={onToggleMaster}
      onToggleCatalog={onToggleCatalog}
      onSizeChange={onSizeChange}
      onBrightnessChange={onBrightnessChange}
      onRefineThresholdChange={onRefineThresholdChange}
      onGlowOverlapChange={onGlowOverlapChange}
      onExposureNearXChange={onExposureNearXChange}
      onExposureFarXChange={onExposureFarXChange}
    />
  );
}

export default memo(StarsSectionContainer);
