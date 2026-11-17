/**
 * drawsAtmosphere — the one predicate every per-view atmosphere draw gates on and the
 * sky-view roster unions: an `ATMOSPHERE_PARAMS` row (data gate), a `body-m` slab in
 * this view, and a SURFACE disc at/above `SUB_PIXEL_BODY_CULL_PX`. One test per gate so
 * a regression lands as a distinct failure.
 */

import { describe, it, expect, vi } from 'vitest';

import { drawsAtmosphere } from '../../../../../src/layers/body/atmosphere/present/drawsAtmosphere';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { BODY_SLAB_ROWS } from '../../../../../src/layers/body/slabs/present/bodySlabRows';
import { outerBoundRadiusM } from '../../../../../src/utils/occlusion/outerBoundRadiusM';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SlabRow } from '../../../../../src/@types/engine/frame/SlabRow';
import { seededBodyStates } from '../../../../helpers/frame/seededBodyStates';
import { bodySlabsOf } from '../../../../helpers/frame/bodySlabsOf';
import type { SeededBody } from '../../../../helpers/frame/SeededBody';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';

vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn(() => seededBodyStates(0, [SEEDED_EARTH])),
}));

const EARTH_STATE = deriveBodyStates(CONST_J2000).get(asSceneBodyId('earth'))!;
const SEEDED_EARTH: SeededBody = {
  ...SCENE_EARTH,
  positionMpc: EARTH_STATE.positionMpc,
  orientation: EARTH_STATE.orientation,
};

// 1080-px viewport, fovYRad 1.0, tangent-exact — matches `symmetricFrustum`'s
// form so the fixture's `drawPxPerRad` is what `deriveView` would have set.
const FIXTURE_PX_PER_RAD = 1080 / (2 * Math.tan(1.0 / 2));

/** The eye `radii` Earth-radii out along +x, with a slab for each of `rows`. */
function ctxAt(radii: number, rows: readonly SlabRow[] = BODY_SLAB_ROWS): FrameView {
  const offsetMpc = radii * outerBoundRadiusM(SEEDED_EARTH.surface) * SCALE_UNITS.M_TO_MPC;
  const [x, y, z] = SEEDED_EARTH.positionMpc;
  const drawCamPos: Vec3 = [x + offsetMpc, y, z];
  return {
    drawCamPos,
    slabs: bodySlabsOf(rows),
    drawPxPerRad: FIXTURE_PX_PER_RAD,
  } as unknown as FrameView;
}

const STATE = {} as unknown as EngineState;
const EARTH = SCENE_EARTH.id;

describe('drawsAtmosphere', () => {
  it('holds for a body with params, a slab and a supra-pixel disc', () => {
    expect(drawsAtmosphere(EARTH, ctxAt(5), STATE)).toBe(true);
  });

  it('fails for a body this view gives no slab', () => {
    // Close enough to draw, but yielded or outside this view's frustum.
    const withoutEarth = BODY_SLAB_ROWS.filter((row) => row.anchorId !== EARTH);
    expect(drawsAtmosphere(EARTH, ctxAt(5, withoutEarth), STATE)).toBe(false);
  });

  it('fails for a body whose surface disc is sub-pixel', () => {
    // ~3000 radii out drops the disc under one pixel at this fov/height.
    expect(drawsAtmosphere(EARTH, ctxAt(3000), STATE)).toBe(false);
  });

  it('holds when the camera is deep inside the atmosphere shell', () => {
    expect(drawsAtmosphere(EARTH, ctxAt(0.5), STATE)).toBe(true);
  });

  it('fails for a body with no ATMOSPHERE_PARAMS row', () => {
    expect(drawsAtmosphere(asSceneBodyId('moon'), ctxAt(5), STATE)).toBe(false);
  });
});
