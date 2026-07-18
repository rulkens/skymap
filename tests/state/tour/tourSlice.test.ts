import { describe, it, expect } from 'vitest';

import tourReducer, {
  tourStarted,
  beatChanged,
  dwellStarted,
  setPaused,
  tourEnded,
} from '../../../src/state/tour/tourSlice';
import {
  selectTourActive,
  selectTourPaused,
  selectTourBeatIndex,
  selectTourDwellNonce,
  selectActiveTour,
  selectTourTotal,
  selectTourBeatTitles,
  selectTourCanPrev,
} from '../../../src/state/tour/selectors';
import { tourRegistry } from '../../../src/data/animation/tours/tourRegistry';
import type { TourRuntimeState } from '../../../src/@types/animation/tour/TourRuntimeState';
import type { RootState } from '../../../src/store/types';

const initial = (): TourRuntimeState => tourReducer(undefined, { type: '@@INIT' });
const asState = (tour: TourRuntimeState): RootState => ({ tour }) as unknown as RootState;

describe('tourSlice reducers', () => {
  it('starts inert', () => {
    expect(initial()).toEqual({
      active: false,
      tourId: '',
      beatIndex: 0,
      paused: false,
      dwellNonce: 0,
      dwellSec: 0,
    });
  });

  it('tourStarted activates, records the id, resets to beat 0', () => {
    const s = tourReducer(
      { active: false, tourId: '', beatIndex: 3, paused: true, dwellNonce: 7, dwellSec: 5 },
      tourStarted({ tourId: 'webShowcase' }),
    );
    expect(s).toEqual({
      active: true,
      tourId: 'webShowcase',
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
      active: true,
      tourId: 'webShowcase',
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
        active: true,
        tourId: 'webShowcase',
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

  it('setPaused writes the flag', () => {
    const base = initial();
    expect(tourReducer(base, setPaused(true)).paused).toBe(true);
    expect(tourReducer({ ...base, paused: true }, setPaused(false)).paused).toBe(false);
  });

  it('tourEnded returns to the inert initial state', () => {
    const s = tourReducer(
      {
        active: true,
        tourId: 'webShowcase',
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
  it('runtime selectors read the slice fields', () => {
    const st = asState({
      active: true,
      tourId: 'webShowcase',
      beatIndex: 2,
      paused: true,
      dwellNonce: 4,
      dwellSec: 8,
    });
    expect(selectTourActive(st)).toBe(true);
    expect(selectTourPaused(st)).toBe(true);
    expect(selectTourBeatIndex(st)).toBe(2);
    expect(selectTourDwellNonce(st)).toBe(4);
  });

  it('selectActiveTour resolves from the registry only when active', () => {
    expect(
      selectActiveTour(
        asState({
          active: false,
          tourId: 'webShowcase',
          beatIndex: 0,
          paused: false,
          dwellNonce: 0,
          dwellSec: 0,
        }),
      ),
    ).toBeNull();
    expect(
      selectActiveTour(
        asState({
          active: true,
          tourId: 'webShowcase',
          beatIndex: 0,
          paused: false,
          dwellNonce: 0,
          dwellSec: 0,
        }),
      ),
    ).toBe(tourRegistry.webShowcase);
  });

  it('selectActiveTour returns null for an unknown id', () => {
    expect(
      selectActiveTour(
        asState({
          active: true,
          tourId: 'nope',
          beatIndex: 0,
          paused: false,
          dwellNonce: 0,
          dwellSec: 0,
        }),
      ),
    ).toBeNull();
  });

  it('selectTourTotal derives the beat count from the registry', () => {
    const st = asState({
      active: true,
      tourId: 'webShowcase',
      beatIndex: 0,
      paused: false,
      dwellNonce: 0,
      dwellSec: 0,
    });
    expect(selectTourTotal(st)).toBe(tourRegistry.webShowcase.beats.length);
  });

  it('selectTourBeatTitles maps beat titles with null for silent beats', () => {
    const st = asState({
      active: true,
      tourId: 'webShowcase',
      beatIndex: 0,
      paused: false,
      dwellNonce: 0,
      dwellSec: 0,
    });
    const titles = selectTourBeatTitles(st);
    expect(titles).toHaveLength(tourRegistry.webShowcase.beats.length);
    titles.forEach((title, i) => {
      expect(title).toBe(tourRegistry.webShowcase.beats[i]?.caption?.title ?? null);
    });
  });

  it('selectTourBeatTitles is empty when inactive and referentially stable across the run', () => {
    expect(
      selectTourBeatTitles(
        asState({
          active: false,
          tourId: 'webShowcase',
          beatIndex: 0,
          paused: false,
          dwellNonce: 0,
          dwellSec: 0,
        }),
      ),
    ).toEqual([]);

    // Different runtime states, same registry tour → the memo must hold the
    // array's identity, or the rail re-renders on every dispatch.
    const at = (beatIndex: number, paused: boolean) =>
      selectTourBeatTitles(
        asState({
          active: true,
          tourId: 'webShowcase',
          beatIndex,
          paused,
          dwellNonce: 0,
          dwellSec: 0,
        }),
      );
    expect(at(0, false)).toBe(at(2, true));
  });

  it('selectTourCanPrev is false on the first beat and when inactive', () => {
    const at = (beatIndex: number, active = true) =>
      selectTourCanPrev(
        asState({
          active,
          tourId: 'webShowcase',
          beatIndex,
          paused: false,
          dwellNonce: 0,
          dwellSec: 0,
        }),
      );
    expect(at(0)).toBe(false);
    expect(at(1)).toBe(true);
    expect(at(2, false)).toBe(false);
  });
});
