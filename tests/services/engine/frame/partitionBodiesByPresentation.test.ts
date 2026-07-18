/**
 * partitionBodiesByPresentation — unit tests for the body presentation split.
 *
 * The partition is the ONE branch point deciding which layer draws each seeded
 * body this frame: an additive glint (`bodyGlintsLayer`), a flat-lit albedo
 * sphere (`planetsLayer`), or a textured sphere (`texturedBodiesLayer`). All
 * three layers consume opposite branches of one result, so a body lands in
 * EXACTLY one bucket by construction — the same disjoint-and-covering invariant
 * `partitionStarsByResolution` guarantees for the point↔sphere handoff.
 *
 * These pin the behaviours the layers lean on: a sub-3px body is a glint; a
 * resolved registry body is textured iff its texture is resident, else flat; a
 * body outside `BODY_TEXTURE_REGISTRY` (Titan, an irregular moon) is flat even
 * when the residency predicate would say yes. Fixtures are hand-placed so the
 * apparent-size regime of each body is unambiguous rather than a round number a
 * unit bug could accidentally satisfy.
 */

import { describe, it, expect } from 'vitest';

import { partitionBodiesByPresentation } from '../../../../src/services/engine/frame/partitionBodiesByPresentation';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const VIEWPORT_HEIGHT_PX = 720;
const FOV_Y_RAD = Math.PI / 3;
const CAM: Vec3 = [0, 0, 0];

/**
 * A body of the given radius sitting `distanceKm` down +x from the camera at the
 * origin. `distanceKm = 5·radiusKm` subtends ~0.4 rad (hundreds of px, firmly
 * resolved); `distanceKm = 1 AU` subtends ~0.01 px (deep sub-pixel glint).
 */
function bodyAt(id: string, radiusKm: number, distanceKm: number): PlanetBody {
  return {
    id,
    label: id,
    positionMpc: [distanceKm * SCALE_UNITS.KM_TO_MPC, 0, 0],
    radiusKm,
    albedo: [0.5, 0.5, 0.5],
    orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };
}

const CLOSE = (radiusKm: number) => radiusKm * 5; // resolved (~hundreds of px)
const AU_KM = SCALE_UNITS.AU_TO_MPC / SCALE_UNITS.KM_TO_MPC; // 1 AU in km → deep sub-pixel

function partition(bodies: readonly PlanetBody[], resident: (id: string) => boolean) {
  return partitionBodiesByPresentation({
    bodies,
    camPosMpc: CAM,
    viewportHeightPx: VIEWPORT_HEIGHT_PX,
    fovYRad: FOV_Y_RAD,
    isTextureResident: resident,
  });
}

describe('partitionBodiesByPresentation', () => {
  it('is disjoint and covering — every body lands in exactly one bucket', () => {
    const bodies = [
      bodyAt('mars', 3390, CLOSE(3390)), // resolved, registry
      bodyAt('titan', 2575, CLOSE(2575)), // resolved, not registry
      bodyAt('jupiter', 69911, AU_KM), // sub-pixel glint
      bodyAt('io', 1822, CLOSE(1822)), // resolved, registry
    ];
    const { glints, flat, textured } = partition(bodies, () => true);

    const all = [...glints, ...flat, ...textured];
    expect(all).toHaveLength(bodies.length);
    expect(new Set(all)).toEqual(new Set(bodies));
    // Pairwise disjoint: no body appears in two branches.
    expect(new Set(all).size).toBe(bodies.length);
  });

  it('routes a resolved registry body to textured iff its texture is resident', () => {
    const mars = bodyAt('mars', 3390, CLOSE(3390));

    const resident = partition([mars], (id) => id === 'mars');
    expect(resident.textured).toEqual([mars]);
    expect(resident.flat).toEqual([]);

    const notResident = partition([mars], () => false);
    expect(notResident.flat).toEqual([mars]);
    expect(notResident.textured).toEqual([]);
  });

  it('keeps a resolved non-registry body (Titan, an irregular moon) flat even when residency says yes', () => {
    const titan = bodyAt('titan', 2575, CLOSE(2575));
    const phobos = bodyAt('phobos', 11, CLOSE(11));
    // isTextureResident returns true for everything — membership in the registry,
    // not residency, is what keeps these flat.
    const { flat, textured, glints } = partition([titan, phobos], () => true);
    expect(new Set(flat)).toEqual(new Set([titan, phobos]));
    expect(textured).toEqual([]);
    expect(glints).toEqual([]);
  });

  it('routes a sub-3px body to glints regardless of registry membership', () => {
    const jupiter = bodyAt('jupiter', 69911, AU_KM);
    const { glints, flat, textured } = partition([jupiter], () => true);
    expect(glints).toEqual([jupiter]);
    expect(flat).toEqual([]);
    expect(textured).toEqual([]);
  });

  it('treats a body the camera sits inside (distance 0) as resolved, not a glint', () => {
    // apparentSizePx returns 0 at distance 0 (divide-by-zero guard); a bare size
    // test would misread that as sub-pixel and glint the body the camera is
    // inside. The partition resolves distance 0 unconditionally, mirroring
    // planetsLayer's planetResolvesPx.
    const mars = bodyAt('mars', 3390, 0);
    const { glints, textured } = partition([mars], () => true);
    expect(glints).toEqual([]);
    expect(textured).toEqual([mars]);
  });
});
