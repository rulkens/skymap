/**
 * positionedVisibleStars — pins that the pairing takes its position from the
 * frame's body snapshot rather than from anything on the star record.
 *
 * The famous roster cannot show the difference: every one of those stars is a
 * static anchor, so its snapshot position is the same number at every instant
 * and a baked field would read identically. The S-stars can: each is Keplerian
 * about Sgr A*, so its snapshot position is both far from the origin and
 * different at every `simDays` — a value no baked field, cached array, or origin
 * fallback could produce.
 */

import { describe, it, expect } from 'vitest';

import { positionedVisibleStars } from '../../../../src/services/engine/frame/positionedVisibleStars';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_S_STARS } from '../../../../src/data/bodies/sceneSStars';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';

const MOVING_STAR = SCENE_S_STARS[0]!;

const STATE = {
  settings: {
    starCatalogs: {
      enabled: true,
      items: {
        famousStar: { enabled: false },
        sun: { enabled: false },
        sStar: { enabled: true },
      },
    },
  },
} as unknown as EngineState;

const ctxAt = (simDays: number) => ({ snapshot: { simDays } }) as unknown as FrameView;

describe('positionedVisibleStars', () => {
  it('pairs each visible star with the snapshot’s position, not a baked one', () => {
    const atEpoch = positionedVisibleStars(STATE, ctxAt(CONST_J2000));
    expect(atEpoch).toHaveLength(SCENE_S_STARS.length);
    // The record's own fields ride through untouched; the position is the
    // snapshot's, by identity — no copy, no re-derivation.
    expect(atEpoch[0]!.label).toBe(MOVING_STAR.label);
    expect(atEpoch[0]!.positionMpc).toBe(
      deriveBodyStates(CONST_J2000).get(MOVING_STAR.id)!.positionMpc,
    );

    // A different instant moves it: the pairing is per frame, so nothing about
    // the star record can be the source of the position.
    const later = CONST_J2000 + 120;
    const atLater = positionedVisibleStars(STATE, ctxAt(later));
    expect(atLater[0]!.positionMpc).toBe(deriveBodyStates(later).get(MOVING_STAR.id)!.positionMpc);
    expect(atLater[0]!.positionMpc).not.toEqual(atEpoch[0]!.positionMpc);
  });
});
