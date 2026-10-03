/**
 * Tour selectors — the read seam for the `tour` runtime slice, scoped through
 * `RootState`, mirroring the camera/selection slice conventions (one read
 * surface per slice).
 *
 * The slice stores only `beatIndex / paused / dwellNonce / dwellSec`;
 * everything else the overlay renders — the kicker label, the beat count, the
 * active caption — is DERIVED here by resolving the takeover's tour id against
 * `tourRegistry` and indexing its beats. This is the whole reason the runtime
 * state can stay so small: the registry is already the single source of truth
 * for tour content, so duplicating any of it into the slice would only invite
 * drift. (`dwellSec` is the one exception: the compiled duration of the beat's
 * RESOLVED dwellClip isn't derivable from the registry alone, so the saga
 * records it at dwell start.)
 *
 * Which tour runs, if any, is the `takeover` slice's one record of it.
 *
 * Every selector is `RootState`-scoped, so each drops unchanged into both the
 * React side (`useAppSelector(...)`) and the saga/engine side
 * (`selectTourActive(store.getState())`).
 */

import { createSelector } from '@reduxjs/toolkit';
import { tourRoute } from '../../store/constants';
import { tourRegistry } from '../../data/animation/tours/tourRegistry';
import { selectTakeoverSource } from '../takeover/selectors';
import type { RootState } from '../../store/types';
import type { TourRuntimeState } from '../../@types/animation/tour/TourRuntimeState';
import type { Tour } from '../../@types/animation/tour/Tour';
import type { BeatData } from '../../@types/animation/tour/BeatData';
import type { BeatCaption } from '../../@types/animation/tour/BeatCaption';

const selectTourRuntime = (state: RootState): TourRuntimeState => state[tourRoute];

export const selectTourActive = (state: RootState): boolean =>
  selectTakeoverSource(state)?.kind === 'tour';

export const selectTourPaused = (state: RootState): boolean => selectTourRuntime(state).paused;

export const selectTourBeatIndex = (state: RootState): number => selectTourRuntime(state).beatIndex;

export const selectTourDwellNonce = (state: RootState): number =>
  selectTourRuntime(state).dwellNonce;

// An id the registry no longer knows (a stale link) resolves to null.
export const selectActiveTour = (state: RootState): Tour | null => {
  const source = selectTakeoverSource(state);
  if (source?.kind !== 'tour') return null;
  return (tourRegistry as Record<string, Tour>)[source.id] ?? null;
};

export const selectTourLabel = (state: RootState): string | null =>
  selectActiveTour(state)?.label ?? null;

export const selectTourTotal = (state: RootState): number =>
  selectActiveTour(state)?.beats.length ?? 0;

const selectCurrentBeat = (state: RootState): BeatData | null => {
  const tour = selectActiveTour(state);
  if (!tour) return null;
  return tour.beats[selectTourBeatIndex(state)] ?? null;
};

export const selectTourCaption = (state: RootState): BeatCaption | null =>
  selectCurrentBeat(state)?.caption ?? null;

// The beat-title list for the progress rail (null = a silent beat's dot, which
// reveals nothing on hover). The one selector here that DERIVES an array, so
// it is the one that must be memoized: a plain arrow would hand
// `useAppSelector` a fresh reference on every dispatch and re-render the rail
// constantly. The memo keys on the registry-resolved tour object, whose
// reference is stable for the whole run, so the memoization is exact.
export const selectTourBeatTitles = createSelector(
  [selectActiveTour],
  (tour): readonly (string | null)[] =>
    tour ? tour.beats.map((beat) => beat.caption?.title ?? null) : [],
);

export const selectTourDwellSec = (state: RootState): number => selectTourRuntime(state).dwellSec;

// Prev is available on every beat except the first. Next is always available
// (advancing off the last beat ends the tour), so it needs no guard.
export const selectTourCanPrev = (state: RootState): boolean =>
  selectTourActive(state) && selectTourBeatIndex(state) > 0;
