/**
 * positionedVisibleStars — pins that the pairing takes its position from the
 * frame's body snapshot rather than from anything on the star record.
 *
 * The real roster cannot show the difference: every famous star is a static
 * anchor, so its snapshot position is the same number at every instant and a
 * baked field would read identically. The fixture therefore gives the star
 * record an ORBITAL body's id, whose snapshot position is both far from the
 * origin and different at every `simDays` — a value no baked field, cached
 * array, or origin fallback could produce.
 */

import { describe, it, expect } from 'vitest';

import { positionedVisibleStars } from '../../../../src/services/engine/frame/positionedVisibleStars';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { makeBodyItems } from '../../../fixtures/makeBodyItems';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

const MOVING_STAR = {
  id: 'earth',
  label: 'Moving fixture',
  absMag: 4.83,
  color: [1, 1, 1],
  radiusM: 696340000,
};

const STATE = {
  data: { bodies: { stars: [MOVING_STAR] } },
  settings: {
    starCatalogs: { enabled: true, items: { famousStar: { enabled: true } } },
    // Derived from BODY_IDS: `visibleStars` reads the Sun's and the S-stars'
    // rows unguarded, so a row a hand list omits throws rather than asserts.
    bodies: { items: makeBodyItems() },
  },
} as unknown as EngineState;

const ctxAt = (simDays: number) => ({ simDays }) as unknown as ReadyFrameContext;

describe('positionedVisibleStars', () => {
  it('pairs each visible star with the snapshot’s position, not a baked one', () => {
    const atEpoch = positionedVisibleStars(STATE, ctxAt(CONST_J2000));
    expect(atEpoch).toHaveLength(1);
    // The record's own fields ride through untouched; the position is the
    // snapshot's, by identity — no copy, no re-derivation.
    expect(atEpoch[0]!.label).toBe(MOVING_STAR.label);
    expect(atEpoch[0]!.positionMpc).toBe(deriveBodyStates(CONST_J2000).get('earth')!.positionMpc);

    // A different instant moves it: the pairing is per frame, so nothing about
    // the star record can be the source of the position.
    const later = CONST_J2000 + 120;
    const atLater = positionedVisibleStars(STATE, ctxAt(later));
    expect(atLater[0]!.positionMpc).toBe(deriveBodyStates(later).get('earth')!.positionMpc);
    expect(atLater[0]!.positionMpc).not.toEqual(atEpoch[0]!.positionMpc);
  });
});
