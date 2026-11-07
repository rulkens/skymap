/**
 * deriveMilkyWayCloudAlpha — the apparent-size fade and focus emphasis. The distance
 * bands are core's (`tests/layers/milkyWay/visibility.test.ts`).
 */

import { describe, it, expect } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { deriveMilkyWayCloudAlpha } from '../../../../../src/layers/milkyWay/cloud/present/milkyWayCloudLiveness';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { STRONG_RECESSION } from '../../../../../src/data/strongRecession';
import { milkyWayPickId } from '../../../../../src/layers/milkyWay/picking/present/milkyWayPickId';
import { FOCUS_DIM_FLOOR } from '../../../../../src/data/focusDimFloor';
import { RECEDE_ALL_FOCUS_SPHERE } from '../../../../../src/data/selection/recedeAllFocusSphere';
import { ZERO_FOCUS } from '../../../../../src/services/engine/subsystems/structureFocusSubsystem';
import type { FocusUniformsValue } from '../../../../../src/@types/rendering/FocusUniformsValue';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Not a catalog value: the emphasis key must follow the code the caller passes.
const PICK_CODE = 37;

const GALACTIC_CENTRE_POS = deriveBodyStates(CONST_J2000).get('galactic-centre')!.positionMpc;

// Comfortably above the disc's apparent-size gate (12 px).
const FOV_Y_RAD = (60 * Math.PI) / 180;
const CANVAS = { width: 1280, height: 720 };
const PX_PER_RAD = CANVAS.height / (2 * Math.tan(FOV_Y_RAD / 2));

function makeCtx(
  camPosMpc: Vec3,
  focus: { focusBlend: number; focusPickId: number | null; focus?: FocusUniformsValue } = {
    focusBlend: 0,
    focusPickId: null,
  },
): FrameView {
  return {
    snapshot: { nowMs: 0, simDays: CONST_J2000, focus: ZERO_FOCUS, ...focus },
    drawCamPos: camPosMpc,
    drawPxPerRad: PX_PER_RAD,
    vp: new Float32Array(16) as unknown as Mat4,
  } as unknown as FrameView;
}

describe('deriveMilkyWayCloudAlpha — focus emphasis', () => {
  it('the disk recedes strongly unless the Milky Way is the focus', () => {
    const r0 = Math.hypot(GALACTIC_CENTRE_POS[0], GALACTIC_CENTRE_POS[1], GALACTIC_CENTRE_POS[2]);
    const awayFromGc = GALACTIC_CENTRE_POS.map((c) => (-c / r0) * 0.005) as unknown as Vec3;
    const alphaWithFocus = (focusPickId: number | null) =>
      deriveMilkyWayCloudAlpha(makeCtx(awayFromGc, { focusBlend: 1, focusPickId }), 1, PICK_CODE);
    expect(alphaWithFocus(null)).toBeCloseTo(STRONG_RECESSION);
    expect(alphaWithFocus(milkyWayPickId(PICK_CODE))).toBe(1);
  });

  it('outside the focus sphere the disk also dims by the focus fade, as the galaxies do', () => {
    const r0 = Math.hypot(GALACTIC_CENTRE_POS[0], GALACTIC_CENTRE_POS[1], GALACTIC_CENTRE_POS[2]);
    const awayFromGc = GALACTIC_CENTRE_POS.map((c) => (-c / r0) * 0.005) as unknown as Vec3;
    const focus = { ...RECEDE_ALL_FOCUS_SPHERE, blend: 1 };
    const alpha = deriveMilkyWayCloudAlpha(
      makeCtx(awayFromGc, { focusBlend: 1, focusPickId: null, focus }),
      1,
      PICK_CODE,
    );
    expect(alpha).toBeCloseTo(STRONG_RECESSION * FOCUS_DIM_FLOOR);
  });
});

describe('deriveMilkyWayCloudAlpha — handed value', () => {
  it('is null when the handed value is 0', () => {
    expect(deriveMilkyWayCloudAlpha(makeCtx([0, 0, 0.005]), 0, PICK_CODE)).toBeNull();
  });
});
