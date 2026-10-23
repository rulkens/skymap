/**
 * surfaceTileOverOf — the body the atlases follow is chosen by position: the
 * nearest tiling body in reach (never the registry's first), and none past its
 * `TILE_RELEASE_RADII`.
 */

import { describe, expect, it } from 'vitest';

import { surfaceTileOverOf } from '../../../../../src/services/engine/frame/surfaceTilePlanner/surfaceTileOverOf';
import { SCENE_CELESTIAL_BODIES } from '../../../../../src/data/bodies/sceneCelestialBodies';
import { TILE_RELEASE_RADII } from '../../../../../src/data/bodies/surfaceTileParams';
import { findByIdOrThrow } from '../../../../../src/utils/object/findByIdOrThrow';
import { frameViewsAt } from '../../../../helpers/frame/frameViewsAt';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const radiusM = (id: string) =>
  findByIdOrThrow(SCENE_CELESTIAL_BODIES, id, 'surfaceTileOverOf.test').surface.datumRadiusM;
const [REAL_VIEW] = frameViewsAt({ eyeMpc: [0, 0, 0], forward: [1, 0, 0], distanceMpc: 1 });

/** A view whose eye sits `radii` body radii out along +x from each listed body. */
function viewAt(radii: Partial<Record<'earth' | 'mars', number>>): FrameView {
  return {
    ...REAL_VIEW!,
    bodyPose: (id) => {
      const r = Object.entries(radii).find(([name]) => name === id)?.[1];
      return r === undefined ? null : { eyeRelBodyM: [r * radiusM(id), 0, 0], basisM: IDENTITY };
    },
  };
}

describe('surfaceTileOverOf', () => {
  it('picks the nearer of two tiling bodies in reach, whatever the registry order', () => {
    // Mars at 10 radii (34,000 km) is nearer than Earth at 100 (637,000 km).
    expect(surfaceTileOverOf(viewAt({ earth: 100, mars: 10 }))?.bodyId).toBe('mars');
    expect(surfaceTileOverOf(viewAt({ earth: 2, mars: 10 }))?.bodyId).toBe('earth');
  });

  it('names no body past its release radius', () => {
    // Bug caught: atlases held to the globe texture's 0.85 AU hysteresis.
    const edge = TILE_RELEASE_RADII.earth;
    expect(surfaceTileOverOf(viewAt({ earth: edge * (1 - 1e-9) }))?.bodyId).toBe('earth');
    expect(surfaceTileOverOf(viewAt({ earth: edge * (1 + 1e-9) }))).toBeNull();
  });

  it('carries the eye in the body frame, metres', () => {
    expect(surfaceTileOverOf(viewAt({ earth: 3 }))?.camPosLocalM).toEqual([
      3 * radiusM('earth'),
      0,
      0,
    ]);
  });
});
