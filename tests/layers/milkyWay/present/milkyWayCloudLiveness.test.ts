/**
 * deriveMilkyWayCloudAlpha — the apparent-size fade and focus emphasis. The distance
 * bands are core's (`tests/layers/milkyWay/visibility.test.ts`).
 */

import { describe, it, expect } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { deriveMilkyWayCloudAlpha } from '../../../../src/layers/milkyWay/present/milkyWayCloudLiveness';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { STRONG_RECESSION } from '../../../../src/data/strongRecession';
import { MILKY_WAY_PICK_ID } from '../../../../src/layers/milkyWay/present/milkyWayPickId';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const GALACTIC_CENTRE_POS = deriveBodyStates(CONST_J2000).get('galactic-centre')!.positionMpc;

// Comfortably above the disc's apparent-size gate (12 px).
const FOV_Y_RAD = (60 * Math.PI) / 180;
const CANVAS = { width: 1280, height: 720 };
const PX_PER_RAD = CANVAS.height / (2 * Math.tan(FOV_Y_RAD / 2));

function makeCtx(
  camPosMpc: Vec3,
  focus = { focusBlend: 0, focusPickId: null as number | null },
): FrameView {
  return {
    snapshot: { nowMs: 0, simDays: CONST_J2000, ...focus },
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
      deriveMilkyWayCloudAlpha(makeCtx(awayFromGc, { focusBlend: 1, focusPickId }), 1);
    expect(alphaWithFocus(null)).toBeCloseTo(STRONG_RECESSION);
    expect(alphaWithFocus(MILKY_WAY_PICK_ID)).toBe(1);
  });
});

describe('deriveMilkyWayCloudAlpha — handed value', () => {
  it('is null when the handed value is 0', () => {
    expect(deriveMilkyWayCloudAlpha(makeCtx([0, 0, 0.005]), 0)).toBeNull();
  });
});
