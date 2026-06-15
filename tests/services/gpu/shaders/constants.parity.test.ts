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
