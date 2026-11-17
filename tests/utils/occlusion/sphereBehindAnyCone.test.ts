import { describe, expect, it } from 'vitest';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { occluderConesFrom } from '../../../src/utils/occlusion/occluderConesFrom';
import { sphereBehindAnyCone } from '../../../src/utils/occlusion/sphereBehindAnyCone';

// A body of radius 5 Mpc centred 10 Mpc down +x: its disc's half-angle is 30°.
const body = {
  positionMpc: [10, 0, 0] as [number, number, number],
  radiusM: 5 / SCALE_UNITS.M_TO_MPC,
  outerRadiusM: 0,
};
const cones = occluderConesFrom([body], [0, 0, 0]);
const at = (deg: number, distance: number): [number, number, number] => {
  const r = (deg * Math.PI) / 180;
  return [distance * Math.cos(r), distance * Math.sin(r), 0];
};

describe('sphereBehindAnyCone', () => {
  it('hides a sphere well inside the disc and beyond the body', () => {
    expect(sphereBehindAnyCone(cones, ...at(20, 100), 100, 1)).toBe(true);
  });

  it('keeps a sphere outside the disc', () => {
    expect(sphereBehindAnyCone(cones, ...at(35, 100), 100, 1)).toBe(false);
  });

  it('keeps a sphere whose own disc reaches past the limb', () => {
    // A 3° half-angle sphere: 28° off-axis its edge sits at 31°, outside the body's 30°.
    const radius = 100 * Math.sin((3 * Math.PI) / 180);
    expect(sphereBehindAnyCone(cones, ...at(28, 100), 100, radius)).toBe(false);
    expect(sphereBehindAnyCone(cones, ...at(26, 100), 100, radius)).toBe(true);
  });

  it('keeps a sphere nearer than the body', () => {
    expect(sphereBehindAnyCone(cones, ...at(0, 4), 4, 0.1)).toBe(false);
  });
});
