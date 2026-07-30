/**
 * Parity + ordering guard for the bloom-seeding constants.
 *
 * The resolved Sun blooms only while three values stay ordered:
 * `DEFAULT_BLOOM_THRESHOLD < STAR_KNEE <= STAR_EMISSIVE`. Two of those live in
 * shaders (`KNEE` in `lib/starKnee.wesl`, `EMISSIVE` in
 * `bodies/star/fragment.wesl`) as hand-written mirrors of the authoritative TS
 * home `starRenderConstants.ts` — `?static` WESL linking does pure build-time
 * linking with NO value injection, so a test, not the compiler, keeps the two
 * sides in step. This asserts BOTH the WESL↔TS parity and the ordering, so a
 * retune of one number (e.g. dropping KNEE to 4 via HMR) that forgets the
 * threshold fails here instead of silently killing the Sun's glow.
 *
 * Path is resolved from `process.cwd()` (the repo root under Vitest), matching
 * `constants.parity.test.ts`. Unlike `flow/constants.wesl` these two `.wesl`
 * files are not dedicated constant-mirror files, so we assert only the two named
 * constants rather than sweeping for orphans.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { STAR_KNEE, STAR_EMISSIVE } from '../../../../src/data/starRenderConstants';
import { DEFAULT_BLOOM_THRESHOLD } from '../../../../src/data/defaults';

/**
 * Extract a single named `const NAME: f32 = <number>;` from a `.wesl` file.
 * Same regex family as `constants.parity.test.ts` — handles the `u`/`f` literal
 * suffixes and float syntax, parsing with `parseFloat`.
 */
function readWeslConst(relPath: string, name: string): number | undefined {
  const text = readFileSync(join(process.cwd(), relPath), 'utf-8');
  const re = /const\s+(\w+)\s*:\s*f32\s*=\s*([0-9]+(?:\.[0-9]+)?)[uf]?\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] === name) return parseFloat(m[2]!);
  }
  return undefined;
}

describe('bloom-seeding constants parity + ordering', () => {
  it('WESL KNEE / EMISSIVE mirror their TS home', () => {
    const knee = readWeslConst('src/services/gpu/shaders/lib/starKnee.wesl', 'KNEE');
    const emissive = readWeslConst(
      'src/services/gpu/shaders/bodies/star/fragment.wesl',
      'EMISSIVE',
    );

    expect(knee, 'KNEE is missing from lib/starKnee.wesl').toBeDefined();
    expect(emissive, 'EMISSIVE is missing from bodies/star/fragment.wesl').toBeDefined();
    expect(knee, `WESL KNEE (${knee}) does not match STAR_KNEE (${STAR_KNEE})`).toBe(STAR_KNEE);
    expect(
      emissive,
      `WESL EMISSIVE (${emissive}) does not match STAR_EMISSIVE (${STAR_EMISSIVE})`,
    ).toBe(STAR_EMISSIVE);
  });

  it('holds the DEFAULT_BLOOM_THRESHOLD < STAR_KNEE <= STAR_EMISSIVE ordering', () => {
    expect(
      DEFAULT_BLOOM_THRESHOLD,
      'bloom threshold must sit below the star knee so survey-star cores still clear it',
    ).toBeLessThan(STAR_KNEE);
    expect(
      STAR_KNEE,
      'star knee must sit at or below the emissive so the Sun disc seeds the glow',
    ).toBeLessThanOrEqual(STAR_EMISSIVE);
  });
});
