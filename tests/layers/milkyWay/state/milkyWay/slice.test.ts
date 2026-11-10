/**
 * The milkyWay settings reducers, through the real root reducer: a wrong
 * action type or a mis-nested merge would drop the patch silently.
 */
import { describe, it, expect } from 'vitest';

import { rootReducer } from '../../../../../src/store/rootReducer';
import {
  setMilkyWayCloudTuning,
  setMilkyWayFieldTuning,
  setMilkyWayRenderer,
} from '../../../../../src/layers/milkyWay/state/milkyWay/slice';
import type { MilkyWaySettings } from '../../../../../src/layers/milkyWay/@types/MilkyWaySettings';

type RootState = ReturnType<typeof rootReducer>;

const initial: RootState = rootReducer(undefined, { type: '@@init' });
const milkyWayAfter = (action: Parameters<typeof rootReducer>[1]): MilkyWaySettings =>
  rootReducer(initial, action).settings.milkyWay;

describe('milkyWay settings reducers', () => {
  const before = initial.settings.milkyWay;

  it('a cloud patch merges into cloud and leaves field and renderer', () => {
    const exposure = before.cloud.exposure * 2;
    const after = milkyWayAfter(setMilkyWayCloudTuning({ exposure }));

    expect(after.cloud).toEqual({ ...before.cloud, exposure });
    expect(after.field).toBe(before.field);
    expect(after.renderer).toBe(before.renderer);
  });

  it('a field patch merges into field and leaves cloud', () => {
    const divisors = { ...before.field.divisors, field: 3 };
    const after = milkyWayAfter(setMilkyWayFieldTuning({ exposure: 2, divisors }));

    expect(after.field).toEqual({ ...before.field, exposure: 2, divisors });
    expect(after.cloud).toBe(before.cloud);
  });

  it('setMilkyWayRenderer sets only renderer', () => {
    const after = milkyWayAfter(setMilkyWayRenderer('both'));

    expect(after).toEqual({ ...before, renderer: 'both' });
    expect(after.cloud).toBe(before.cloud);
    expect(after.field).toBe(before.field);
  });
});
