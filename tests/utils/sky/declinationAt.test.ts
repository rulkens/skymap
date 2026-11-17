import { describe, expect, it } from 'vitest';

import { declinationAt } from '../../../src/utils/sky/declinationAt';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { radToDeg } from '../../../src/utils/math/radToDeg';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';

describe('declinationAt', () => {
  it('puts the Sun at the tropic on each solstice', () => {
    const at = (ms: number) =>
      radToDeg(
        declinationAt(asSceneBodyId('earth'), [0, 0, 0], deriveBodyStates(unixMsToJulianDays(ms))),
      );
    expect(at(Date.UTC(2026, 5, 21, 12))).toBeCloseTo(23.44, 1);
    expect(at(Date.UTC(2026, 11, 21, 12))).toBeCloseTo(-23.44, 1);
  });
});
