import { describe, expect, it } from 'vitest';

import { all, dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import { buildTimeline } from '../../../src/timeline/utils/buildTimeline';
import { ancestorChains } from '../../../src/timeline/utils/ancestorChains';
import { selectionRelation } from '../../../src/timeline/utils/selectionRelation';

// Start, Sequence, Distance, All, Distance, Distance.
const { rows } = buildTimeline(
  { timeline: [seq([dollyTo(300, 4), all([dollyTo(500, 4), dollyTo(600, 4)])])] },
  null,
  [],
);
const chains = ancestorChains(rows);
const relation = (selected: number) =>
  rows.map((_, i) => selectionRelation(rows, chains, i, selected));

describe('selectionRelation', () => {
  it('a block marks its steps, at any depth, inside it at its own rail', () => {
    expect(relation(3).map((r) => r.insideAt)).toEqual([null, null, null, null, 1, 1]);
    expect(relation(1).map((r) => r.insideAt)).toEqual([null, null, 0, 0, 0, 0]);
  });

  it('a step marks the blocks holding it, and their rails down to it but not past it', () => {
    const r = relation(4);
    expect(r.map((x) => x.contains)).toEqual([false, true, false, true, false, false]);
    expect(r.map((x) => x.pathAt)).toEqual([[], [], [0], [0], [0, 1], []]);
  });
});
