/**
 * glintBandClass — the glint pick-priority class mapping, plus the TS↔WESL parity
 * guard on the three class integers.
 *
 * The class integers (0 earth, 1 planet, 2 moon) cross the language boundary:
 * `glintBandClass.ts` returns them on the CPU and writes them raw into the glint
 * instance's `bandClass` attribute; `starPointPick.wesl::vsGlint` reads that
 * attribute and compares it against `lib/pickDepthBands`'s `GLINT_CLASS_*` to pick
 * the pick-depth band. A renumber on one side without the other silently mis-maps
 * a body to the wrong priority band with NO compile error — so a parity test, not
 * the compiler, keeps them in step (same read-the-wesl-as-text pattern as
 * `selectionEncoding.test.ts` / `minPickRadiusMpc.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  glintBandClass,
  GLINT_CLASS_EARTH,
  GLINT_CLASS_PLANET,
  GLINT_CLASS_MOON,
} from '../../../../../src/services/engine/frame/passes/glintBandClass';

describe('glintBandClass — id → priority class', () => {
  it('maps the focus body, a heliocentric planet, and a moon to distinct classes', () => {
    // Earth is special-cased (class earth) even though it is heliocentric like a
    // planet; jupiter is a heliocentric planet (focusId 'sun' → planet); io is a
    // Jovian moon (focusId 'jupiter' → moon). A swap of the planet/moon ternary
    // arms flips two of these.
    expect(glintBandClass('earth')).toBe(GLINT_CLASS_EARTH);
    expect(glintBandClass('jupiter')).toBe(GLINT_CLASS_PLANET);
    expect(glintBandClass('io')).toBe(GLINT_CLASS_MOON);
  });
});

describe('glintBandClass ↔ lib/pickDepthBands.wesl GLINT_CLASS_* parity', () => {
  function parseWeslU32Constants(): Map<string, number> {
    const path = join(process.cwd(), 'src/services/gpu/shaders/lib/pickDepthBands.wesl');
    const text = readFileSync(path, 'utf-8');
    const re = /const\s+(\w+)\s*:\s*u32\s*=\s*(\d+)u?\s*;/g;
    const map = new Map<string, number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      map.set(m[1]!, parseInt(m[2]!, 10));
    }
    return map;
  }

  it('each TS class integer matches the WESL constant of the same name', () => {
    const wesl = parseWeslU32Constants();
    const cases: Array<[string, number]> = [
      ['GLINT_CLASS_EARTH', GLINT_CLASS_EARTH],
      ['GLINT_CLASS_PLANET', GLINT_CLASS_PLANET],
      ['GLINT_CLASS_MOON', GLINT_CLASS_MOON],
    ];
    for (const [name, tsValue] of cases) {
      const weslValue = wesl.get(name);
      expect(weslValue, `WESL constant ${name} is missing from pickDepthBands.wesl`).toBeDefined();
      expect(weslValue, `WESL ${name} (${weslValue}) does not match TS ${name} (${tsValue})`).toBe(
        tsValue,
      );
    }
  });
});
