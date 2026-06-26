// src/components/containers/TourOverlayContainer.tsx
/**
 * TourOverlayContainer — store boundary for the guided-tour overlay.
 *
 * Resolves the active beat's caption + readout + dwell state from the `tour`
 * slice (all of it derived from the runtime `tourId` + `beatIndex` via the tour
 * selectors) and turns the four nav controls into Intent dispatches. The
 * presentational `TourOverlay` imports nothing from `store/` or `state/`.
 *
 * The four controls converge on the SAME tour signals the keyboard will dispatch
 * (`prevBeat` / `advanceTour` / `togglePause` / `exitTour`) — `pausableDwellSaga`
 * and `guidedTourSaga` are the single home that acts on them, so the button and
 * keyboard surfaces share one behaviour with no duplicated logic.
 *
 * App mounts this only while `selectTourActive` is true, so the container does
 * not gate on `active` itself — when mounted, a tour is running.
 */

import { memo, useCallback } from 'react';
import TourOverlay from '../TourOverlay/TourOverlay';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectTourCaption,
  selectTourLabel,
  selectTourBeatIndex,
  selectTourTotal,
  selectTourPaused,
  selectTourDwellSec,
  selectTourDwellNonce,
  selectTourCanPrev,
} from '../../state/tour/selectors';
import { prevBeat, advanceTour, togglePause, exitTour } from '../../state/tour/tourActions';

function TourOverlayContainer(): React.ReactElement {
  const caption = useAppSelector(selectTourCaption);
  const label = useAppSelector(selectTourLabel);
  const index = useAppSelector(selectTourBeatIndex);
  const total = useAppSelector(selectTourTotal);
  const paused = useAppSelector(selectTourPaused);
  const dwellSec = useAppSelector(selectTourDwellSec);
  const dwellNonce = useAppSelector(selectTourDwellNonce);
  const canPrev = useAppSelector(selectTourCanPrev);

  const dispatch = useAppDispatch();
  // Stable handlers — dispatch identity is invariant, so the arrows never change.
  const onPrev = useCallback(() => dispatch(prevBeat()), [dispatch]);
  const onNext = useCallback(() => dispatch(advanceTour()), [dispatch]);
  const onTogglePause = useCallback(() => dispatch(togglePause()), [dispatch]);
  const onExit = useCallback(() => dispatch(exitTour()), [dispatch]);

  return (
    <TourOverlay
      caption={caption}
      label={label}
      index={index}
      total={total}
      paused={paused}
      dwellSec={dwellSec}
      dwellNonce={dwellNonce}
      canPrev={canPrev}
      onPrev={onPrev}
      onNext={onNext}
      onTogglePause={onTogglePause}
      onExit={onExit}
    />
  );
}

export default memo(TourOverlayContainer);
