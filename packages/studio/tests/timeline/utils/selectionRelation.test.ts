import { describe, expect, it } from 'vitest';

import { all, dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import { buildTimeline } from '../../../src/timeline/utils/buildTimeline';
import { ancestorChains } from '../../../src/timeline/utils/ancestorChains';
import { selectionRelation } from '../../../src/timeline/utils/selectionRelation';

// Start, Sequence, Distance, All, Distance, Distance.
const timeline = buildTimeline(
  { timeline: [seq([dollyTo(300, 4), all([dollyTo(500, 4), dollyTo(600, 4)])])] },
  null,
  [],
);

describe('selectionRelation', () => {
  it('a block marks its steps, at any depth, inside it at its own rail; its blocks hold it', () => {
    const rows = timeline.rows;
    const chains = ancestorChains(rows);
    const relation = (selected: number) =>
      rows.map((row, i) => selectionRelation(row, chains[i]!, rows[selected]!.id, chains[selected]!));

    expect(relation(3).map((r) => r.insideAt)).toEqual([null, null, null, null, 1, 1]);
    expect(relation(1).map((r) => r.insideAt)).toEqual([null, null, 0, 0, 0, 0]);
    expect(relation(4).map((r) => r.contains)).toEqual([false, true, false, true, false, false]);
  });
});
