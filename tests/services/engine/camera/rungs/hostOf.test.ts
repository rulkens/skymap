/**
 * hostOf / hostOrThrow — the ladder's one host failure policy (spec §2.5):
 * null or throw, never a fallback body, because a fallback teleports the camera.
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
const EARTH: PoseFrame = { body: 'earth' };

function ctxWith(bodies: ReadonlyMap<BodyId, BodyState>): RungBasisCtx {
  return { bodies, poseBasis: IDENTITY, upBasis: IDENTITY };
}

describe('hostOf', () => {
  it('answers null for a body absent from the state map', () => {
    expect(hostOf(EARTH, ctxWith(new Map()))).toBeNull();
  });
});

describe('hostOrThrow', () => {
  it('throws naming the unresolved body', () => {
    expect(() => hostOrThrow(EARTH, ctxWith(new Map()))).toThrow(/earth/);
  });
});
