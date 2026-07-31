// src/components/containers/DisplaySectionContainer.tsx
/**
 * DisplaySectionContainer — store boundary for the Display settings section.
 *
 * Owns all Redux reach for the Display group: the orientation frame, the tone-map
 * curve and exposure, the HDR master toggle + its two headroom knobs, the live
 * `hdrCapable` read off the engine slice, and the bloom trio — each dispatch
 * wrapped in `useCallback`. The presentational `DisplaySection` imports nothing
 * from `store/` or `state/`.
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
  selectOrientation,
  selectToneMapCurve,
  selectExposure,
  selectHdrEnabled,
  selectHdrKnee,
  selectHdrHeadroom,
  selectBloomEnabled,
  selectBloomStrength,
  selectBloomThreshold,
} from '../../state/settings/selectors';
import { selectHdrCapable } from '../../state/engine/selectors';
import {
  setToneMapCurve,
  setExposure,
  setHdrEnabled,
  setHdrKnee,
  setHdrHeadroom,
  setBloomEnabled,
  setBloomStrength,
  setBloomThreshold,
} from '../../state/settings/settingsSlice';
import { requestOrientationChange } from '../../state/camera/orientationActions';
import type { ToneMapCurve } from '../../@types/data/ToneMapCurve';
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';

type DisplaySectionContainerProps = {
  /** Nested subgroups rendered inside the Display disclosure (e.g. Earth). */
  children?: ReactNode;
};

function DisplaySectionContainer({ children }: DisplaySectionContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const orientation = useAppSelector(selectOrientation);
  const toneMapCurve = useAppSelector(selectToneMapCurve);
  const exposure = useAppSelector(selectExposure);
  const hdrEnabled = useAppSelector(selectHdrEnabled);
  const hdrCapable = useAppSelector(selectHdrCapable);
  const hdrKnee = useAppSelector(selectHdrKnee);
  const hdrHeadroom = useAppSelector(selectHdrHeadroom);
  const bloomEnabled = useAppSelector(selectBloomEnabled);
  const bloomStrength = useAppSelector(selectBloomStrength);
  const bloomThreshold = useAppSelector(selectBloomThreshold);

  // Dispatch the single intent and nothing else: the orientation saga captures
  // the live up-basis and fires setOrientation + startFrameTween. The container
  // never touches the camera slice nor reads a quaternion.
  const onOrientationChange = useCallback(
    (frame: OrientationFrameId) => dispatch(requestOrientationChange(frame)),
    [dispatch],
  );
  const onToneMapCurveChange = useCallback(
    (curve: ToneMapCurve) => dispatch(setToneMapCurve(curve)),
    [dispatch],
  );
  const onExposureChange = useCallback((next: number) => dispatch(setExposure(next)), [dispatch]);
  const onHdrEnabledChange = useCallback(
    (next: boolean) => dispatch(setHdrEnabled(next)),
    [dispatch],
  );
  const onHdrKneeChange = useCallback((next: number) => dispatch(setHdrKnee(next)), [dispatch]);
  const onHdrHeadroomChange = useCallback(
    (next: number) => dispatch(setHdrHeadroom(next)),
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
      orientation={orientation}
      onOrientationChange={onOrientationChange}
      toneMapCurve={toneMapCurve}
      onToneMapCurveChange={onToneMapCurveChange}
      exposure={exposure}
      onExposureChange={onExposureChange}
      hdrEnabled={hdrEnabled}
      onHdrEnabledChange={onHdrEnabledChange}
      hdrCapable={hdrCapable}
      hdrKnee={hdrKnee}
      onHdrKneeChange={onHdrKneeChange}
      hdrHeadroom={hdrHeadroom}
      onHdrHeadroomChange={onHdrHeadroomChange}
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
