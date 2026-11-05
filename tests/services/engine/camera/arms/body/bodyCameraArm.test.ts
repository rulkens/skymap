/**
 * bodyCameraArm.host's `groundRadiusAtM` closure — the ground-collision row's
 * source (F3a, spec §8.3). What can fail here is silent: a swapped operand or
 * a hardcoded body id reads a plausible but wrong number, never an error.
 */

import { describe, it, expect } from 'vitest';

import { bodyCameraArm } from '../../../../../../src/services/engine/camera/arms/body/bodyCameraArm';
import { deriveBodyStates } from '../../../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_CELESTIAL_BODIES } from '../../../../../../src/data/bodies/sceneCelestialBodies';
import { ORIENTATION_FRAMES } from '../../../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../../../src/data/defaults';
import { CONST_J2000 } from '../../../../../../src/data/time/constJ2000';
import { findByIdOrThrow } from '../../../../../../src/utils/object/findByIdOrThrow';
import type { SceneBodyId } from '../../../../../../src/@types/scene/SceneBodyId';
import type { CameraArmBasisCtx } from '../../../../../../src/@types/camera/arms/CameraArmBasisCtx';
import type { TerrainHeightAtLookup } from '../../../../../../src/@types/camera/terrain/TerrainHeightAtLookup';
import { asSceneBodyId } from '../../../../../../src/utils/scene/asSceneBodyId';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const BODIES = deriveBodyStates(CONST_J2000);
const EARTH_R_M = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'earth', 'bodyCameraArm.test').surface
  .datumRadiusM;
const MARS_R_M = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'mars', 'bodyCameraArm.test').surface
  .datumRadiusM;
const MARS_ID = asSceneBodyId('mars');
const EARTH_ID = asSceneBodyId('earth');

function ctxWith(terrainHeightAt: TerrainHeightAtLookup): CameraArmBasisCtx {
  return { bodies: BODIES, poseBasis: B, upBasis: B, terrainHeightAt };
}

describe("bodyCameraArm.host's groundRadiusAtM", () => {
  it('queries the lookup with the host it was built for, not a fixed body id', () => {
    const seen: SceneBodyId[] = [];
    const terrainHeightAt: TerrainHeightAtLookup = (bodyId) => {
      seen.push(bodyId);
      return bodyId === MARS_ID ? 42 : 0;
    };
    const earthHost = bodyCameraArm.host({ body: EARTH_ID }, ctxWith(terrainHeightAt))!;
    const marsHost = bodyCameraArm.host({ body: MARS_ID }, ctxWith(terrainHeightAt))!;
    expect(earthHost.groundRadiusAtM([1, 0, 0])).toBe(EARTH_R_M);
    expect(marsHost.groundRadiusAtM([1, 0, 0])).toBeCloseTo(MARS_R_M + 42, 9);
    expect(seen).toEqual([EARTH_ID, MARS_ID]);
  });
});

describe("bodyCameraArm.host's relief shells", () => {
  // Asserted against the DECLARED relief, not against the two helpers that
  // compute them — a swapped pair type-checks clean and would make a ray pick
  // march between the wrong two spheres, silently.
  it('brackets the datum with the body’s own declared relief', () => {
    const earth = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'earth', 'bodyCameraArm.test').surface;
    const host = bodyCameraArm.host(
      { body: EARTH_ID },
      ctxWith(() => 0),
    )!;
    expect(earth.reliefM[0]).toBeLessThan(0);
    expect(host.innerBoundRadiusM).toBe(EARTH_R_M + earth.reliefM[0]);
    expect(host.outerBoundRadiusM).toBe(EARTH_R_M + earth.reliefM[1]);
    expect(host.innerBoundRadiusM).toBeLessThan(host.radiusM);
    expect(host.radiusM).toBeLessThan(host.outerBoundRadiusM);
  });
});
