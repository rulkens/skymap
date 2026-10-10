import { describe, it, expect } from 'vitest';

import { sameStarCut } from '../../../../../src/layers/starCatalog/render/cut/sameStarCut';
import type { StarCutSpec } from '../../../../../src/layers/starCatalog/@types/StarCutSpec';
import { EYE_SLACK_MPC, PLANE_SLACK } from '../../../../../src/data/starNodeFade';
import { Source } from '../../../../../src/data/source';

function cut(over: Partial<StarCutSpec> = {}): StarCutSpec {
  return {
    originMpc: [1, 2, 3],
    planes: new Float32Array(24).fill(0.5),
    refineThreshold: 0.05,
    worldSpread: 1,
    leafMarginRad: 0.001,
    sources: [{ source: Source.GaiaStars, opacity: 1, budgetTypical: 100 }],
    ...over,
  };
}

function planesWith(index: number, delta: number): Float32Array {
  const planes = new Float32Array(24).fill(0.5);
  planes[index] = 0.5 + delta;
  return planes;
}

describe('sameStarCut', () => {
  it('treats identical specs as the same', () => {
    expect(sameStarCut(cut(), cut())).toBe(true);
  });

  it('absorbs an eye move or plane change within the slack, not beyond it', () => {
    expect(sameStarCut(cut(), cut({ originMpc: [1, 2, 3 + EYE_SLACK_MPC / 2] }))).toBe(true);
    expect(sameStarCut(cut(), cut({ originMpc: [1, 2, 3 + EYE_SLACK_MPC * 2] }))).toBe(false);
    expect(sameStarCut(cut(), cut({ planes: planesWith(7, PLANE_SLACK / 2) }))).toBe(true);
    expect(sameStarCut(cut(), cut({ planes: planesWith(7, PLANE_SLACK * 2) }))).toBe(false);
  });

  it('differs when the plane count changes, e.g. a view is added', () => {
    expect(sameStarCut(cut(), cut({ planes: new Float32Array(48).fill(0.5) }))).toBe(false);
  });

  it('differs on any other field, including a source fade multiplier', () => {
    expect(sameStarCut(cut(), cut({ refineThreshold: 0.06 }))).toBe(false);
    const row = { source: Source.GaiaStars, opacity: 0.5, budgetTypical: 100 };
    expect(sameStarCut(cut(), cut({ sources: [row] }))).toBe(false);
  });
});
