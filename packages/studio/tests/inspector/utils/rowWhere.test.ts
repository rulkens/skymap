import { describe, expect, it } from 'vitest';
import { dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import { buildTimeline } from '../../../src/timeline/utils/buildTimeline';
import { rowWhere } from '../../../src/inspector/utils/rowWhere';

describe('rowWhere', () => {
  const { rows } = buildTimeline(
    { timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)]), dollyTo(1, 1)] },
    null,
    [],
  );
  const row = (id: string) => rows.find((r) => r.id === id)!;

  it('names the parent block', () => {
    expect(rowWhere(rows, row('e:0.1'))).toBe('Sequence');
  });

  it('names a top-level step Top level', () => {
    expect(rowWhere(rows, row('e:1'))).toBe('Top level');
  });

  it('names the Start row', () => {
    expect(rowWhere(rows, rows.find((r) => r.ref.kind === 'start')!)).toBe('Start');
  });
});
