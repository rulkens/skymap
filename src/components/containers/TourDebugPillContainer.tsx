/**
 * TourDebugPillContainer — TEMPORARY top-bar pill that starts the grand tour.
 *
 * Mounted by App only behind the `?tour` URL gate, so it never shows for
 * normal visitors — it exists to relaunch the tour instantly while beats are
 * being tuned, without round-tripping through the splash. Deliberately skips
 * the presentational-component split the other containers follow: this is
 * throwaway debug chrome and PillButton already carries all the visuals.
 * Delete once the tour ships and the splash button is the real entry point.
 */

import { memo, useCallback } from 'react';
import PillButton from '../common/PillButton/PillButton';
import PlayCircleIcon from '../icons/PlayCircleIcon/PlayCircleIcon';
import { useAppDispatch } from '../../store/hooks';
import { startTour } from '../../state/tour/tourActions';

function TourDebugPillContainer({ hidden }: { hidden: boolean }): React.ReactElement {
  const dispatch = useAppDispatch();
  const onClick = useCallback(() => dispatch(startTour('grandTour')), [dispatch]);
  return (
    <PillButton
      onClick={onClick}
      hidden={hidden}
      aria-label="Start the grand tour (debug)"
      tooltip="Grand tour"
    >
      {/* Ringed, so it reads apart from AutoRotateToggle's bare triangle. */}
      <PlayCircleIcon size={14} />
    </PillButton>
  );
}

export default memo(TourDebugPillContainer);
