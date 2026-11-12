/**
 * Parity guard: the H,G constants hand-mirrored into `asteroids/lib/apparentMagnitude.wesl` must equal
 * `HG_PHASE_LAW`, or the dot's brightness and the card's V drift apart with nothing failing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { HG_PHASE_LAW } from '../../../../src/data/asteroids/hgPhaseLaw';

const WESL_NAME = {
  HG_A1: 'a1',
  HG_A2: 'a2',
  HG_B1: 'b1',
  HG_B2: 'b2',
  HG_COS_PHASE_MIN: 'cosPhaseMin',
  HG_HALF_TAN_FLOOR: 'halfTanFloor',
  HG_PHASE_SUM_FLOOR: 'phaseSumFloor',
} as const satisfies Record<string, keyof typeof HG_PHASE_LAW>;

describe('apparentMagnitude.wesl', () => {
  it('mirrors every HG_PHASE_LAW constant', () => {
    const path = join(
      process.cwd(),
      'src/services/gpu/shaders/asteroids/lib/apparentMagnitude.wesl',
    );
    const text = readFileSync(path, 'utf-8');
    const found = new Map(
      [...text.matchAll(/const\s+(HG_\w+)\s*:\s*f32\s*=\s*(-?[0-9.]+(?:e-?[0-9]+)?)\s*;/g)].map(
        (m) => [m[1]!, parseFloat(m[2]!)],
      ),
    );
    expect([...found.keys()].sort()).toEqual(Object.keys(WESL_NAME).sort());
    expect(Object.values(WESL_NAME).sort()).toEqual(Object.keys(HG_PHASE_LAW).sort());
    for (const [wesl, ts] of Object.entries(WESL_NAME)) {
      expect(found.get(wesl), wesl).toBe(HG_PHASE_LAW[ts]);
    }
  });
});
