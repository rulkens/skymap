/**
 * fitPlan — per-category descriptor-loss weights + optimisable param ranges
 * for `autoFit`. Ported verbatim from the spike's `galaxy-matcher.js`; the weight
 * values, param bounds, and their order are load-bearing (they set the
 * coordinate-descent's step sizes via `(hi - lo)`), so this is a straight
 * transcription rather than a "cleaned up" table.
 *
 * `armOK = q > 0.4` gates the arm-harmonic channel: near edge-on (q ≤ 0.4)
 * the azimuthal DFT `computeDescriptor` extracts is unreliable (foreshortened
 * arms alias into spurious harmonics), so the arm weight drops from 5 to 1
 * and the discrete arm-count sweep is skipped entirely (`arms: null`) rather
 * than searched against noise.
 */

import type { GalaxyCategory } from '../../../../src/@types/galaxy/GalaxyCategory';
import type { FitPlan } from '../../@types/matcher/FitPlan';
import type { FitParamRange } from '../../@types/matcher/FitParamRange';

export function fitPlan(category: GalaxyCategory, q: number): FitPlan {
  const armOK = q > 0.4; // arm harmonics unreliable near edge-on

  if (category === 'elliptical') {
    return {
      w: { profile: 9, q: 7, color: 1.5, arm: 0, dust: 0 },
      params: [['bulgeSize', 0.4, 1.6]],
      arms: null,
    };
  }
  if (category === 'irregular') {
    return {
      w: { profile: 3, q: 1.5, color: 2.2, arm: 0.4, dust: 1.4 },
      params: [
        ['hii', 0, 2],
        ['youngStars', 0.1, 1],
        ['spriteDust', 0, 1.6],
        ['diskThickness', 0.5, 1.8],
        ['bulgeSize', 0.1, 0.8],
      ],
      arms: null,
    };
  }
  if (category === 'lenticular') {
    return {
      w: { profile: 6, q: 4.5, color: 1.6, arm: 0.4, dust: 2.2 },
      params: [
        ['bulgeSize', 0.4, 1.8],
        ['spriteDust', 0, 1.6],
        ['dustRing', 0.4, 1.0],
        ['diskThickness', 0.4, 1.4],
      ],
      arms: null,
    };
  }

  // spiral / barred
  const params: FitParamRange[] = [
    ['bulgeSize', 0.2, 1.8],
    ['armWinding', 0, 1],
    ['armWidth', 0.4, 1.8],
    ['armStrength', 0.25, 1.5],
    ['spriteDust', 0, 2],
    ['hii', 0, 2],
    ['youngStars', 0.15, 1],
    ['diskThickness', 0.5, 1.6],
  ];
  if (category === 'barred') params.push(['barStrength', 0.4, 1.6]);
  return {
    w: { profile: 6, q: 3, color: 2.4, arm: armOK ? 5 : 1, dust: 2.4 },
    params,
    arms: armOK ? [1, 2, 3, 4, 5, 6] : null,
  };
}
