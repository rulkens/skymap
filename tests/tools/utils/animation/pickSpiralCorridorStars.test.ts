/**
 * Tests for pickSpiralCorridorStars — the corridor snap. These cover the rules a
 * real bug could break: brightest-wins within a corridor, claim-once across
 * samples, the distance-scaled corridor width, empty-corridor skips, and the
 * order-preserving output.
 */

import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import {
  pickSpiralCorridorStars,
  type CorridorCandidate,
} from '../../../../tools/utils/animation/pickSpiralCorridorStars';

type Star = CorridorCandidate & { readonly tag: string };
const star = (posPc: Vec3, absMag: number, tag: string): Star => ({ posPc, absMag, tag });

describe('pickSpiralCorridorStars', () => {
  it('takes the brightest star inside a sample corridor', () => {
    // Sample at distance 10 → corridor radius 0.5·10 = 5. Both stars are inside;
    // the brighter (lower absMag) wins.
    const picked = pickSpiralCorridorStars({
      samples: [[10, 0, 0]],
      candidates: [star([11, 0, 0], 4, 'faint'), star([9, 0, 0], 1, 'bright')],
      corridorFrac: 0.5,
    });
    expect(picked.map((s) => s.tag)).toEqual(['bright']);
  });

  it('never claims the same star for two samples', () => {
    // One star sits between two samples, both of whose corridors reach it. The
    // first sample claims it; the second finds an empty corridor and is skipped.
    const picked = pickSpiralCorridorStars({
      samples: [
        [10, 0, 0],
        [12, 0, 0],
      ],
      candidates: [star([11, 0, 0], 2, 'only')],
      corridorFrac: 0.5,
    });
    expect(picked.map((s) => s.tag)).toEqual(['only']);
  });

  it('skips a sample whose corridor is empty', () => {
    const picked = pickSpiralCorridorStars({
      samples: [
        [10, 0, 0],
        [100, 0, 0],
      ],
      // Star near the first sample only; the second's corridor (10 wide) is empty.
      candidates: [star([10.5, 0, 0], 3, 'near')],
      corridorFrac: 0.1,
    });
    expect(picked.map((s) => s.tag)).toEqual(['near']);
  });

  it('scales the corridor with the sample distance', () => {
    // The SAME 3 pc offset is out of corridor for a near sample (10·0.1 = 1) but
    // inside it for a far one (100·0.1 = 10) — the distance-scaling is what flips
    // the outcome, nothing else changes.
    const offset = (base: number): Vec3 => [base + 3, 0, 0];
    const near = pickSpiralCorridorStars({
      samples: [[10, 0, 0]],
      candidates: [star(offset(10), 2, 's')],
      corridorFrac: 0.1,
    });
    const far = pickSpiralCorridorStars({
      samples: [[100, 0, 0]],
      candidates: [star(offset(100), 2, 's')],
      corridorFrac: 0.1,
    });
    expect(near).toEqual([]);
    expect(far.map((s) => s.tag)).toEqual(['s']);
  });

  it('returns picks in sample (spiral) order, threading candidate identity', () => {
    const picked = pickSpiralCorridorStars({
      samples: [
        [5, 0, 0],
        [50, 0, 0],
      ],
      candidates: [star([50, 0, 0], 2, 'outer'), star([5, 0, 0], 2, 'inner')],
      corridorFrac: 0.2,
    });
    expect(picked.map((s) => s.tag)).toEqual(['inner', 'outer']);
  });
});
