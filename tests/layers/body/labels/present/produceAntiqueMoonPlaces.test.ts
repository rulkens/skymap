import { describe, it, expect } from 'vitest';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { produceAntiqueMoonPlaces } from '../../../../../src/layers/body/labels/present/produceAntiqueMoonPlaces';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { ANTIQUE_MOON_PLACES } from '../../../../../src/data/labels/antiqueMoonPlaces';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { EARTH_ENTRY } from '../../../../../src/layers/body/sources/earth';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import { rotateVec3ByTightMat3 } from '../../../../../src/utils/math/rotateVec3ByTightMat3';
import { bodyPickCodes } from '../../../../support/layerPickCodes';
import { frameViewsAt } from '../../../../helpers/frame/frameViewsAt';

// The lookbench's moon-full: the full Moon of 2026-10-26 06:00 UT from 4600 km over
// latitude 0, longitude 0, north up, its disc ~680 px tall on the shot's 1600 × 900 frame.
const SIM_DAYS = 2461339.75;
const DISTANCE_M = 4.6e6;
const FADE = { [EARTH_ENTRY.id]: 1, planet: 1, 'small-body': 1 };

function fullDiscLabels() {
  const states = deriveBodyStates(SIM_DAYS);
  const { positionMpc: moon, orientation } = states.get(asSceneBodyId('moon'))!;
  const out = rotateVec3ByTightMat3(orientation, [1, 0, 0]);
  const distanceMpc = DISTANCE_M * SCALE_UNITS.M_TO_MPC;
  const eyeMpc: Vec3 = [
    moon[0] + out[0] * distanceMpc,
    moon[1] + out[1] * distanceMpc,
    moon[2] + out[2] * distanceMpc,
  ];
  const [ctx] = frameViewsAt({
    eyeMpc,
    forward: [-out[0], -out[1], -out[2]],
    distanceMpc,
    simDays: SIM_DAYS,
    up: rotateVec3ByTightMat3(orientation, [0, 0, 1]),
    sizePx: { width: 1600, height: 900 },
  });
  const state = {
    settings: { antique: { enabled: true } },
    viewRig: 'mono',
  } as unknown as EngineState;
  return produceAntiqueMoonPlaces(bodyPickCodes())(state, ctx!, FADE).labels;
}

describe('produceAntiqueMoonPlaces', () => {
  // Riccioli's plate prints every sea; craters come second (lead's ruling, 2026-11-07):
  // Procellarum lost the full disc to Keplerus and Aristarchus, ranked above it.
  it('ranks every sea and Terra above every crater in the declutter', () => {
    const labels = fullDiscLabels();
    const isCrater = new Set(
      ANTIQUE_MOON_PLACES.filter((p) => p.kind === 'crater').map((p) => p.id),
    );
    const ranks = (crater: boolean) =>
      labels.filter((l) => isCrater.has(l.id) === crater).map((l) => l.declutterPriority!);
    expect(ranks(true).length).toBeGreaterThan(0);
    expect(Math.min(...ranks(false))).toBeGreaterThan(Math.max(...ranks(true)));
  });

  it("names the five great seas on the full disc, the limb's foreshortening notwithstanding", () => {
    const labels = fullDiscLabels();
    for (const sea of [
      'oceanusProcellarum',
      'mareCrisium',
      'mareFecunditatis',
      'mareNectaris',
      'mareFrigoris',
    ]) {
      expect(labels.find((l) => l.id === `moonPlace-${sea}`)?.fadeAlpha, sea).toBeGreaterThan(0.9);
    }
  });
});
