import { describe, it, expect } from 'vitest';
import { vrHeadWorldPos } from '../../../src/utils/camera/vrHeadWorldPos';
import type { VrEye } from '../../../src/services/xr/vrSpikeState';
import type { Vec3 } from '../../../src/@types/math/Vec3';

function makeEye(camPos: Vec3): VrEye {
  return { camPos } as unknown as VrEye;
}

describe('vrHeadWorldPos', () => {
  it('averages two eyes symmetric about the midpoint', () => {
    expect(vrHeadWorldPos([makeEye([-1, 2, 5]), makeEye([1, 2, 5])])).toEqual([0, 2, 5]);
  });

  it('returns a single eye unchanged', () => {
    expect(vrHeadWorldPos([makeEye([3, -4, 7])])).toEqual([3, -4, 7]);
  });

  it('returns the origin for an empty eye list rather than dividing by zero', () => {
    expect(vrHeadWorldPos([])).toEqual([0, 0, 0]);
  });
});
