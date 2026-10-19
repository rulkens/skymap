/**
 * Parity guard for `lib/boost.wesl`: its blackbody anchor table and constants are a hand mirror of
 * the TS exports (no value injection across `?static`), and the anchors' BP−RP positions must be
 * the star tint ramp's own breakpoints (`starCatalog/tint.wesl`), or a boosted star would shift
 * along a ramp it is not drawn with.
 */
import { describe, expect, it } from 'vitest';
import { STAR_TINT_BLACKBODY_ANCHORS } from '../../../../src/data/voyage/starTintBlackbodyAnchors';
import { HEADLIGHT_CEIL } from '../../../../src/data/voyage/headlightCeil';
import { GALAXY_HUE_SLOPE } from '../../../../src/data/voyage/galaxyHueSlope';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';

const BOOST = readShaderSource('src/services/gpu/shaders/lib/boost.wesl');
const TINT = readShaderSource('src/services/gpu/shaders/starCatalog/tint.wesl');

function weslConst(name: string): number {
  const m = new RegExp(`const\\s+${name}\\s*:\\s*f32\\s*=\\s*(-?[0-9.]+)\\s*;`).exec(BOOST);
  expect(m, `const ${name} missing from lib/boost.wesl`).not.toBeNull();
  return parseFloat(m![1]!);
}

const CLASSES = ['OB', 'AF', 'G', 'K', 'M'] as const;

describe('lib/boost.wesl ↔ TS parity', () => {
  it('the blackbody anchor table matches STAR_TINT_BLACKBODY_ANCHORS', () => {
    CLASSES.forEach((cls, i) => {
      expect(weslConst(`ANCHOR_BPRP_${cls}`)).toBe(STAR_TINT_BLACKBODY_ANCHORS[i]!.bpRp);
      expect(weslConst(`ANCHOR_TEMP_${cls}_K`)).toBe(STAR_TINT_BLACKBODY_ANCHORS[i]!.temperatureK);
    });
  });

  it('the anchors sit on the star tint ramp breakpoints', () => {
    const lows = [...TINT.matchAll(/\(bpRp - \(?\s*(-?[0-9.]+)\s*\)?\s*\)/g)].map((m) =>
      parseFloat(m[1]!),
    );
    const last = /\/\s*\(\s*([0-9.]+)\s*-\s*1\.25\s*\)\)\);/.exec(TINT);
    expect(last).not.toBeNull();
    expect([...lows, parseFloat(last![1]!)]).toEqual(
      STAR_TINT_BLACKBODY_ANCHORS.map((a) => a.bpRp),
    );
  });

  it('HEADLIGHT_CEIL and GALAXY_HUE_SLOPE match their TS exports', () => {
    expect(weslConst('HEADLIGHT_CEIL')).toBe(HEADLIGHT_CEIL);
    expect(weslConst('GALAXY_HUE_SLOPE')).toBe(GALAXY_HUE_SLOPE);
  });
});
