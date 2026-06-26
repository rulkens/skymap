/**
 * Tour selectors — the read seam for the `tour` runtime slice, scoped through
 * `RootState`, mirroring the camera/selection slice conventions (one read
 * surface per slice).
 *
 * The slice stores only `active / tourId / beatIndex / paused / dwellNonce`;
 * everything the overlay actually renders — the kicker label, the beat count,
 * the active caption, the dwell duration — is DERIVED here by resolving the
 * active tour from `tourRegistry` and indexing its beats. This is the whole
 * reason the runtime state can stay so small: the registry is already the
 * single source of truth for tour content, so duplicating any of it into the
 * slice would only invite drift.
 *
 * Every selector is `RootState`-scoped, so each drops unchanged into both the
 * React side (`useAppSelector(...)`) and the saga/engine side
 * (`selectTourActive(store.getState())`).
 */

import { tourRoute } from '../../store/constants';
import { tourRegistry } from '../../data/animation/tours/tourRegistry';
import type { RootState } from '../../store/types';
import type { TourRuntimeState } from '../../@types/animation/tour/TourRuntimeState';
import type { Tour } from '../../@types/animation/tour/Tour';
import type { BeatData } from '../../@types/animation/tour/BeatData';
import type { BeatCaption } from '../../@types/animation/tour/BeatCaption';

export const selectTourRuntime = (state: RootState): TourRuntimeState => state[tourRoute];

export const selectTourActive = (state: RootState): boolean => selectTourRuntime(state).active;

export const selectTourPaused = (state: RootState): boolean => selectTourRuntime(state).paused;

export const selectTourBeatIndex = (state: RootState): number => selectTourRuntime(state).beatIndex;

export const selectTourDwellNonce = (state: RootState): number =>
  selectTourRuntime(state).dwellNonce;

// Resolve the active tour from the registry. Indexed by a plain string (the
// slice stores `tourId` as a string); a stale or empty id resolves to null.
export const selectActiveTour = (state: RootState): Tour | null => {
  const runtime = selectTourRuntime(state);
  if (!runtime.active) return null;
  return (tourRegistry as Record<string, Tour>)[runtime.tourId] ?? null;
};

export const selectTourLabel = (state: RootState): string | null =>
  selectActiveTour(state)?.label ?? null;

export const selectTourTotal = (state: RootState): number =>
  selectActiveTour(state)?.beats.length ?? 0;

export const selectCurrentBeat = (state: RootState): BeatData | null => {
  const tour = selectActiveTour(state);
  if (!tour) return null;
  return tour.beats[selectTourBeatIndex(state)] ?? null;
};

export const selectTourCaption = (state: RootState): BeatCaption | null =>
  selectCurrentBeat(state)?.caption ?? null;

export const selectTourDwellSec = (state: RootState): number =>
  selectCurrentBeat(state)?.dwellSec ?? 0;

// Prev is available on every beat except the first. Next is always available
// (advancing off the last beat ends the tour), so it needs no guard.
export const selectTourCanPrev = (state: RootState): boolean =>
  selectTourActive(state) && selectTourBeatIndex(state) > 0;
