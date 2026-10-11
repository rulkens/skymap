import { describe, expect, it } from 'vitest';
import { structureCutoutFovDeg } from '../../../tools/capture/structureCutoutFovDeg';
import { structureCutoutUrl } from '../../../tools/capture/structureCutoutUrl';
import { raDecDistToEqCart } from '../../../src/utils/math/raDecDistToEqCart';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

describe('structureCutoutFovDeg', () => {
  it('is 1.3x the angular diameter in between the clamps', () => {
    // radius/distance = tan(1 deg) -> diameter 2 deg
    expect(structureCutoutFovDeg(Math.tan(Math.PI / 180), 1)).toBeCloseTo(2.6, 6);
  });

  it('clamps a tiny cluster up and a huge nebula down', () => {
    expect(structureCutoutFovDeg(0.00001, 1)).toBe(0.1);
    expect(structureCutoutFovDeg(1, 1)).toBe(8);
  });
});

describe('structureCutoutUrl', () => {
  it('centres on the RA/Dec the structure was placed from, in degrees', () => {
    const worldPos = raDecDistToEqCart({ raHours: 17.76, decDeg: -28.94, distMpc: 0.0085 });
    const s = { worldPos, physicalRadiusMpc: 0.0001 } as StructureInfo;
    const q = new URL(structureCutoutUrl(s)).searchParams;
    expect(Number(q.get('ra'))).toBeCloseTo(17.76 * 15, 6);
    expect(Number(q.get('dec'))).toBeCloseTo(-28.94, 6);
    expect(q.get('hips')).toBe('CDS/P/DSS2/color');
    expect(q.get('width')).toBe('408');
  });

  it('wraps a negative-y position to RA in [0, 360)', () => {
    const worldPos = raDecDistToEqCart({ raHours: 23, decDeg: 10, distMpc: 1 });
    const q = new URL(structureCutoutUrl({ worldPos, physicalRadiusMpc: 0.01 } as StructureInfo))
      .searchParams;
    expect(Number(q.get('ra'))).toBeCloseTo(345, 6);
  });
});
