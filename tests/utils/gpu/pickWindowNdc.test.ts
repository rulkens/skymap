import { describe, expect, it } from 'vitest';

import { pickWindowNdc } from '../../../src/utils/gpu/pickWindowNdc';

describe('pickWindowNdc', () => {
  it('pickWindowNdc of the whole canvas is centre 0, half-extent 1', () => {
    const ndc = pickWindowNdc({ originPx: [0, 0], sizePx: [100, 50] }, [100, 50]);
    expect(ndc.centre[0]).toBeCloseTo(0, 12);
    expect(ndc.centre[1]).toBeCloseTo(0, 12);
    expect(ndc.halfExtent).toEqual([1, 1]);
  });

  it('pickWindowNdc flips y: a 1×1 window at the top-left pixel', () => {
    const ndc = pickWindowNdc({ originPx: [0, 0], sizePx: [1, 1] }, [100, 50]);
    expect(ndc.centre[0]).toBeCloseTo(-0.99, 12);
    expect(ndc.centre[1]).toBeCloseTo(0.98, 12);
    expect(ndc.halfExtent[0]).toBeCloseTo(0.01, 12);
    expect(ndc.halfExtent[1]).toBeCloseTo(0.02, 12);
  });
});
