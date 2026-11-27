import { describe, it, expect } from 'vitest';

import { aimAt, lookAtId } from '../../../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../../../src/utils/animation/focusId';
import { fixedFormOf } from '../../../../src/kinds/utils/fromView/fixedFormOf';
import type { CapturedView } from '../../../../src/@types/kinds/CapturedView';

describe('fixedFormOf', () => {
  it('fixedFormOf: Aim becomes an All of Turn and Tilt at the drawn angles', () => {
    const view: CapturedView = {
      pose: { target: [0, 0, 0], yaw: 0.6, pitch: -0.2, distance: 4 },
      fovYRad: 1,
    };
    const fixed = fixedFormOf(lookAtId(focusId('m31'), 2.5, 'linear'), view);
    expect(fixed).toEqual(aimAt({ yaw: 0.6, pitch: -0.2 }, 2.5, 'linear'));
  });
});
