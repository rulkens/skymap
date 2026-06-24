/**
 * Parity guard: NFW-lensing constants mirrored between TS and WESL must stay
 * in sync. Covers two sets of mirrors:
 *
 * 1. NFW image-finding LUT axis constants in `lib/lensing.wesl`
 *    (LENS_LUT_Y_MAX / LENS_LUT_S_MAX / LENS_LUT_LOG_K): the shader samples
 *    the LUT with a (y, s) -> UV map whose s-axis is the algebraic inverse of
 *    the generator's forward log map; if the WESL LOG_K (or either axis
 *    maximum) drifts from the TS value the sampler reads the wrong row and
 *    silently mis-places every NFW counter image.
 *
 * 2. Cross-language shape/magnification constants:
 *    - NFW_SHAPE_PEAK (lib/lensing.wesl): peak-normalises the NFW enclosed-mass
 *      profile so both SIS and NFW modes use the same strength knob scale.
 *      Drift silently mis-scales every NFW ring radius.
 *    - LENS_MU_MAX (points/vertex.wesl): caps per-image magnification; the LUT
 *      already clamps to MU_MAX at build time, so the runtime cap must agree.
 *
 * '?static' WESL linking injects no values, so the shader-side constants are
 * hand-written mirrors and a test, not the compiler, keeps them in sync.
 * Mirrors the approach in 'constants.parity.test.ts' (read the '.wesl' as
 * text, regex-extract each 'const NAME: type = value;', assert equality).
 *
 * Sources of truth:
 *   LENS_LUT_Y_MAX  <- src/data/nfwLensLut.ts                  NFW_LUT_Y_MAX
 *   LENS_LUT_S_MAX  <- src/data/nfwLensLut.ts                  NFW_LUT_S_MAX
 *   LENS_LUT_LOG_K  <- src/utils/lensing/buildNfwLensLut.ts    LOG_K
 *   NFW_SHAPE_PEAK  <- src/utils/lensing/buildNfwLensLut.ts    NFW_SHAPE_PEAK
 *   LENS_MU_MAX     <- src/utils/lensing/buildNfwLensLut.ts    MU_MAX
 *
 * Path is resolved from 'process.cwd()' (the repo root under Vitest), matching
 * the convention in 'constants.parity.test.ts' — '__dirname' would not work
 * under the Vite/Vitest ESM runner.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NFW_LUT_Y_MAX, NFW_LUT_S_MAX } from '../../../../src/data/nfwLensLut';
import { LOG_K, NFW_SHAPE_PEAK, MU_MAX } from '../../../../src/utils/lensing/buildNfwLensLut';

/**
 * Extract every 'const NAME: f32 = <number>;' (or u32) from a WESL file.
 * Parses with parseFloat so '3.0' -> 3 and '4.0' -> 4 alike.
 */
function parseWeslConstants(relPath: string): Map<string, number> {
  const path = join(process.cwd(), relPath);
  const text = readFileSync(path, 'utf-8');
  const re = /const\s+(\w+)\s*:\s*(?:u32|f32)\s*=\s*([0-9]+(?:\.[0-9]+)?)[uf]?\s*;/g;
  const map = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    map.set(m[1]!, parseFloat(m[2]!));
  }
  return map;
}

describe('lib/lensing.wesl NFW-LUT constants ↔ TS source-of-truth parity', () => {
  it('each WESL LENS_LUT_* constant and NFW_SHAPE_PEAK matches its authoritative TS value', () => {
    const wesl = parseWeslConstants('src/services/gpu/shaders/lib/lensing.wesl');
    const cases: Array<[string, number]> = [
      ['LENS_LUT_Y_MAX', NFW_LUT_Y_MAX],
      ['LENS_LUT_S_MAX', NFW_LUT_S_MAX],
      ['LENS_LUT_LOG_K', LOG_K],
      ['NFW_SHAPE_PEAK', NFW_SHAPE_PEAK],
    ];
    for (const [name, tsValue] of cases) {
      const weslValue = wesl.get(name);
      expect(weslValue, `WESL constant ${name} is missing from lib/lensing.wesl`).toBeDefined();
      expect(
        weslValue,
        `WESL ${name} (${weslValue}) does not match TS source-of-truth (${tsValue})`,
      ).toBe(tsValue);
    }
  });
});

describe('points/vertex.wesl magnification cap ↔ TS source-of-truth parity', () => {
  it('LENS_MU_MAX in vertex.wesl matches MU_MAX from buildNfwLensLut', () => {
    const wesl = parseWeslConstants('src/services/gpu/shaders/points/vertex.wesl');
    const weslValue = wesl.get('LENS_MU_MAX');
    expect(
      weslValue,
      'WESL constant LENS_MU_MAX is missing from points/vertex.wesl',
    ).toBeDefined();
    expect(
      weslValue,
      `WESL LENS_MU_MAX (${weslValue}) does not match TS MU_MAX (${MU_MAX})`,
    ).toBe(MU_MAX);
  });
});
