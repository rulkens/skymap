/**
 * hostOf / hostOrThrow — the one host failure policy (spec §2.5). The nine
 * ad-hoc host derivations collapse here from three policies (throw, hold,
 * `!`-assert) onto one, and a silent fallback body at either end of that
 * collapse would teleport the camera.
 */

import { describe, it, expect } from 'vitest';

import { hostOf } from '../../../../../src/services/engine/camera/rungs/hostOf';
import { hostOrThrow } from '../../../../../src/services/engine/camera/rungs/hostOrThrow';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';
import type { PoseFrame } from '../../../../../src/@types/camera/PoseFrame';
import type { RungBasisCtx } from '../../../../../src/@types/camera/RungBasisCtx';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const EARTH_STATE: BodyState = {
  positionMpc: [0, 0, 0],
  orientation: IDENTITY,
  meanAnomalyRad: 0,
};
const EARTH: PoseFrame = { body: 'earth' };

function ctxWith(bodies: ReadonlyMap<BodyId, BodyState>): RungBasisCtx {
  return { bodies, poseBasis: IDENTITY, upBasis: IDENTITY };
}

describe('hostOf', () => {
  it('answers null for a body absent from the state map', () => {
    expect(hostOf(EARTH, ctxWith(new Map()))).toBeNull();
  });

  it('answers the ground radius, never a bounding hull', () => {
    const host = hostOf(EARTH, ctxWith(new Map<BodyId, BodyState>([['earth', EARTH_STATE]])));
    // Earth's authored ground radius, hand-written (spec §2.6.6).
    expect(host?.radiusM).toBe(6371000);
  });
});

describe('hostOrThrow', () => {
  it('throws naming the unresolved body', () => {
    expect(() => hostOrThrow(EARTH, ctxWith(new Map()))).toThrow(/earth/);
  });
});
