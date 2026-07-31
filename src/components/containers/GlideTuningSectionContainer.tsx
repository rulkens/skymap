// src/components/containers/GlideTuningSectionContainer.tsx
/**
 * GlideTuningSectionContainer — store boundary for the DebugPanel's focus-glide
 * calibration sliders. The sagas that build camera tweens read the same
 * `selectGlideTuning`, so a slider drag re-renders only this subtree while the
 * next focus move picks the value up on its own.
 */

import { memo, useCallback, type ReactNode } from 'react';
import GlideTuningSection from '../DebugPanel/GlideTuningSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectGlideTuning } from '../../state/settings/selectors';
import { setGlideTuning } from '../../state/settings/settingsSlice';
import type { GlideTuning } from '../../@types/camera/GlideTuning';

function GlideTuningSectionContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const glide = useAppSelector(selectGlideTuning);

  const onChange = useCallback(
    (patch: Partial<GlideTuning>) => dispatch(setGlideTuning(patch)),
    [dispatch],
  );

  return <GlideTuningSection glide={glide} onChange={onChange} />;
}

export default memo(GlideTuningSectionContainer);
