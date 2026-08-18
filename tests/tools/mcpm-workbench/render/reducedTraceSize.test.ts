import { describe, expect, it } from 'vitest';
import { reducedTraceSize } from '../../../../tools/mcpm-workbench/src/render/reducedTraceSize';

describe('reducedTraceSize', () => {
  it('passes the drawable size through unchanged at divisor 1', () => {
    expect(reducedTraceSize(1280, 800, 1)).toEqual({ width: 1280, height: 800 });
  });

  it("floors a non-exact division, matching the upsample shader's sample-at-uv semantics", () => {
    expect(reducedTraceSize(1281, 802, 3)).toEqual({ width: 427, height: 267 });
  });

  it('clamps to 1 px rather than an illegal 0-dimension texture on a tiny canvas', () => {
    expect(reducedTraceSize(4, 4, 8)).toEqual({ width: 1, height: 1 });
  });
});
