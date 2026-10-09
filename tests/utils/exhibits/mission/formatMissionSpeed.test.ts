import { describe, expect, it } from 'vitest';

import { MISSION_SPEEDS } from '../../../../src/data/exhibits/mission/missionSpeeds';
import { formatMissionSpeed } from '../../../../src/utils/exhibits/mission/formatMissionSpeed';

describe('formatMissionSpeed', () => {
  it('writes every ladder factor as a short multiplier', () => {
    expect(MISSION_SPEEDS.map(formatMissionSpeed)).toEqual(['¼×', '½×', '1×', '2×', '4×']);
  });
});
