import { describe, expect, it } from 'vitest';

import { RECEDE_ALL_FOCUS_SPHERE } from '../../../src/data/selection/recedeAllFocusSphere';
import { isPickableUnderFocus } from '../../../src/utils/structure/isPickableUnderFocus';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('RECEDE_ALL_FOCUS_SPHERE', () => {
  it('leaves nothing pickable once its blend is up: the Sun, a stream, a far galaxy', () => {
    const focus = { ...RECEDE_ALL_FOCUS_SPHERE, blend: 0.05 };
    const places: Vec3[] = [
      [0, 0, 0],
      [0.0056, -0.0225, -0.0137],
      [-3000, 1200, 800],
    ];
    expect(places.filter((p) => isPickableUnderFocus(p, focus))).toEqual([]);
  });
});
