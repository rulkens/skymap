/**
 * sceneOccluderSpheres — the occluder set is the frame's OPAQUE bodies, not
 * its drawn ones. The regression this pins: a body in the 1–3 px glint band is
 * drawn (as an additive sprite) but occludes nothing, so it must stay out of
 * the set, while the same body a decade closer must be in it.
 */

import { describe, expect, it } from 'vitest';

import { sceneOccluderSpheres } from '../../../../src/services/engine/frame/sceneOccluderSpheres';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const KM_TO_MPC = SCALE_UNITS.KM_TO_MPC;
const STATES = deriveBodyStates(CONST_J2000);

const STATE = {
  gpu: { texturedBodyRenderer: null },
  data: { bodies: { earth: SCENE_EARTH, planets: SCENE_PLANETS, stars: SCENE_STARS } },
  settings: {
    starCatalogs: { enabled: true, items: { famousStar: { enabled: true } } },
    bodies: { items: { sun: { enabled: true }, 's-star': { enabled: true } } },
  },
} as unknown as EngineState;

/** Eye `offsetKm` along +x from `bodyId`, on a 1280×720 viewport at fovY 45°. */
function makeCtx(bodyId: string, offsetKm: number): ReadyFrameContext {
  const p = STATES.get(bodyId)!.positionMpc;
  const drawCamPos: Vec3 = [p[0] + offsetKm * KM_TO_MPC, p[1], p[2]];
  return {
    drawCamPos,
    canvasSize: { width: 1280, height: 720 },
    fovYRad: Math.PI / 4,
    simDays: CONST_J2000,
  } as unknown as ReadyFrameContext;
}

/** Packed sphere radii (km), which identify the bodies in the set. */
function occluderRadiiKm(ctx: ReadyFrameContext): number[] {
  const { count, spheresKm } = sceneOccluderSpheres(STATE, ctx);
  return Array.from({ length: count }, (_, i) => spheresKm[i * 4 + 3]!);
}

function has(radiiKm: readonly number[], bodyId: string): boolean {
  const radiusKm = findByIdOrThrow(SCENE_PLANETS, bodyId, 'test').radiusM * SCALE_UNITS.M_TO_KM;
  return radiiKm.some((r) => Math.abs(r - radiusKm) < 1);
}

describe('sceneOccluderSpheres', () => {
  // ~869 px/rad here, so Io's 3644 km diameter spans ~2 px at 1.6e6 km and
  // ~6 px at 5.3e5 km — either side of BODY_GLINT_MAX_PX.
  it('excludes a glint-band body and includes the same body once it resolves', () => {
    const glintBand = occluderRadiiKm(makeCtx('io', 1.6e6));
    expect(has(glintBand, 'io')).toBe(false);
    // Jupiter is a resolved mesh from both poses — the set is never empty, so
    // the exclusion above is about Io's size, not about the binder no-oping.
    expect(has(glintBand, 'jupiter')).toBe(true);

    const resolved = occluderRadiiKm(makeCtx('io', 5.3e5));
    expect(has(resolved, 'io')).toBe(true);
  });

  it('drops the Sun once it demotes to a point at Jupiter-range', () => {
    // The Sun subtends ~1.6 px from Jupiter: drawn as an additive point by
    // starPointsPass, so it is no longer an opaque sphere.
    const sunRadiusKm = findByIdOrThrow(SCENE_STARS, 'sun', 'test').radiusM * SCALE_UNITS.M_TO_KM;
    const radii = occluderRadiiKm(makeCtx('jupiter', 1e7));
    expect(radii.some((r) => Math.abs(r - sunRadiusKm) < 1)).toBe(false);
    expect(has(radii, 'jupiter')).toBe(true);
  });
});
