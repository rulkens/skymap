// src/components/containers/DisplaySectionContainer.tsx
/**
 * DisplaySectionContainer — store boundary for the Display settings section.
 *
 * Owns all Redux reach for the Display group: reads `selectToneMapCurve` +
 * `selectAtmosphereExposure` and wraps the `setToneMapCurve` /
 * `setAtmosphereExposure` dispatches in `useCallback`. The presentational
 * `DisplaySection` imports nothing from `store/` or `state/`.
 *
 * ### Handler stability
 *
 * Both handlers close over no store-read values — they only need `dispatch`,
 * which is the invariant `store.dispatch` across the component's lifetime.
 * `[dispatch]` is the sole dep, giving each handler permanent stable identity
 * and letting `DisplaySection`'s `memo` bail correctly on parent re-renders.
 */

import { memo, useCallback } from 'react';
import DisplaySection from '../SettingsPanel/DisplaySection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectToneMapCurve, selectAtmosphereExposure } from '../../state/settings/selectors';
import { setToneMapCurve, setAtmosphereExposure } from '../../state/settings/settingsSlice';
import type { ToneMapCurve } from '../../@types/data/ToneMapCurve';

function DisplaySectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const toneMapCurve = useAppSelector(selectToneMapCurve);
  const atmosphereExposure = useAppSelector(selectAtmosphereExposure);

  const onToneMapCurveChange = useCallback(
    (curve: ToneMapCurve) => dispatch(setToneMapCurve(curve)),
    [dispatch],
  );

  const onAtmosphereExposureChange = useCallback(
    (value: number) => dispatch(setAtmosphereExposure(value)),
    [dispatch],
  );

  return (
    <DisplaySection
      toneMapCurve={toneMapCurve}
      onToneMapCurveChange={onToneMapCurveChange}
      atmosphereExposure={atmosphereExposure}
      onAtmosphereExposureChange={onAtmosphereExposureChange}
    />
  );
}

export default memo(DisplaySectionContainer);
