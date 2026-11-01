/**
 * glintBandClass — the glint pick-priority class mapping, plus the TS↔WESL parity guard.
 *
 * The class integers (0 earth, 1 planet, 2 moon) cross the language boundary: `glintBandClass.ts`
 * writes them raw into the glint instance's `bandClass` attribute and `starPointPick.wesl::vsGlint`
 * compares it against `lib/pickDepthBands`'s `GLINT_CLASS_*`. A one-sided renumber silently mis-maps
 * a body to the wrong priority band, so a parity test (reading the wesl as text, like
 * `selectionEncoding.test.ts`) keeps them in step.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { glintBandClass } from '../../../../src/layers/body/present/glintBandClass';
import {
  GLINT_CLASS_EARTH,
  GLINT_CLASS_PLANET,
  GLINT_CLASS_MOON,
} from '../../../../src/layers/body/present/glintPickClasses';

describe('glintBandClass — id → priority class', () => {
  it('maps the focus body, a heliocentric planet, and a moon to distinct classes', () => {
    // Earth is special-cased though heliocentric; jupiter is a planet (focusId 'sun'), io a Jovian
    // moon (focusId 'jupiter').
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
