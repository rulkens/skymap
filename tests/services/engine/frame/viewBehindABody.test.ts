/**
 * viewBehindABody — true only when one body's disc covers the whole frustum. The
 * cases a wrong answer would show: stars missing beside a visible limb (false
 * positive), or the star passes never skipping low over Earth (false negative).
 */

import { describe, expect, it } from 'vitest';
import { mat4d } from 'wgpu-matrix';

import { viewBehindABody } from '../../../../src/services/engine/frame/viewBehindABody';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const STATES = deriveBodyStates(CONST_J2000);
const EARTH = STATES.get(SCENE_EARTH.id)!.positionMpc;
const STATE = {} as PassState;
const FOV_Y_RAD = Math.PI / 3;

/** A 16:9, 60° view from `altitudeKm` over Earth's +x point, looking along `dir` (Earth-relative). */
function viewFrom(altitudeKm: number, dir: Vec3): FrameView {
  const distanceMpc = (6371 + altitudeKm) * SCALE_UNITS.KM_TO_MPC;
  const eye: Vec3 = [EARTH[0] + distanceMpc, EARTH[1], EARTH[2]];
  const target: Vec3 = [
    eye[0] + dir[0] * distanceMpc,
    eye[1] + dir[1] * distanceMpc,
    eye[2] + dir[2] * distanceMpc,
  ];
  const vp = mat4d.multiply(
    mat4d.perspective(FOV_Y_RAD, 16 / 9, distanceMpc * 1e-3, distanceMpc * 1e3),
    mat4d.lookAt(eye, target, [0, 0, 1]),
  ) as Float64Array;
  return {
    snapshot: { bodyStates: STATES, sceneBodies: [] },
    drawCamPos: eye,
    drawPxPerRad: 720 / (2 * Math.tan(FOV_Y_RAD / 2)),
    slabs: [{ vp }],
  } as unknown as FrameView;
}

describe('viewBehindABody', () => {
  it('is true looking straight down from low orbit', () => {
    expect(viewBehindABody(STATE, viewFrom(1000, [-1, 0, 0]), NEAR0)).toBe(true);
  });

  it('is false once the limb enters a corner of the view', () => {
    // From 20,000 km Earth's disc is ~14° in radius: inside a 60° view, sky all round.
    expect(viewBehindABody(STATE, viewFrom(20_000, [-1, 0, 0]), NEAR0)).toBe(false);
  });

  it('is false looking away from the body', () => {
    expect(viewBehindABody(STATE, viewFrom(1000, [1, 0, 0]), NEAR0)).toBe(false);
  });
});
