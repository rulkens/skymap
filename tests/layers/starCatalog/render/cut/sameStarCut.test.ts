import { describe, it, expect } from 'vitest';

import { sameStarCut } from '../../../../../src/layers/starCatalog/render/cut/sameStarCut';
import type { StarCutInputs } from '../../../../../src/layers/starCatalog/@types/StarCutInputs';
import { Source } from '../../../../../src/data/source';

function frame(over: Partial<StarCutInputs> = {}): StarCutInputs {
  return {
    cut: {
      originMpc: [1, 2, 3],
      planes: new Float32Array(24).fill(0.5),
      refineThreshold: 0.05,
      worldSpread: 1,
      leafMarginRad: 0.001,
      sources: [{ source: Source.GaiaStars, opacity: 1, budgetTypical: 100 }],
    },
    nowMs: 0,
    sizePx: 2.5,
    brightness: 1,
    glowOverlap: 1,
    aggregateIntensityCap: 0.06,
    ...over,
  };
}

function withCut(over: Partial<StarCutInputs['cut']>): StarCutInputs {
  return frame({ cut: { ...frame().cut, ...over } });
}

describe('sameStarCut', () => {
  it('treats frames with identical cut inputs as the same, whatever nowMs or the shader scalars', () => {
    expect(sameStarCut(frame(), frame({ nowMs: 99, brightness: 3, sizePx: 9 }))).toBe(true);
    expect(sameStarCut(null, null)).toBe(true);
  });

  it('differs when the origin moves, a plane changes, or one side is null', () => {
    expect(sameStarCut(frame(), withCut({ originMpc: [1, 2, 3.0001] }))).toBe(false);
    const planes = new Float32Array(24).fill(0.5);
    planes[7] = 0.6;
    expect(sameStarCut(frame(), withCut({ planes }))).toBe(false);
    expect(sameStarCut(frame(), null)).toBe(false);
    expect(sameStarCut(null, frame())).toBe(false);
  });

  it('differs when a source row changes, including its fade multiplier', () => {
    const row = { source: Source.GaiaStars, opacity: 0.5, budgetTypical: 100 };
    expect(sameStarCut(frame(), withCut({ sources: [row] }))).toBe(false);
  });
});
