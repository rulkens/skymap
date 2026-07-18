/**
 * minPickRadiusMpc — the pick-only sphere-radius floor.
 *
 * Two behaviours that can break on a real bug:
 *   - a sub-pixel body inflates to the min-px footprint (the whole point of the
 *     floor: a distant tiny sphere becomes clickable);
 *   - a large body passes through untouched (the floor must not shrink a body
 *     that already exceeds the minimum).
 *
 * Plus a TS↔WESL parity guard: `BODY_PICK_MIN_RADIUS_PX` must equal the
 * `FAMOUS_STAR_PICK_RADIUS_PX` the point-partition pick billboard uses in
 * `starPointPick.wesl`, so the sphere floor and the point footprint stay one
 * value (same read-the-wesl-as-text pattern as `constants.parity.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  minPickRadiusMpc,
  BODY_PICK_MIN_RADIUS_PX,
} from '../../../../src/services/engine/helpers/minPickRadiusMpc';

describe('minPickRadiusMpc', () => {
  it('inflates a sub-pixel body to the min-px footprint radius', () => {
    // A tiny body (1e-9 Mpc radius) 2 Mpc away, 500 px/rad: its true projected
    // radius is (1e-9/2)·500 = 2.5e-7 px — far under the 9 px floor. The floor
    // radius (9/500)·2 = 0.036 Mpc dominates, so the pick sphere inflates to it.
    const camDistMpc = 2;
    const pxPerRad = 500;
    const floor = (BODY_PICK_MIN_RADIUS_PX / pxPerRad) * camDistMpc;
    expect(minPickRadiusMpc(1e-9, camDistMpc, pxPerRad)).toBe(floor);
  });

  it('passes a large body through untouched (floor never shrinks it)', () => {
    // A 1 Mpc-radius body 2 Mpc away: its floor radius is only 0.036 Mpc, so the
    // true radius wins and the pick sphere matches the visual sphere exactly.
    expect(minPickRadiusMpc(1, 2, 500)).toBe(1);
  });
});

describe('minPickRadiusMpc ↔ starPointPick.wesl footprint parity', () => {
  it('BODY_PICK_MIN_RADIUS_PX equals the WESL FAMOUS_STAR_PICK_RADIUS_PX', () => {
    const path = join(
      process.cwd(),
      'src/services/gpu/shaders/bodies/starPointPick.wesl',
    );
    const text = readFileSync(path, 'utf-8');
    const m = /const\s+FAMOUS_STAR_PICK_RADIUS_PX\s*:\s*f32\s*=\s*([0-9]+(?:\.[0-9]+)?)/.exec(text);
    expect(m, 'FAMOUS_STAR_PICK_RADIUS_PX not found in starPointPick.wesl').not.toBeNull();
    expect(parseFloat(m![1]!)).toBe(BODY_PICK_MIN_RADIUS_PX);
  });
});
