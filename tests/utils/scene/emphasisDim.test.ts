import { describe, it, expect } from 'vitest';

import { emphasisDim } from '../../../src/utils/scene/emphasisDim';
import { MISSION_EMPHASIS_DIM } from '../../../src/data/missions/missionTrailStyle';

describe('emphasisDim', () => {
  it('leaves everything full strength with no emphasis, and the emphasised craft', () => {
    expect(emphasisDim(null, 'voyager1')).toBe(1);
    expect(emphasisDim('voyager1', 'voyager1')).toBe(1);
  });
  it('dims the other craft', () => {
    expect(emphasisDim('voyager1', 'voyager2')).toBe(MISSION_EMPHASIS_DIM);
  });
});
