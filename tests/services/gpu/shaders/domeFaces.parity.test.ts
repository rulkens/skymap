/**
 * Parity guard: DOME_FACES in domeResample/io.wesl must equal the TS table
 * `DOME_FACES` (`src/data/rendering/domeFaces.ts`) flattened column-major.
 * `?static` WESL linking is pure text linking with no value injection, so a
 * hand-mirrored drift here is invisible to the compiler — every fisheye
 * fragment would sample the wrong face silently.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DOME_FACES, DOME_FACE_COUNT } from '../../../../src/data/rendering/domeFaces';

function weslSource(): string {
  const path = join(process.cwd(), 'src/services/gpu/shaders/domeResample/io.wesl');
  return readFileSync(path, 'utf-8');
}

describe('domeResample/io.wesl DOME_FACES ↔ domeFaces.ts DOME_FACES', () => {
  it('the declared array length equals DOME_FACE_COUNT', () => {
    const m = /array<mat3x3<f32>,\s*(\d+)>/.exec(weslSource());
    expect(m, 'DOME_FACES array length declaration not found').not.toBeNull();
    expect(Number(m![1])).toBe(DOME_FACE_COUNT);
  });

  it('the 45 literals equal DOME_FACES flattened column-major, in order', () => {
    const matrices = [...weslSource().matchAll(/mat3x3<f32>\(([^)]*)\)/g)];
    const weslNumbers = matrices.flatMap((m) =>
      m[1]!
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map(Number),
    );
    const tsNumbers = DOME_FACES.flatMap((face) => face);
    expect(weslNumbers).toEqual(tsNumbers);
  });
});
