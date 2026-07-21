// src/components/containers/DisplaySectionContainer.tsx
/**
 * DisplaySectionContainer — store boundary for the Display settings section.
 *
 * Owns all Redux reach for the Display group: reads `selectToneMapCurve` and
 * wraps the `setToneMapCurve` dispatch in `useCallback`. The presentational
 * `DisplaySection` imports nothing from `store/` or `state/`.
 *
 * Nested subgroups (e.g. `EarthSectionContainer`) are passed in as `children`
 * and forwarded to `DisplaySection`, keeping each subgroup's store reach in its
 * own container rather than drilling through here.
 *
 * ### Handler stability
 *
 * The handler closes over no store-read values — it only needs `dispatch`,
 * which is the invariant `store.dispatch` across the component's lifetime.
 * `[dispatch]` is the sole dep, giving the handler permanent stable identity
 * and letting `DisplaySection`'s `memo` bail correctly on parent re-renders.
 */

import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import DisplaySection from '../SettingsPanel/DisplaySection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectToneMapCurve,
  selectBloomEnabled,
  selectBloomStrength,
  selectBloomThreshold,
} from '../../state/settings/selectors';
import {
  setToneMapCurve,
  setBloomEnabled,
  setBloomStrength,
  setBloomThreshold,
} from '../../state/settings/settingsSlice';
import type { ToneMapCurve } from '../../@types/data/ToneMapCurve';

type DisplaySectionContainerProps = {
  /** Nested subgroups rendered inside the Display disclosure (e.g. Earth). */
  children?: ReactNode;
};

function DisplaySectionContainer({ children }: DisplaySectionContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const toneMapCurve = useAppSelector(selectToneMapCurve);
  const bloomEnabled = useAppSelector(selectBloomEnabled);
  const bloomStrength = useAppSelector(selectBloomStrength);
  const bloomThreshold = useAppSelector(selectBloomThreshold);

  const onToneMapCurveChange = useCallback(
    (curve: ToneMapCurve) => dispatch(setToneMapCurve(curve)),
    [dispatch],
  );
  const onBloomEnabledChange = useCallback(
    (next: boolean) => dispatch(setBloomEnabled(next)),
    [dispatch],
  );
  const onBloomStrengthChange = useCallback(
    (next: number) => dispatch(setBloomStrength(next)),
    [dispatch],
  );
  const onBloomThresholdChange = useCallback(
    (next: number) => dispatch(setBloomThreshold(next)),
    [dispatch],
  );

  return (
    <DisplaySection
      toneMapCurve={toneMapCurve}
      onToneMapCurveChange={onToneMapCurveChange}
      bloomEnabled={bloomEnabled}
      onBloomEnabledChange={onBloomEnabledChange}
      bloomStrength={bloomStrength}
      onBloomStrengthChange={onBloomStrengthChange}
      bloomThreshold={bloomThreshold}
      onBloomThresholdChange={onBloomThresholdChange}
    >
      {children}
    </DisplaySection>
  );
}

export default memo(DisplaySectionContainer);
