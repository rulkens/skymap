import { describe, expect, it } from 'vitest';

import { bandValueOf } from '../../../../src/services/engine/presentation/bandValueOf';
import { smoothstep } from '../../../../src/utils/math/smoothstep';
import { regionById } from '../../../../src/utils/regions/regionById';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EntryBand } from '../../../../src/@types/engine/layer/EntryBand';
import type { ShowEntry } from '../../../../src/@types/engine/layer/ShowEntry';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const GC_ANCHOR: Vec3 = [-0.0004, -0.007, -0.004];

function viewAt(drawCamPos: Vec3): Pick<FrameView, 'drawCamPos' | 'snapshot'> {
  const bodyStates = new Map([
    [regionById('galactic-centre').anchorId, { positionMpc: GC_ANCHOR }],
  ]);
  return { drawCamPos, snapshot: { bodyStates } } as unknown as Pick<
    FrameView,
    'drawCamPos' | 'snapshot'
  >;
}

const entry = (bands: Record<string, EntryBand>, items?: readonly string[]): ShowEntry => ({
  key: 'probe',
  items,
  bands,
});

describe('bandValueOf', () => {
  it('in window is 0 at in[0], 1 at in[1], and smoothstep between', () => {
    const e = entry({ b: { in: [1, 3] } });
    expect(bandValueOf(e, undefined, viewAt([1, 0, 0]))).toBe(0);
    expect(bandValueOf(e, undefined, viewAt([0, 3, 0]))).toBe(1);
    expect(bandValueOf(e, undefined, viewAt([0, 0, 1.5]))).toBeCloseTo(smoothstep(1, 3, 1.5));
  });

  it('out window is 1 at out[0] and 0 at out[1]', () => {
    const e = entry({ b: { out: [2, 4] } });
    expect(bandValueOf(e, undefined, viewAt([2, 0, 0]))).toBe(1);
    expect(bandValueOf(e, undefined, viewAt([4, 0, 0]))).toBe(0);
  });

  it('in and out together multiply', () => {
    const e = entry({ near: { in: [1, 3] }, far: { out: [2, 4] } });
    const d = 2.5;
    expect(bandValueOf(e, undefined, viewAt([d, 0, 0]))).toBeCloseTo(
      smoothstep(1, 3, d) * (1 - smoothstep(2, 4, d)),
    );
  });

  it('a band with items does not touch other items', () => {
    const e = entry({ b: { out: [0, 1], items: ['a'] } }, ['a', 'b']);
    expect(bandValueOf(e, 'a', viewAt([2, 0, 0]))).toBe(0);
    expect(bandValueOf(e, 'b', viewAt([2, 0, 0]))).toBe(1);
  });

  it('from galactic-centre measures from the region anchor', () => {
    const e = entry({ b: { from: 'galactic-centre', in: [0.0006, 0.012] } });
    const atEdge: Vec3 = [GC_ANCHOR[0] + 0.0006, GC_ANCHOR[1], GC_ANCHOR[2]];
    expect(bandValueOf(e, undefined, viewAt(atEdge))).toBe(0);
    // The same pose measured from the origin sits mid-ramp, so only the anchor reading gives 0.
    const fromOrigin = bandValueOf(
      entry({ b: { in: [0.0006, 0.012] } }),
      undefined,
      viewAt(atEdge),
    );
    expect(fromOrigin).toBeGreaterThan(0);
  });

  it('an entry without bands gives 1', () => {
    expect(bandValueOf({ key: 'probe' }, undefined, viewAt([0, 0, 0]))).toBe(1);
  });
});
