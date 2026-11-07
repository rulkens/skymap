/**
 * A town's name arrives with its sign: the tier's reveal level against the map's
 * detail at this eye, which `sign.wesl` reads from the same `antiqueMapDetail`.
 * A renamed city's modern gloss rides the name's own label: a gloss label of its
 * own would touch the name's rect inside the declutter pad and be cut by it.
 */

import { describe, it, expect } from 'vitest';
import { produceAntiqueEarthTowns } from '../../../../../src/layers/body/labels/present/produceAntiqueEarthTowns';
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
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';

// J2000 is noon at Greenwich in January: Europe lit.
const STATES = deriveBodyStates(CONST_J2000);
const EARTH = STATES.get(SCENE_EARTH.id)!;
const R_KM = SCENE_EARTH.surface.datumRadiusM / 1000;
const produce = produceAntiqueEarthTowns(bodyPickCodes());
const FADE = { [EARTH_ENTRY.id]: 1, planet: 1, 'small-body': 1 };
const state = {
  settings: { antique: { enabled: true } },
  viewRig: 'mono',
} as unknown as EngineState;

/** The eye `altitudeKm` over a ground point, at 1000 print units per radian. */
function ctxAbove(latDeg: number, lonDeg: number, altitudeKm: number): FrameView {
  const up = rotateVec3ByTightMat3(EARTH.orientation, surfacePointBodyFixed(latDeg, lonDeg, 1));
  const d = (R_KM + altitudeKm) * 1000 * SCALE_UNITS.M_TO_MPC;
  const e = EARTH.positionMpc;
  return {
    snapshot: { bodyStates: STATES },
    drawCamPos: [e[0] + up[0] * d, e[1] + up[1] * d, e[2] + up[2] * d],
    drawPxPerRad: 1000,
    canvasSize: { width: 1600, height: 900 },
  } as unknown as FrameView;
}

const byId = (labels: readonly Label2D[], id: string) => labels.find((l) => l.id === id);

describe('produceAntiqueEarthTowns', () => {
  it('names a town once the zoom reaches its tier, a village only nearer', () => {
    // 700 km up: detail ≈ 4.6, past the towns' level 3, short of the villages' 5.
    const region = produce(state, ctxAbove(52.4, 6, 700), FADE).labels;
    expect(byId(region, 'earthTown-amsteldam')!.fadeAlpha).toBeCloseTo(1);
    expect(byId(region, 'earthTown-hanover')).toBeUndefined();
    // 150 km up: detail ≈ 6.8.
    const near = produce(state, ctxAbove(52.4, 9.7, 150), FADE).labels;
    expect(byId(near, 'earthTown-hanover')!.fadeAlpha).toBeGreaterThan(0.5);
  });

  it("ranks the plate's own city over every other world city, so Amsteldam never yields", () => {
    const { labels } = produce(state, ctxAbove(52, 3, 3000), FADE);
    const amsteldam = byId(labels, 'earthTown-amsteldam')!.declutterPriority!;
    const others = labels.filter((l) => l.id !== 'earthTown-amsteldam');
    expect(Math.max(...others.map((l) => l.declutterPriority!))).toBeLessThan(amsteldam);
  });

  it("sets a renamed city's modern name beneath its period name, in one label", () => {
    const { labels } = produce(state, ctxAbove(48.2, 16.4, 3000), FADE);
    expect(
      byId(labels, 'earthTown-weenen')!
        .text.trim()
        .split('\n')
        .map((l) => l.trim()),
    ).toEqual(['Weenen', '(Vienna)']);
  });
});
