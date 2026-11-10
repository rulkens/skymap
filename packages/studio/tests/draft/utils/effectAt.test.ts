import { describe, it, expect } from 'vitest';

import { effectAt } from '../../../src/draft/utils/effectAt';
import {
  dollyTo,
  fork,
  hold,
  seq,
} from '../../../../../src/services/engine/animation/effectHelpers';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

describe('effectAt', () => {
  it("walks seq children and a fork's child, and names nothing past a leaf or an index", () => {
    const inner = dollyTo(300, 5);
    const data: ClipData = { timeline: [hold(1), seq([hold(2), fork(inner)])] };

    expect(effectAt(data, [1, 1, 0])).toBe(inner);
    expect(effectAt(data, [1, 1, 1])).toBeNull();
    expect(effectAt(data, [0, 0])).toBeNull();
    expect(effectAt(data, [2])).toBeNull();
  });
});
