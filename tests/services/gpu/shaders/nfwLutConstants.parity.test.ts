/**
 * Parity guard: the NFW image-finding LUT axis constants mirrored into
 * `lib/lensing.wesl` (LENS_LUT_Y_MAX / LENS_LUT_S_MAX / LENS_LUT_LOG_K) must
 * equal their authoritative TS sources. The shader samples the LUT with a
 * (y, s) → UV map whose s-axis is the algebraic inverse of the generator's
 * forward log map; if the WESL `LOG_K` (or either axis maximum) drifts from the
 * TS value the sampler reads the wrong row and silently mis-places every NFW
 * counter image — a bug no unit test of the shader can catch.
 *
 * `?static` WESL linking injects no values, so the shader-side constants are a
 * hand-written mirror and a test, not the compiler, keeps them in sync. Mirrors
 * the approach in `constants.parity.test.ts` (read the `.wesl` as text,
 * regex-extract each `const NAME: type = value;`, assert equality).
 *
 * Sources of truth:
 *   LENS_LUT_Y_MAX  ← src/data/nfwLensLut.ts        NFW_LUT_Y_MAX
 *   LENS_LUT_S_MAX  ← src/data/nfwLensLut.ts        NFW_LUT_S_MAX
 *   LENS_LUT_LOG_K  ← src/utils/lensing/buildNfwLensLut.ts  LOG_K
 *
 * Path is resolved from `process.cwd()` (the repo root under Vitest), matching
 * the convention in `constants.parity.test.ts` — `__dirname` would not work
 * under the Vite/Vitest ESM runner.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NFW_LUT_Y_MAX, NFW_LUT_S_MAX } from '../../../../src/data/nfwLensLut';
import { LOG_K } from '../../../../src/utils/lensing/buildNfwLensLut';

/**
 * Extract every `const NAME: f32 = <number>;` from lib/lensing.wesl. Parses
 * with `parseFloat` so `3.0` -> 3 and `4.0` -> 4 alike.
 */
function parseWeslConstants(): Map<string, number> {
  const path = join(process.cwd(), 'src/services/gpu/shaders/lib/lensing.wesl');
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
  it('each WESL LENS_LUT_* constant matches its authoritative TS value', () => {
    const wesl = parseWeslConstants();
    const cases: Array<[string, number]> = [
      ['LENS_LUT_Y_MAX', NFW_LUT_Y_MAX],
      ['LENS_LUT_S_MAX', NFW_LUT_S_MAX],
      ['LENS_LUT_LOG_K', LOG_K],
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
