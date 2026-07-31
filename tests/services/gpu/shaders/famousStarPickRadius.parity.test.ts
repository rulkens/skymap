/**
 * Parity guard: `FAMOUS_STAR_PICK_RADIUS_PX` is authored in
 * `bodies/starPointPick.wesl` (which actually rasterises the footprint) and
 * mirrored in TS for `starPointsLayer`'s satellite-suppression rule. `?static`
 * WESL linking injects no values, so a test is what keeps the two in step —
 * the same discipline `constants.parity.test.ts` keeps for the flow field.
 *
 * The drift this catches is silent both ways: widen the shader's footprint and
 * S-stars keep taking clicks inside the anchor's enlarged target; widen the TS
 * mirror and stars get suppressed in a ring where they are still separately
 * aimable. Neither shows up as an error, only as picking that feels wrong.
 *
 * Path resolved from `process.cwd()` (the repo root under Vitest), matching the
 * convention the other WESL parity suites use.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FAMOUS_STAR_PICK_RADIUS_PX } from '../../../../src/data/famousStarPickRadiusPx';

describe('starPointPick.wesl ↔ famousStarPickRadiusPx.ts parity', () => {
  it('the shader footprint matches the TS mirror the pick layer measures against', () => {
    const path = join(process.cwd(), 'src/services/gpu/shaders/bodies/starPointPick.wesl');
    const text = readFileSync(path, 'utf-8');
    const match = /const\s+FAMOUS_STAR_PICK_RADIUS_PX\s*:\s*f32\s*=\s*([0-9]+(?:\.[0-9]+)?)/.exec(
      text,
    );
    expect(match, 'FAMOUS_STAR_PICK_RADIUS_PX not found in starPointPick.wesl').not.toBeNull();
    expect(parseFloat(match![1]!)).toBe(FAMOUS_STAR_PICK_RADIUS_PX);
  });
});
