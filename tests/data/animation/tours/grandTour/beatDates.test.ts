/**
 * Every Earth beat owns its date: a skip, a Prev or a windowed take can enter
 * any of them without playing the beat before, so each enter clip must snap the
 * clock itself before anything else moves it. Later Earth beats join the list
 * as they land.
 */
import { describe, it, expect } from 'vitest';

import { grandTour } from '../../../../../src/data/animation/tours/grandTour';
import { parkOpening } from '../../../../../src/data/animation/tours/grandTour/parkOpening';
import { youAreHereEarth } from '../../../../../src/data/animation/tours/grandTour/youAreHereEarth';
import { earthAndMoon } from '../../../../../src/data/animation/tours/grandTour/earthAndMoon';
import { clockTo } from '../../../../../src/state/tour/clockTo';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';

const EARTH_BEAT_ENTER_CLIPS: readonly ClipData[] = [parkOpening, youAreHereEarth, earthAndMoon];

function firstClockTo(effects: readonly Effect[]): ReturnType<typeof clockTo>['payload'] | null {
  for (const e of effects) {
    const found =
      e.kind === 'seq' || e.kind === 'all'
        ? firstClockTo(e.children)
        : e.kind === 'fork'
          ? firstClockTo([e.child])
          : e.kind === 'scene' && clockTo.match(e.action)
            ? e.action.payload
            : null;
    if (found !== null) return found;
  }
  return null;
}

describe('grand tour beat dates', () => {
  it('every Earth beat snaps its own date on entry', () => {
    for (const clip of EARTH_BEAT_ENTER_CLIPS) {
      expect(grandTour.beats.some((b) => b.enterClip === clip)).toBe(true);
      expect(firstClockTo(clip.timeline)?.overSec).toBe(0);
    }
  });
});
