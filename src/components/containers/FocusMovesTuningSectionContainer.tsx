/** FocusMovesTuningSectionContainer — store boundary for the DebugPanel focus-moves board. */

import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import FocusMovesTuningSection from '../DebugPanel/FocusMovesTuningSection/FocusMovesTuningSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectFocusMoves } from '../../state/settings/selectors';
import { setEasedDuration, setGeodesicTuning } from '../../state/settings/core/focusMovesSlice';
import type { GeodesicTuning } from '../../@types/camera/GeodesicTuning';

function FocusMovesTuningSectionContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const moves = useAppSelector(selectFocusMoves);

  const onEasedDurationChange = useCallback(
    (ms: number) => dispatch(setEasedDuration(ms)),
    [dispatch],
  );
  const onGeodesicChange = useCallback(
    (tuning: Partial<GeodesicTuning>) => dispatch(setGeodesicTuning(tuning)),
    [dispatch],
  );

  return (
    <FocusMovesTuningSection
      moves={moves}
      onEasedDurationChange={onEasedDurationChange}
      onGeodesicChange={onGeodesicChange}
    />
  );
}

export default memo(FocusMovesTuningSectionContainer);
