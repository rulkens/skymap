/**
 * Parity guard: the three `starCullSlack.ts` constants are TS mirrors of WESL
 * values `?static` linking injects nowhere else, so a test is what keeps them
 * in step — the same discipline `famousStarPickRadius.parity.test.ts` keeps.
 *
 * The drift this catches is silent: the CPU cull's angular slack would again
 * under-cover the shader's drawn footprint, winking a visible star out at the
 * screen edge — the exact bug this file's addition fixed.
 *
 * Paths resolved from `process.cwd()` (the repo root under Vitest), matching
 * the convention the other WESL parity suites use.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  STAR_SIZE_REF_PX,
  STAR_GLOW_MIN_PX,
  STAR_PICK_MIN_RADIUS_PX,
} from '../../../../src/data/starCullSlack';

describe('starPhotometry.wesl / starCatalog/vertex.wesl ↔ starCullSlack.ts parity', () => {
  const photometryText = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/lib/starPhotometry.wesl'),
    'utf-8',
  );
  const vertexText = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/starCatalog/vertex.wesl'),
    'utf-8',
  );

  it('STAR_SIZE_REF_PX matches the shader sizePx divisor', () => {
    const match = /const\s+STAR_SIZE_REF_PX\s*:\s*f32\s*=\s*([0-9]+(?:\.[0-9]+)?)/.exec(
      photometryText,
    );
    expect(match, 'STAR_SIZE_REF_PX not found in starPhotometry.wesl').not.toBeNull();
    expect(parseFloat(match![1]!)).toBe(STAR_SIZE_REF_PX);
  });

  it('STAR_GLOW_MIN_PX matches the shader legibility floor', () => {
    const match = /const\s+STAR_GLOW_MIN_PX\s*:\s*f32\s*=\s*([0-9]+(?:\.[0-9]+)?)/.exec(
      photometryText,
    );
    expect(match, 'STAR_GLOW_MIN_PX not found in starPhotometry.wesl').not.toBeNull();
    expect(parseFloat(match![1]!)).toBe(STAR_GLOW_MIN_PX);
  });

  it('STAR_PICK_MIN_RADIUS_PX matches the shader clickable floor', () => {
    const match = /const\s+STAR_PICK_MIN_RADIUS_PX\s*:\s*f32\s*=\s*([0-9]+(?:\.[0-9]+)?)/.exec(
      vertexText,
    );
    expect(match, 'STAR_PICK_MIN_RADIUS_PX not found in starCatalog/vertex.wesl').not.toBeNull();
    expect(parseFloat(match![1]!)).toBe(STAR_PICK_MIN_RADIUS_PX);
  });
});
