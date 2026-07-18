// src/components/containers/TourDebugPillContainer.tsx
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
      {/* Play triangle in a ring — distinct from AutoRotateToggle's bare
          triangle so the two pills read differently at a glance. */}
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.5 5 L11 8 L6.5 11 Z" fill="currentColor" />
      </svg>
    </PillButton>
  );
}

export default memo(TourDebugPillContainer);
