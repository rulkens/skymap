import { describe, it, expect } from 'vitest';

import { rulerSteps } from '../../../src/timeline/utils/rulerSteps';

describe('rulerSteps', () => {
  it('rulerSteps: 24 s over 900 px is 2 s / 0.4 s; 40 s is 5 s / 1 s', () => {
    expect(rulerSteps(24, 900)).toEqual({ major: 2, minor: 0.4 });
    expect(rulerSteps(40, 900)).toEqual({ major: 5, minor: 1 });
  });
});
