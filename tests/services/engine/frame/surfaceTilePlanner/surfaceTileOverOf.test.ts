/**
 * surfaceTileOverOf — the body the atlases follow is chosen by position: the
 * nearest tiling body in reach (never the registry's first), and none past
 * twice its engage distance for the frame's finest lens.
 */

import { describe, expect, it } from 'vitest';

import { surfaceTileOverOf } from '../../../../../src/services/engine/frame/surfaceTilePlanner/surfaceTileOverOf';
import { SCENE_CELESTIAL_BODIES } from '../../../../../src/data/bodies/sceneCelestialBodies';
import { engageDistanceM } from '../../../../../src/utils/surfaceTiles/engageDistanceM';
import { findByIdOrThrow } from '../../../../../src/utils/object/findByIdOrThrow';
import { frameViewsAt } from '../../../../helpers/frame/frameViewsAt';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const radiusM = (id: string) =>
  findByIdOrThrow(SCENE_CELESTIAL_BODIES, id, 'surfaceTileOverOf.test').surface.datumRadiusM;
const [REAL_VIEW] = frameViewsAt({ eyeMpc: [0, 0, 0], forward: [1, 0, 0], distanceMpc: 1 });

/** 60° on a 4096 px edge. */
const NORMAL_PX_PER_RAD = 4096 / (2 * Math.tan(Math.PI / 6));

/** A view whose eye sits `radii` body radii out along +x from each listed body. */
function viewAt(
  radii: Partial<Record<'earth' | 'mars', number>>,
  drawPxPerRad = NORMAL_PX_PER_RAD,
): FrameView {
  return {
    ...REAL_VIEW!,
    drawPxPerRad,
    bodyPose: (id) => {
      const r = Object.entries(radii).find(([name]) => name === id)?.[1];
      return r === undefined ? null : { eyeRelBodyM: [r * radiusM(id), 0, 0], basisM: IDENTITY };
    },
  };
}

describe('surfaceTileOverOf', () => {
  it('picks the nearer of two tiling bodies in reach, whatever the registry order', () => {
    // Mars at 10 radii (34,000 km) is nearer than Earth at 100 (637,000 km).
    const telephoto = NORMAL_PX_PER_RAD * 100;
    expect(surfaceTileOverOf([viewAt({ earth: 100, mars: 10 }, telephoto)])?.bodyId).toBe('mars');
    expect(surfaceTileOverOf([viewAt({ earth: 2, mars: 10 })])?.bodyId).toBe('earth');
  });

  it('names no body past twice its engage distance for the current lens', () => {
    // Bug caught: a fixed radius sized for the telephoto extreme holds the
    // atlases until the body is a pixel wide at a normal lens; one at the
    // engage distance itself engages and releases on alternate frames.
    const edge = (2 * engageDistanceM(radiusM('earth'), NORMAL_PX_PER_RAD)) / radiusM('earth');
    expect(surfaceTileOverOf([viewAt({ earth: edge * (1 - 1e-9) })])?.bodyId).toBe('earth');
    expect(surfaceTileOverOf([viewAt({ earth: edge * (1 + 1e-9) })])).toBeNull();
  });

  it('reaches as far as the finest lens of any view', () => {
    // Bug caught: a telephoto view engages tiles the wide view's radius releases.
    const far = 50;
    expect(surfaceTileOverOf([viewAt({ earth: far })])).toBeNull();
    const zoomed = viewAt({ earth: far }, NORMAL_PX_PER_RAD * 20);
    expect(surfaceTileOverOf([viewAt({ earth: far }), zoomed])?.bodyId).toBe('earth');
  });

  it('carries the eye in the body frame, metres', () => {
    expect(surfaceTileOverOf([viewAt({ earth: 3 })])?.camPosLocalM).toEqual([
      3 * radiusM('earth'),
      0,
      0,
    ]);
  });
});
