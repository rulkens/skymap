// src/layers/galaxyCatalog/ui/GalaxiesSectionContainer.tsx
/**
 * GalaxiesSectionContainer — store boundary for the Galaxies settings section:
 * reads five settings selectors plus `selectSourceCounts`, wraps five dispatch
 * calls in `useCallback` (all keyed on `[dispatch]` only — invariant, so each
 * handler has stable identity and the presentational child's `memo` bails
 * correctly). `GalaxiesSection` itself imports nothing from `store/`/`state/`.
 */

import { memo, useCallback } from 'react';
import GalaxiesSection from './GalaxiesSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  selectVisibleSourceMask,
  selectGalaxyCatalogSize,
  selectDepthFade,
  selectGalaxySbScale,
  selectGalaxySbMax,
  selectGalaxyFalloffStrength,
} from '../state/galaxyCatalogs/selectors';
import { selectBiasMode, selectAbsMagLimit } from '../state/bias/selectors';
import { selectSourceCounts } from '../../../state/engine/selectors';
import {
  setGalaxyCatalogVisible,
  setGalaxyCatalogSize,
  setDepthFade,
  setGalaxySbScale,
  setGalaxySbMax,
  setGalaxyFalloffStrength,
} from '../state/galaxyCatalogs/slice';
import { setBiasMode, setAbsMagLimit } from '../state/bias/slice';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import type { SourceType } from '../../../@types/data/SourceType';
import type { BiasMode as BiasModeT } from '../../../@types/data/galaxyCatalog/BiasMode';

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
