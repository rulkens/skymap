import { describe, it, expect } from 'vitest';

import { sameStarCut } from '../../../../../src/layers/starCatalog/render/cut/sameStarCut';
import type { StarCutFrame } from '../../../../../src/layers/starCatalog/@types/StarCutFrame';
import { Source } from '../../../../../src/data/source';

function frame(over: Partial<StarCutFrame> = {}): StarCutFrame {
  return {
    originMpc: [1, 2, 3],
    nowMs: 0,
    planes: new Float32Array(24).fill(0.5),
    viewCount: 1,
    refineThreshold: 0.05,
    worldSpread: 1,
    leafMarginRad: 0.001,
    sources: [{ source: Source.GaiaStars, opacity: 1, budgetTypical: 100 }],
    sizePx: 2.5,
    brightness: 1,
    glowOverlap: 1,
    aggregateIntensityCap: 0.06,
    ...over,
  };
}

describe('sameStarCut', () => {
  it('treats frames with identical cut inputs as the same, whatever nowMs or the shader scalars', () => {
    expect(sameStarCut(frame(), frame({ nowMs: 99, brightness: 3, sizePx: 9 }))).toBe(true);
    expect(sameStarCut(null, null)).toBe(true);
  });

  it('differs when the origin moves, a plane changes, or one side is null', () => {
    expect(sameStarCut(frame(), frame({ originMpc: [1, 2, 3.0001] }))).toBe(false);
    const planes = new Float32Array(24).fill(0.5);
    planes[7] = 0.6;
    expect(sameStarCut(frame(), frame({ planes }))).toBe(false);
    expect(sameStarCut(frame(), null)).toBe(false);
    expect(sameStarCut(null, frame())).toBe(false);
  });
});
