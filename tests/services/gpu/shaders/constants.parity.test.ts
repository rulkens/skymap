/**
 * Parity guard: the flow-field constants mirrored into
 * `flow/constants.wesl` must equal the authoritative TS exports in
 * `flowFieldConstants.ts`. Because `?static` WESL linking does pure build-time
 * linking with NO value injection, the shader-side subset is a hand-written
 * mirror — so a test, not the compiler, is what keeps it from drifting. Mirrors
 * the runtime's `tests/data/selectionEncoding.test.ts` pattern (read the `.wesl`
 * as text, regex-extract each `const NAME: type = value;`, assert equality).
 *
 * Path is resolved from `process.cwd()` (the repo root under Vitest), matching
 * the convention used by `selectionEncoding.test.ts` — `__dirname` would not
 * work under the Vite/Vitest ESM runner.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  TRAIL,
  LIFE,
  FADE,
  DENS_SCALE,
  SPEED_COLOR_MAX,
} from '../../../../src/data/flow/flowFieldConstants';
import { SF_MAP_WORKGROUP_SIZE } from '../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';

/**
 * Extract every `const NAME: (u32|f32) = <number>;` from flow/constants.wesl.
 * Handles the `u`/`f` literal suffixes and float syntax (`8.0`, `1200.0`),
 * parsing with `parseFloat` so `32u` -> 32 and `1.4` -> 1.4 alike.
 */
function parseWeslConstants(): Map<string, number> {
  const path = join(process.cwd(), 'src/services/gpu/shaders/flow/constants.wesl');
  const text = readFileSync(path, 'utf-8');
  const re = /const\s+(\w+)\s*:\s*(?:u32|f32)\s*=\s*([0-9]+(?:\.[0-9]+)?)[uf]?\s*;/g;
  const map = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    map.set(m[1]!, parseFloat(m[2]!));
  }
  return map;
}

describe('flow/constants.wesl ↔ flowFieldConstants.ts parity', () => {
  it('each WESL constant matches the TS export of the same name', () => {
    const wesl = parseWeslConstants();
    const cases: Array<[string, number]> = [
      ['TRAIL', TRAIL],
      ['LIFE', LIFE],
      ['FADE', FADE],
      ['DENS_SCALE', DENS_SCALE],
      ['SPEED_COLOR_MAX', SPEED_COLOR_MAX],
    ];
    for (const [name, tsValue] of cases) {
      const weslValue = wesl.get(name);
      expect(weslValue, `WESL constant ${name} is missing from flow/constants.wesl`).toBeDefined();
      expect(weslValue, `WESL ${name} (${weslValue}) does not match TS ${name} (${tsValue})`).toBe(
        tsValue,
      );
    }
  });

  it('every WESL constant has a corresponding TS export (no orphans)', () => {
    const wesl = parseWeslConstants();
    const known = new Set(['TRAIL', 'LIFE', 'FADE', 'DENS_SCALE', 'SPEED_COLOR_MAX']);
    for (const name of wesl.keys()) {
      expect(known.has(name), `flow/constants.wesl declares ${name} with no asserted TS twin`).toBe(
        true,
      );
    }
  });
});

/**
 * sfMap's grid dims (AZ/RINGS) size the texture and every pass reads them
 * back via `textureDimensions` — no WGSL mirror, so no parity test for them.
 * `@workgroup_size(16, 16)` is different: WGSL requires it as a compile-time
 * literal, so it genuinely stays duplicated across every sfMap compute entry
 * point rather than a single named const. This guards THAT duplication
 * against `SF_MAP_WORKGROUP_SIZE` (`galaxySfMapArmForcing.ts`, which
 * `createGalaxyEngine.ts` also uses for dispatch-count math).
 */
describe('sfMap @workgroup_size(N, N) ↔ SF_MAP_WORKGROUP_SIZE parity', () => {
  const files = [
    'src/services/gpu/shaders/milkyWay/sfMap/sfMapStep.wesl',
    'src/services/gpu/shaders/milkyWay/sfMap/sfMapPack.wesl',
    'src/services/gpu/shaders/milkyWay/sfMap/sfMapOrientationField.wesl',
    'src/services/gpu/shaders/milkyWay/sfMap/sfMapOrientationTensor.wesl',
    'src/services/gpu/shaders/milkyWay/sfMap/sfMapOrientationTensorBlur.wesl',
    'src/services/gpu/shaders/milkyWay/sfMap/sfMapOrientationCoherence.wesl',
  ];

  it('every sfMap compute entry point declares a square workgroup matching SF_MAP_WORKGROUP_SIZE', () => {
    const re = /@workgroup_size\((\d+),\s*(\d+)\)/g;
    let matchCount = 0;
    for (const file of files) {
      const text = readFileSync(join(process.cwd(), file), 'utf-8');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        matchCount += 1;
        expect(m[1], `${file}: workgroup_size(${m[1]}, ${m[2]}) is not square`).toBe(m[2]);
        expect(
          parseInt(m[1]!, 10),
          `${file}: workgroup_size ${m[1]} does not match SF_MAP_WORKGROUP_SIZE (${SF_MAP_WORKGROUP_SIZE})`,
        ).toBe(SF_MAP_WORKGROUP_SIZE);
      }
    }
    expect(matchCount, 'no @workgroup_size(N, N) found in the sfMap shader chain').toBeGreaterThan(
      0,
    );
  });
});
