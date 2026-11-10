import { describe, expect, it } from 'vitest';
import { dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import { buildTimeline } from '../../../src/timeline/utils/buildTimeline';
import { rowContext } from '../../../src/inspector/utils/rowContext';

describe('rowContext', () => {
  it('names the parent and the position among its siblings', () => {
    const { rows } = buildTimeline(
      { timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)]), dollyTo(1, 1)] },
      null,
      [],
    );
    const second = rows.find((r) => r.id === 'e:0.1')!;
    expect(rowContext(rows, second)).toEqual({ parent: 'Sequence', index: 2, count: 2 });
    const last = rows.find((r) => r.id === 'e:1')!;
    // Start is not counted among the top-level steps.
    expect(rowContext(rows, last)).toEqual({ parent: 'Top level', index: 2, count: 2 });
  });
});
