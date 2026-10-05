import { describe, expect, it } from 'vitest';

import { seatHeightM } from '../../../../../tools/utils/textures/siteTerrain/seatHeightM';

const LIFT_M = 0.9;

describe('seatHeightM', () => {
  it('sits on flat ground at its height', () => {
    const flat = [-1, 0, 1].map((e) => ({ eastM: e, northM: 0, heightM: 100 }));
    expect(seatHeightM(flat, [0, 0, 1], LIFT_M)).toBeCloseTo(100, 9);
  });

  it('rises until the highest bump under the footprint just touches', () => {
    const bumpy = [
      { eastM: 0, northM: 0, heightM: 100 },
      { eastM: 1, northM: 0, heightM: 100.07 },
    ];
    expect(seatHeightM(bumpy, [0, 0, 1], LIFT_M)).toBeCloseTo(100.07, 9);
  });

  it('compensates the wheels swinging down when the body tilts about its lifted origin', () => {
    // On a plane matching the tilt, only the origin-pivot sink is left: h(1/cos − 1).
    const tilt = (10 * Math.PI) / 180;
    const up: [number, number, number] = [-Math.sin(tilt), 0, Math.cos(tilt)];
    const slope = [-1, 0, 1].map((e) => ({
      eastM: e,
      northM: 0,
      heightM: 100 + e * Math.tan(tilt),
    }));
    expect(seatHeightM(slope, up, LIFT_M)).toBeCloseTo(100 + LIFT_M * (1 / Math.cos(tilt) - 1), 9);
  });
});
