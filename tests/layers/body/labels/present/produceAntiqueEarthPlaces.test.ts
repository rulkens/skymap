import { describe, it, expect } from 'vitest';
import { produceAntiqueEarthPlaces } from '../../../../../src/layers/body/labels/present/produceAntiqueEarthPlaces';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { EARTH_ENTRY } from '../../../../../src/layers/body/sources/earth';
import { surfacePointBodyFixed } from '../../../../../src/utils/geo/surfacePointBodyFixed';
import { rotateVec3ByTightMat3 } from '../../../../../src/utils/math/rotateVec3ByTightMat3';
import { bodyPickCodes } from '../../../../support/layerPickCodes';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// J2000 is noon at Greenwich in January: Africa lit, the mid-Pacific in its small hours.
const STATES = deriveBodyStates(CONST_J2000);
const EARTH = STATES.get(SCENE_EARTH.id)!;
const PX_PER_RAD = 1000;
const produce = produceAntiqueEarthPlaces(bodyPickCodes());
const FADE = { [EARTH_ENTRY.id]: 1, planet: 1, 'small-body': 1 };

const state = (enabled: boolean) =>
  ({ settings: { antique: { enabled } }, viewRig: 'mono' }) as unknown as EngineState;

/** The eye above a ground point, `radii` Earth radii from the centre. */
function ctxAbove(latDeg: number, lonDeg: number, radii: number): FrameView {
  const up = rotateVec3ByTightMat3(EARTH.orientation, surfacePointBodyFixed(latDeg, lonDeg, 1));
  const d = radii * SCENE_EARTH.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC;
  const e = EARTH.positionMpc;
  const cam: Vec3 = [e[0] + up[0] * d, e[1] + up[1] * d, e[2] + up[2] * d];
  return {
    snapshot: { devicePixelRatio: 1, bodyStates: STATES },
    drawCamPos: cam,
    drawPxPerRad: PX_PER_RAD,
    canvasSize: { width: 1600, height: 900 },
  } as unknown as FrameView;
}

const alphaOf = (labels: readonly { id: string; fadeAlpha?: number }[], id: string) =>
  labels.find((l) => l.id === `earthPlace-${id}`)!.fadeAlpha;

// 3.4 radii at 1000 px/rad is a globe about 600 px across.
describe('produceAntiqueEarthPlaces', () => {
  it('names nothing with the look off', () => {
    expect(produce(state(false), ctxAbove(8, 20, 3.4), FADE).labels).toEqual([]);
  });

  it('names the sunlit face toward the eye, not the far side', () => {
    const { labels } = produce(state(true), ctxAbove(8, 20, 3.4), FADE);
    expect(alphaOf(labels, 'africa')).toBeCloseTo(1);
    expect(alphaOf(labels, 'marePacificum')).toBe(0);
  });

  it('drops a name in the night, though it faces the eye', () => {
    const { labels } = produce(state(true), ctxAbove(0, -145, 3.4), FADE);
    expect(alphaOf(labels, 'marePacificum')).toBe(0);
  });

  it('names nothing on a globe too small to letter', () => {
    // 20 radii: a globe of about 100 px.
    expect(produce(state(true), ctxAbove(8, 20, 20), FADE).labels).toEqual([]);
  });
});
