/**
 * Parity guard: a mask target's CLEAR (`OCCLUSION_MASK_NO_SURFACE_KM`, TS) and the pass's
 * own "nothing drew" value (`NO_SURFACE_KM`, WGSL) are one number. A drift is silent:
 * readers compare distances, so a cleared texel would just start hiding far labels.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { OCCLUSION_MASK_NO_SURFACE_KM } from '../../../../src/data/rendering/occlusionMaskClear';

it('occlusionMask/io.wesl NO_SURFACE_KM equals the mask targets’ clear distance', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/occlusionMask/io.wesl'),
    'utf-8',
  );
  const declared = /const\s+NO_SURFACE_KM\s*:\s*f32\s*=\s*([0-9.e+-]+)\s*;/.exec(source);
  expect(declared, 'NO_SURFACE_KM declaration not found').not.toBeNull();
  expect(Number(declared![1])).toBe(OCCLUSION_MASK_NO_SURFACE_KM);
});
