// src/components/containers/GalaxiesSectionContainer.tsx
/**
 * GalaxiesSectionContainer — store boundary for the Galaxies settings section.
 *
 * Owns all Redux reach for the Galaxies group: reads five settings selectors
 * plus `selectSourceCounts` from the engine slice, and wraps five dispatch
 * calls in `useCallback`. The presentational `GalaxiesSection` imports nothing
 * from `store/` or `state/`.
 *
 * `sourceCounts` is read from the engine Redux slice via `useAppSelector`
 * (the engine dispatches `engineSourceCountReported` as each catalog lands).
 * This replaces the old prop-threading path through App → SettingsPanel →
 * GalaxiesSectionContainer, keeping engine state reach in the container layer
 * as the Container convention requires.
 *
 * Why all handlers use `[dispatch]` only: `dispatch` from `useAppDispatch()` is
 * the invariant `store.dispatch` — it never changes across the component's
 * lifetime. Handlers that close over no store-read values only need `dispatch`
 * in their dep array, giving each handler permanent stable identity and letting
 * the presentational child's `memo` bail correctly on parent re-renders.
 *
 * `onToggleSource` calls `galaxyCatalogIdOf` to resolve the numeric source code
 * to a string `GalaxyCatalogId` for `setGalaxyCatalogVisible`. That cast is
 * safe because `TOGGLEABLE_SOURCES` is constrained to galaxy-catalog sources
 * only (see `GalaxiesSection.tsx`).
 */

import { memo, useCallback } from 'react';
import GalaxiesSection from '../SettingsPanel/GalaxiesSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectVisibleSourceMask,
  selectGalaxyCatalogSize,
  selectDepthFade,
  selectBiasMode,
  selectAbsMagLimit,
  selectGalaxySbScale,
  selectGalaxySbMax,
  selectGalaxyFalloffStrength,
} from '../../state/settings/selectors';
import { selectSourceCounts } from '../../state/engine/selectors';
import {
  setGalaxyCatalogVisible,
  setGalaxyCatalogSize,
  setDepthFade,
  setBiasMode,
  setAbsMagLimit,
  setGalaxySbScale,
  setGalaxySbMax,
  setGalaxyFalloffStrength,
} from '../../state/settings/settingsSlice';
import { galaxyCatalogIdOf } from '../../utils/galaxyCatalogIdOf';
import type { SourceType } from '../../@types/data/SourceType';
import type { BiasMode as BiasModeT } from '../../@types/data/galaxyCatalog/BiasMode';

function GalaxiesSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();

  // Per-source loaded point counts from the engine slice.  The engine
  // dispatches `engineSourceCountReported` as each catalog bin lands;
  // the selector accumulates them one source at a time.
  const sourceCounts = useAppSelector(selectSourceCounts);

  const visibleSourceMask = useAppSelector(selectVisibleSourceMask);
  const pointSize = useAppSelector(selectGalaxyCatalogSize);
  const depthFadeEnabled = useAppSelector(selectDepthFade);
  const biasMode = useAppSelector(selectBiasMode);
  const absMagLimit = useAppSelector(selectAbsMagLimit);
  const sbScale = useAppSelector(selectGalaxySbScale);
  const sbMax = useAppSelector(selectGalaxySbMax);
  const falloffStrength = useAppSelector(selectGalaxyFalloffStrength);

  const onToggleSource = useCallback(
    (source: SourceType, enabled: boolean) =>
      dispatch(setGalaxyCatalogVisible({ id: galaxyCatalogIdOf(source), enabled })),
    [dispatch],
  );

  const onPointSizeChange = useCallback(
    (sizePx: number) => dispatch(setGalaxyCatalogSize(sizePx)),
    [dispatch],
  );

  const onDepthFadeEnabledChange = useCallback(
    (enabled: boolean) => dispatch(setDepthFade(enabled)),
    [dispatch],
  );

  const onBiasModeChange = useCallback(
    (mode: BiasModeT) => dispatch(setBiasMode(mode)),
    [dispatch],
  );

  const onAbsMagLimitChange = useCallback(
    (absMag: number) => dispatch(setAbsMagLimit(absMag)),
    [dispatch],
  );

  const onSbScaleChange = useCallback((v: number) => dispatch(setGalaxySbScale(v)), [dispatch]);

  const onSbMaxChange = useCallback((v: number) => dispatch(setGalaxySbMax(v)), [dispatch]);

  const onFalloffStrengthChange = useCallback(
    (v: number) => dispatch(setGalaxyFalloffStrength(v)),
    [dispatch],
  );

  return (
    <GalaxiesSection
      visibleSourceMask={visibleSourceMask}
      onToggleSource={onToggleSource}
      sourceCounts={sourceCounts}
      pointSize={pointSize}
      onPointSizeChange={onPointSizeChange}
      depthFadeEnabled={depthFadeEnabled}
      onDepthFadeEnabledChange={onDepthFadeEnabledChange}
      biasMode={biasMode}
      onBiasModeChange={onBiasModeChange}
      absMagLimit={absMagLimit}
      onAbsMagLimitChange={onAbsMagLimitChange}
      sbScale={sbScale}
      onSbScaleChange={onSbScaleChange}
      sbMax={sbMax}
      onSbMaxChange={onSbMaxChange}
      falloffStrength={falloffStrength}
      onFalloffStrengthChange={onFalloffStrengthChange}
    />
  );
}

export default memo(GalaxiesSectionContainer);
