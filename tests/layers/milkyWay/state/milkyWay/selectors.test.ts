import { describe, it, expect } from 'vitest';

import { selectMilkyWayParts } from '../../../../../src/layers/milkyWay/state/milkyWay/selectors';
import { initialState } from '../../../../../src/layers/milkyWay/state/milkyWay/initialState';
import type { MilkyWayRenderer } from '../../../../../src/layers/milkyWay/@types/MilkyWayRenderer';

describe('selectMilkyWayParts', () => {
  it.each<[MilkyWayRenderer, boolean, boolean, boolean]>([
    ['v1', true, true, false],
    ['v2', false, false, true],
    ['both', true, false, true],
  ])('renderer %s draws cloud=%s, cloudDust=%s, field=%s', (renderer, cloud, cloudDust, field) => {
    const parts = selectMilkyWayParts({ ...initialState, renderer });

    expect(parts).toEqual({ cloud, cloudDust, field });
  });
});
