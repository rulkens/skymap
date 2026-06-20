// src/components/containers/GalaxiesSectionContainer.tsx
/**
 * GalaxiesSectionContainer — store boundary for the Galaxies settings section.
 *
 * Owns all Redux reach for the Galaxies group: reads five settings selectors
 * and wraps five dispatch calls in `useCallback`. The presentational
 * `GalaxiesSection` imports nothing from `store/` or `state/`.
 *
 * `sourceCounts` is the only prop threaded in from the parent — it comes from
 * the engine's async catalog-landing events, not from the Redux store, so the
 * parent (App or a future EngineContext) still owns it. All counts are
 * low-frequency (one arrival per bin load), so prop-threading them does not
 * undermine the re-render win.
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
} from '../../state/settings/selectors';
import {
  setGalaxyCatalogVisible,
  setGalaxyCatalogSize,
  setDepthFade,
  setBiasMode,
  setAbsMagLimit,
} from '../../state/settings/settingsSlice';
import { galaxyCatalogIdOf } from '../../utils/galaxyCatalogIdOf';
import type { SourceType } from '../../@types/data/SourceType';
import type { BiasMode as BiasModeT } from '../../@types/data/galaxyCatalog/BiasMode';

export type GalaxiesSectionContainerProps = {
  /**
   * Per-source loaded point counts. Engine-absent before any catalog lands;
   * the presentational section renders toggles without counts when undefined.
   */
  sourceCounts?: Partial<Record<SourceType, number>>;
};

function GalaxiesSectionContainer({
  sourceCounts,
}: GalaxiesSectionContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();

  const visibleSourceMask = useAppSelector(selectVisibleSourceMask);
  const pointSize = useAppSelector(selectGalaxyCatalogSize);
  const depthFadeEnabled = useAppSelector(selectDepthFade);
  const biasMode = useAppSelector(selectBiasMode);
  const absMagLimit = useAppSelector(selectAbsMagLimit);

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
    />
  );
}

export default memo(GalaxiesSectionContainer);
