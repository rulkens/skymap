import { describe, expect, it } from 'vitest';
import { structureCutoutFovDeg } from '../../../tools/capture/structureCutoutFovDeg';
import { structureCutoutUrl } from '../../../tools/capture/structureCutoutUrl';
import { raDecDistToEqCart } from '../../../src/utils/math/raDecDistToEqCart';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

describe('structureCutoutFovDeg', () => {
  it('is 1.3x the angular diameter in between the clamps', () => {
    // radius/distance = tan(1 deg) -> diameter 2 deg
    expect(structureCutoutFovDeg(Math.tan(Math.PI / 180), 1, 1.3)).toBeCloseTo(2.6, 6);
  });

  it('clamps a tiny cluster up and a huge nebula down', () => {
    expect(structureCutoutFovDeg(0.00001, 1, 1.3)).toBe(0.1);
    expect(structureCutoutFovDeg(1, 1, 1.3)).toBe(8);
  });
});

describe('structureCutoutUrl', () => {
  it('centres on the RA/Dec the structure was placed from, in degrees', () => {
    const worldPos = raDecDistToEqCart({ raHours: 17.76, decDeg: -28.94, distMpc: 0.0085 });
    const s = { worldPos, physicalRadiusMpc: 0.0001, category: 'nebula' } as StructureInfo;
    const q = new URL(structureCutoutUrl(s)).searchParams;
    expect(Number(q.get('ra'))).toBeCloseTo(17.76 * 15, 6);
    expect(Number(q.get('dec'))).toBeCloseTo(-28.94, 6);
    expect(q.get('hips')).toBe('CDS/P/DSS2/color');
    expect(q.get('width')).toBe('408');
  });

  it('wraps a negative-y position to RA in [0, 360)', () => {
    const worldPos = raDecDistToEqCart({ raHours: 23, decDeg: 10, distMpc: 1 });
    const q = new URL(
      structureCutoutUrl({
        worldPos,
        physicalRadiusMpc: 0.01,
        category: 'nebula',
      } as StructureInfo),
    ).searchParams;
    expect(Number(q.get('ra'))).toBeCloseTo(345, 6);
  });

  it('frames a globular cluster 10x wider than the default, and Trumpler 14 on 2MASS', () => {
    const worldPos = raDecDistToEqCart({ raHours: 16.69, decDeg: 36.46, distMpc: 0.0071 });
    const radius = 0.0071 * Math.tan(((0.05 / 2) * Math.PI) / 180);
    const globular = { worldPos, physicalRadiusMpc: radius, category: 'globular-cluster' };
    const q = new URL(
      structureCutoutUrl({ ...globular, id: 'globular-cluster-m13' } as StructureInfo),
    ).searchParams;
    expect(Number(q.get('fov'))).toBeCloseTo(0.5, 6);
    const t14 = new URL(
      structureCutoutUrl({ ...globular, id: 'open-cluster-trumpler-14' } as StructureInfo),
    ).searchParams;
    expect(t14.get('hips')).toBe('CDS/P/2MASS/color');
    expect(t14.get('fov')).toBe('0.15');
  });
});
