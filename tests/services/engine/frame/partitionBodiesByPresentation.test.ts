/**
 * partitionBodiesByPresentation — the one apparent-size sort over every scene body.
 * Each body is judged against its OWN `resolvePx`, so a planet (3 px) and a star
 * (4 px) at the same apparent size can land in different branches; the four-way
 * routing of core's own bodies is `sceneBodyPartition`'s (its presence test).
 */

import { describe, it, expect } from 'vitest';

import { partitionBodiesByPresentation } from '../../../../src/services/engine/frame/partitionBodiesByPresentation';
import { bodyApparentDiameterPx } from '../../../../src/utils/scene/bodyApparentDiameterPx';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { PositionedSceneBody } from '../../../../src/@types/engine/frame/PositionedSceneBody';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { StarBody } from '../../../../src/@types/scene/StarBody';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const PX_PER_RAD = 720 / (2 * Math.tan(Math.PI / 6));
const CAM: Vec3 = [0, 0, 0];
const DISTANCE_MPC = 1e6 * 1e3 * SCALE_UNITS.M_TO_MPC; // 10⁶ km down +x

/** The radius that subtends `px` at `DISTANCE_MPC` (apparent size is linear in it here). */
function radiusForPx(px: number): number {
  const at1m = bodyApparentDiameterPx({
    positionMpc: [DISTANCE_MPC, 0, 0],
    radiusM: 1,
    camPosMpc: CAM,
    pxPerRad: PX_PER_RAD,
  });
  return px / at1m;
}

function planet(id: string, px: number): PositionedSceneBody {
  const body: PlanetBody = {
    id,
    label: id,
    surface: { datumRadiusM: radiusForPx(px), reliefM: [0, 0] },
    albedo: [0.5, 0.5, 0.5],
    resolvePx: 3,
  };
  return { body, positionMpc: [DISTANCE_MPC, 0, 0] };
}

function star(id: string, px: number): PositionedSceneBody {
  const body: StarBody = {
    id,
    label: id,
    absMag: 4.8,
    color: [1, 1, 1],
    surface: { datumRadiusM: radiusForPx(px), reliefM: [0, 0] },
    resolvePx: 4,
  };
  return { body, positionMpc: [DISTANCE_MPC, 0, 0] };
}

const sort = (bodies: readonly PositionedSceneBody[]) =>
  partitionBodiesByPresentation({ bodies, camPosMpc: CAM, pxPerRad: PX_PER_RAD });

describe('partitionBodiesByPresentation', () => {
  it('each body resolves at its own size', () => {
    const at35 = [planet('planet', 3.5), star('star', 3.5)];
    const mid = sort(at35);
    expect(mid.resolved).toEqual([at35[0]]);
    expect(mid.unresolved).toEqual([at35[1]]);

    const at45 = [planet('planet', 4.5), star('star', 4.5)];
    expect(sort(at45).resolved).toEqual(at45);
    expect(sort(at45).unresolved).toEqual([]);
  });

  it('is disjoint and covering — every body lands in exactly one branch', () => {
    const bodies = [
      planet('resolved-planet', 50),
      planet('glint', 0.5),
      star('sphere', 50),
      star('point', 1),
      star('handoff', 3.5),
    ];
    const { resolved, unresolved } = sort(bodies);
    const all = [...resolved, ...unresolved];
    expect(all).toHaveLength(bodies.length);
    expect(new Set(all)).toEqual(new Set(bodies));
  });

  it('treats a body the camera sits inside (distance 0) as resolved', () => {
    const inside: PositionedSceneBody = { body: star('sun', 0.01).body, positionMpc: CAM };
    expect(sort([inside]).resolved).toEqual([inside]);
  });
});
