import { describe, it, expect } from 'vitest';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { antiqueBodyView } from '../../../../../src/layers/body/labels/present/antiqueBodyView';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { rotateVec3ByTightMat3 } from '../../../../../src/utils/math/rotateVec3ByTightMat3';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { frameViewsAt } from '../../../../helpers/frame/frameViewsAt';

const RADIUS_M = 1737000;
const RADII_OFF = 2.65;

// The Moon from 2.65 radii out over latitude 0, longitude 0, looking at its centre.
function moonView() {
  const moon = deriveBodyStates(CONST_J2000).get('moon')!;
  const out = rotateVec3ByTightMat3(moon.orientation, [1, 0, 0]);
  const distanceMpc = RADII_OFF * RADIUS_M * SCALE_UNITS.M_TO_MPC;
  const m = moon.positionMpc;
  const eyeMpc: Vec3 = [
    m[0] + out[0] * distanceMpc,
    m[1] + out[1] * distanceMpc,
    m[2] + out[2] * distanceMpc,
  ];
  const [ctx] = frameViewsAt({ eyeMpc, forward: [-out[0], -out[1], -out[2]], distanceMpc });
  return { view: antiqueBodyView(moon, RADIUS_M, [1, 0, 0], ctx!), moon, eyeMpc };
}

describe('antiqueBodyView', () => {
  it('puts the limb where the eye sees it, not at the small-angle radius a few radii out', () => {
    const { view } = moonView();
    // The limb from 2.65 radii is the tangent circle, acos(1/2.65) off the sub-eye point.
    const limbLonDeg = (Math.acos(1 / RADII_OFF) * 180) / Math.PI;
    const limb = view.project(0, limbLonDeg)!;
    const c = view.discCentrePx!;
    expect(Math.hypot(limb[0] - c[0], limb[1] - c[1])).toBeCloseTo(view.discRadiusPx, 0);
  });

  it('anchors a label on the ground point whose px it was given', () => {
    const { view, moon, eyeMpc } = moonView();
    const [lat, lon] = [-43.3, -11.2];
    const px = view.project(lat, lon)!;
    const anchor = view.anchorMpc(px[0], px[1], lat, lon);
    const up = rotateVec3ByTightMat3(moon.orientation, [
      Math.cos((lat * Math.PI) / 180) * Math.cos((lon * Math.PI) / 180),
      Math.cos((lat * Math.PI) / 180) * Math.sin((lon * Math.PI) / 180),
      Math.sin((lat * Math.PI) / 180),
    ]);
    const radiusMpc = RADIUS_M * SCALE_UNITS.M_TO_MPC;
    for (let i = 0; i < 3; i++) {
      const ground = moon.positionMpc[i]! + up[i]! * radiusMpc - eyeMpc[i]!;
      expect(anchor[i]! / radiusMpc).toBeCloseTo(ground / radiusMpc, 4);
    }
  });
});
