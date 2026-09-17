import { describe, expect, it } from 'vitest';

import { quatFromAxisAngle } from '../../../../src/utils/math/quatFromAxisAngle';
import { isZOnlyRotation } from '../../../../tools/scene-workbench/src/scene/isZOnlyRotation';

describe('isZOnlyRotation', () => {
  it('isZOnlyRotation rejects a tilt about X', () => {
    expect(isZOnlyRotation(quatFromAxisAngle([1, 0, 0], 0.01))).toBe(false);
  });
});
