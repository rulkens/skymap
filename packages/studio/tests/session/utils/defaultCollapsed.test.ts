import { describe, it, expect } from 'vitest';

import { defaultCollapsed } from '../../../src/session/utils/defaultCollapsed';
import {
  atPoint,
  flyPath,
  fork,
  hold,
  seq,
} from '../../../../../src/services/engine/animation/effectHelpers';

const path = (n: number) =>
  flyPath(
    Array.from({ length: n }, (_, i) => atPoint([i, 0, 0], 5)),
    { over: 10 },
  );

describe('defaultCollapsed', () => {
  it('defaultCollapsed folds a flyPath past 8 waypoints and nothing else', () => {
    const draft = { timeline: [path(8), seq([hold(1), fork(path(9))]), path(12)] };

    expect(defaultCollapsed(draft)).toEqual(['e:1.1.0', 'e:2']);
  });
});
