import { describe, it, expect } from 'vitest';

import { updateEffectAt } from '../../../src/draft/utils/updateEffectAt';
import {
  all,
  dollyTo,
  hold,
  seq,
} from '../../../../../src/services/engine/animation/effectHelpers';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

describe('updateEffectAt', () => {
  it('updateEffectAt keeps every sibling subtree by identity', () => {
    const data: ClipData = {
      timeline: [hold(1), seq([all([dollyTo(1, 2), dollyTo(2, 3)]), hold(2)]), hold(3)],
    };
    const replacement = hold(9);

    const next = updateEffectAt(data, [1, 0, 1], () => replacement);

    const spine = next.timeline[1]!;
    if (spine.kind !== 'seq') throw new Error('expected the seq');
    const group = spine.children[0]!;
    if (group.kind !== 'all') throw new Error('expected the all');
    const before = data.timeline[1]! as typeof spine;
    expect(group.children[1]).toBe(replacement);
    // Off the spine, every node is the original object; on it, every node is new.
    expect(next.timeline[0]).toBe(data.timeline[0]);
    expect(next.timeline[2]).toBe(data.timeline[2]);
    expect(spine.children[1]).toBe(before.children[1]);
    expect(group.children[0]).toBe((before.children[0] as typeof group).children[0]);
    expect(spine).not.toBe(before);
    expect(group).not.toBe(before.children[0]);
    expect(data.timeline[1]).toBe(before);
  });
});
