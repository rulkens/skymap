/**
 * bodyRung.host's `groundRadiusAtM` closure — the ground-collision row's
 * source (F3a, spec §8.3). What can fail here is silent: a swapped operand or
 * a hardcoded body id reads a plausible but wrong number, never an error.
 */

import { describe, it, expect } from 'vitest';

import { bodyRung } from '../../../../../src/services/engine/camera/rungs/bodyRung';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_CELESTIAL_BODIES } from '../../../../../src/data/bodies/sceneCelestialBodies';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../../src/data/defaults';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { findByIdOrThrow } from '../../../../../src/utils/object/findByIdOrThrow';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { RungBasisCtx } from '../../../../../src/@types/camera/RungBasisCtx';
import type { TerrainHeightAtLookup } from '../../../../../src/@types/camera/TerrainHeightAtLookup';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const BODIES = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
const EARTH_R_M = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'earth', 'bodyRung.test').surface
  .datumRadiusM;
const MARS_R_M = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'mars', 'bodyRung.test').surface
  .datumRadiusM;
// `BodyId`'s declared union (settings-toggle groups) doesn't literally include
// 'mars' — the same cast every other rung test uses (e.g. siteRung.test.ts).
const MARS_ID = 'mars' as BodyId;
const EARTH_ID = 'earth' as BodyId;

function ctxWith(terrainHeightAt: TerrainHeightAtLookup): RungBasisCtx {
  return { bodies: BODIES, poseBasis: B, upBasis: B, terrainHeightAt };
}

describe("bodyRung.host's groundRadiusAtM", () => {
  it('queries the lookup with the host it was built for, not a fixed body id', () => {
    const seen: BodyId[] = [];
    const terrainHeightAt: TerrainHeightAtLookup = (bodyId) => {
      seen.push(bodyId);
      return bodyId === MARS_ID ? 42 : 0;
    };
    const earthHost = bodyRung.host({ body: EARTH_ID }, ctxWith(terrainHeightAt))!;
    const marsHost = bodyRung.host({ body: MARS_ID }, ctxWith(terrainHeightAt))!;
    expect(earthHost.groundRadiusAtM([1, 0, 0])).toBe(EARTH_R_M);
    expect(marsHost.groundRadiusAtM([1, 0, 0])).toBeCloseTo(MARS_R_M + 42, 9);
    expect(seen).toEqual([EARTH_ID, MARS_ID]);
  });
});
