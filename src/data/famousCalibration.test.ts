import { describe, it, expect } from 'vitest';
import { DEPROJECT_MIN_AXIS_RATIO } from './famousCalibration';

describe('famousCalibration', () => {
  it('DEPROJECT_MIN_AXIS_RATIO is 0.3', () => {
    expect(DEPROJECT_MIN_AXIS_RATIO).toBe(0.3);
  });
});
