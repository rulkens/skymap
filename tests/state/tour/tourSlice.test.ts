import { describe, it, expect } from 'vitest';

import tourReducer, {
  tourStarted,
  beatChanged,
  dwellStarted,
  setPaused,
  tourEnded,
} from '../../../src/state/tour/tourSlice';
import {
  selectActiveTour,
  selectTourTotal,
  selectTourBeatTitles,
  selectTourCanPrev,
} from '../../../src/state/tour/selectors';
import { tourRegistry } from '../../../src/data/animation/tours/tourRegistry';
import type { TourRuntimeState } from '../../../src/@types/animation/tour/TourRuntimeState';
import type { RootState } from '../../../src/store/types';

const initial = (): TourRuntimeState => tourReducer(undefined, { type: '@@INIT' });

// The selectors read both routes: `tour` for the beat bookkeeping, `takeover`
// for which tour runs. The loose cast lets a fixture name an unknown id.
const asState = (tour: TourRuntimeState, active: boolean, id = 'webShowcase'): RootState =>
  ({
    tour,
    takeover: { active: active ? { kind: 'tour', id } : null },
  }) as unknown as RootState;

describe('tourSlice reducers', () => {
  it('tourStarted resets to beat 0', () => {
    const s = tourReducer(
      { beatIndex: 3, paused: true, dwellNonce: 7, dwellSec: 5 },
      tourStarted(),
    );
    expect(s).toEqual({
      beatIndex: 0,
      paused: false,
      dwellNonce: 0,
      dwellSec: 0,
    });
  });

  it('beatChanged sets the index and clears paused, but does NOT bump the dwell nonce', () => {
    // The nonce must wait for the fly to land (dwellStarted), not move on the
    // fly start — otherwise the countdown ring would deplete during the fly.
    const before = {
      beatIndex: 0,
      paused: true,
      dwellNonce: 2,
      dwellSec: 8,
    };
    const s = tourReducer(before, beatChanged(1));
    expect(s.beatIndex).toBe(1);
    expect(s.paused).toBe(false);
    expect(s.dwellNonce).toBe(2);
  });

  it('dwellStarted bumps the nonce and records the dwell length', () => {
    const s = tourReducer(
      {
        beatIndex: 1,
        paused: false,
        dwellNonce: 2,
        dwellSec: 0,
      },
      dwellStarted({ dwellSec: 8 }),
    );
    expect(s.dwellNonce).toBe(3);
    expect(s.dwellSec).toBe(8);
    expect(s.beatIndex).toBe(1);
  });

  it('tourEnded returns to the inert initial state', () => {
    const s = tourReducer(
      {
        beatIndex: 2,
        paused: true,
        dwellNonce: 5,
        dwellSec: 9,
      },
      tourEnded(),
    );
    expect(s).toEqual(initial());
  });
});

describe('tour selectors', () => {
  it('selectActiveTour resolves from the registry only when active', () => {
    const runtime: TourRuntimeState = {
      beatIndex: 0,
      paused: false,
      dwellNonce: 0,
      dwellSec: 0,
    };
    expect(selectActiveTour(asState(runtime, false))).toBeNull();
    expect(selectActiveTour(asState(runtime, true))).toBe(tourRegistry.webShowcase);
  });

  it('selectActiveTour returns null for an unknown id', () => {
    const runtime: TourRuntimeState = {
      beatIndex: 0,
      paused: false,
      dwellNonce: 0,
      dwellSec: 0,
    };
    expect(selectActiveTour(asState(runtime, true, 'nope'))).toBeNull();
  });

  it('selectTourBeatTitles maps beat titles with null for silent beats', () => {
    const runtime: TourRuntimeState = {
      beatIndex: 0,
      paused: false,
      dwellNonce: 0,
      dwellSec: 0,
    };
    const titles = selectTourBeatTitles(asState(runtime, true));
    expect(titles).toHaveLength(tourRegistry.webShowcase.beats.length);
    titles.forEach((title, i) => {
      expect(title).toBe(tourRegistry.webShowcase.beats[i]?.caption?.title ?? null);
    });
  });

  it('selectTourBeatTitles is empty when inactive and referentially stable across the run', () => {
    const inactiveRuntime: TourRuntimeState = {
      beatIndex: 0,
      paused: false,
      dwellNonce: 0,
      dwellSec: 0,
    };
    expect(selectTourBeatTitles(asState(inactiveRuntime, false))).toEqual([]);

    // Different runtime states, same registry tour → the memo must hold the
    // array's identity, or the rail re-renders on every dispatch.
    const at = (beatIndex: number, paused: boolean) =>
      selectTourBeatTitles(asState({ beatIndex, paused, dwellNonce: 0, dwellSec: 0 }, true));
    expect(at(0, false)).toBe(at(2, true));
  });

  it('selectTourCanPrev is false on the first beat and when inactive', () => {
    const at = (beatIndex: number, active = true) =>
      selectTourCanPrev(asState({ beatIndex, paused: false, dwellNonce: 0, dwellSec: 0 }, active));
    expect(at(0)).toBe(false);
    expect(at(1)).toBe(true);
    expect(at(2, false)).toBe(false);
  });
});
