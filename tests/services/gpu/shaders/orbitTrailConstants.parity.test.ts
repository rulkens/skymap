/**
 * Parity guard: SEGMENTS in `orbitTrail/constants.wesl` must equal the
 * authoritative TS export RIBBON_SEGMENTS in
 * `src/data/bodies/orbitTrailConstants.ts`. `?static` WESL linking is pure
 * build-time text linking with NO value injection, so a mismatch is invisible
 * to the compiler — it silently produces a partly-drawn or garbage-cornered
 * ribbon on hardware, because the CPU-side draw call issues
 * `RIBBON_SEGMENTS * 6` vertices while the shader loops to a different
 * SEGMENTS. Mirrors `tests/services/gpu/shaders/constants.parity.test.ts`
 * (same regex, same `process.cwd()` path resolution).
 *
 * STROKE_PX and MARGIN_PX also live in constants.wesl but have no TS
 * consumer, so they are intentionally left out of the "no orphans" check
 * below — they are known shader-only constants, not missed twins.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RIBBON_SEGMENTS } from '../../../../src/data/bodies/orbitTrailConstants';

/**
 * Extract every `const NAME: (u32|f32) = <number>;` from
 * orbitTrail/constants.wesl. Handles the `u`/`f` literal suffixes and float
 * syntax, parsing with `parseFloat` so `96u` -> 96 and `2.5` -> 2.5 alike.
 */
function parseWeslConstants(): Map<string, number> {
  const path = join(
    process.cwd(),
    'src/services/gpu/shaders/bodies/orbitTrail/constants.wesl',
  );
  const text = readFileSync(path, 'utf-8');
  const re = /const\s+(\w+)\s*:\s*(?:u32|f32)\s*=\s*([0-9]+(?:\.[0-9]+)?)[uf]?\s*;/g;
  const map = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    map.set(m[1]!, parseFloat(m[2]!));
  }
  return map;
}

describe('orbitTrail/constants.wesl ↔ orbitTrailConstants.ts parity', () => {
  it('SEGMENTS in orbitTrail/constants.wesl equals RIBBON_SEGMENTS', () => {
    const wesl = parseWeslConstants();
    const weslValue = wesl.get('SEGMENTS');
    expect(weslValue, 'WESL constant SEGMENTS is missing from orbitTrail/constants.wesl').toBeDefined();
    expect(
      weslValue,
      `WESL SEGMENTS (${weslValue}) does not match TS RIBBON_SEGMENTS (${RIBBON_SEGMENTS})`,
    ).toBe(RIBBON_SEGMENTS);
  });
});
