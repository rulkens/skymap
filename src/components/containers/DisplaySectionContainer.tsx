// src/components/containers/DisplaySectionContainer.tsx
/**
 * DisplaySectionContainer — store boundary for the Display settings section.
 *
 * Owns all Redux reach for the Display group: reads `selectToneMapCurve` and
 * wraps the `setToneMapCurve` dispatch in `useCallback`. The presentational
 * `DisplaySection` imports nothing from `store/` or `state/`.
 *
 * ### Handler stability
 *
 * `onToneMapCurveChange` closes over no store-read values — it only needs
 * `dispatch`, which is the invariant `store.dispatch` across the component's
 * lifetime. `[dispatch]` is the sole dep, giving the handler permanent stable
 * identity and letting `DisplaySection`'s `memo` bail correctly on parent
 * re-renders.
 */

import { memo, useCallback } from 'react';
import DisplaySection from '../SettingsPanel/DisplaySection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectToneMapCurve } from '../../state/settings/selectors';
import { setToneMapCurve } from '../../state/settings/settingsSlice';
import type { ToneMapCurve } from '../../@types/data/ToneMapCurve';

function DisplaySectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const toneMapCurve = useAppSelector(selectToneMapCurve);

  const onToneMapCurveChange = useCallback(
    (curve: ToneMapCurve) => dispatch(setToneMapCurve(curve)),
    [dispatch],
  );

  return <DisplaySection toneMapCurve={toneMapCurve} onToneMapCurveChange={onToneMapCurveChange} />;
}

export default memo(DisplaySectionContainer);
