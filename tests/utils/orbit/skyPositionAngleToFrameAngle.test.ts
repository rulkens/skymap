import { describe, it, expect } from 'vitest';
import { skyPositionAngleToFrameAngle } from '../../../src/utils/orbit/skyPositionAngleToFrameAngle';

describe('skyPositionAngleToFrameAngle', () => {
  // Two hand-computed points pin the offset AND the sign together: `Ω − 90°`
  // reproduces neither. The frame's Ω is measured from xAxis (East) toward
  // yAxis (North), so a node due North is +π/2 and a node due East is 0.
  it('maps a node due North to the frame +y and a node due East to the frame +x', () => {
    expect(skyPositionAngleToFrameAngle(0)).toBeCloseTo(Math.PI / 2, 12);
    expect(skyPositionAngleToFrameAngle(90)).toBeCloseTo(0, 12);
  });
});
