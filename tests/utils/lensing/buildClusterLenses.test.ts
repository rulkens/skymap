import { describe, it, expect } from 'vitest';
import { buildClusterLenses } from '../../../src/utils/lensing/buildClusterLenses';
import { clusterLensDeflection } from '../../../src/utils/lensing/clusterLensDeflection';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

// Camera at the origin looking down +Z. "In front" means worldPos.z > 0.
const CAM = [0, 0, 0] as const;
const TARGET = [0, 0, 1] as const;

function cluster(
  id: string,
  worldPos: [number, number, number],
  physicalRadiusMpc: number,
  significance?: number,
): StructureInfo {
  return {
    type: 'structure',
    category: 'cluster',
    id,
    name: id,
    worldPos,
    featured: false,
    physicalRadiusMpc,
    significance,
  } as StructureInfo;
}

function supercluster(id: string, worldPos: [number, number, number]): StructureInfo {
  return {
    type: 'structure',
    category: 'supercluster',
    id,
    name: id,
    worldPos,
    featured: false,
    physicalRadiusMpc: 1,
    significance: 1,
  } as StructureInfo;
}

describe('buildClusterLenses', () => {
  it('returns no lenses when the strength is zero', () => {
    const out = buildClusterLenses([cluster('a', [0, 0, 10], 1.4, 1)], CAM, TARGET, 0, 16);
    expect(out).toEqual([]);
  });

  it('returns no lenses when maxLenses is zero', () => {
    const out = buildClusterLenses([cluster('a', [0, 0, 10], 1.4, 1)], CAM, TARGET, 1, 0);
    expect(out).toEqual([]);
  });

  it('drops clusters behind the camera', () => {
    const out = buildClusterLenses([cluster('behind', [0, 0, -10], 1.4, 1)], CAM, TARGET, 1, 16);
    expect(out).toEqual([]);
  });

  it('only lenses clusters, not superclusters', () => {
    const out = buildClusterLenses([supercluster('sc', [0, 0, 10])], CAM, TARGET, 1, 16);
    expect(out).toEqual([]);
  });

  it('drops clusters with non-positive physical radius', () => {
    const out = buildClusterLenses([cluster('flat', [0, 0, 10], 0, 1)], CAM, TARGET, 1, 16);
    expect(out).toEqual([]);
  });

  it('derives thetaERad = strength × physical α∞ and per-lens r_s from R500', () => {
    const r500 = 1.4;
    const strength = 1;
    const out = buildClusterLenses([cluster('a', [0, 0, 10], r500, 0.5)], CAM, TARGET, strength, 16);
    const { alphaInfRad, rsMpc } = clusterLensDeflection(r500);
    expect(out).toHaveLength(1);
    // Camera at the origin, cluster on +Z at distance 10 ⇒ unit dir ≈ [0,0,1], dL ≈ 10.
    expect(out[0]!.dirLens[0]).toBeCloseTo(0, 12);
    expect(out[0]!.dirLens[1]).toBeCloseTo(0, 12);
    expect(out[0]!.dirLens[2]).toBeCloseTo(1, 12);
    expect(out[0]!.dL).toBeCloseTo(10, 12);
    expect(out[0]!.thetaERad).toBeCloseTo(strength * alphaInfRad, 12);
    expect(out[0]!.rsMpc).toBeCloseTo(rsMpc, 12);
  });

  it('scales thetaERad linearly with strength', () => {
    const r500 = 1.4;
    const a = buildClusterLenses([cluster('a', [0, 0, 10], r500, 1)], CAM, TARGET, 1, 16);
    const b = buildClusterLenses([cluster('a', [0, 0, 10], r500, 1)], CAM, TARGET, 10, 16);
    expect(b[0]!.thetaERad).toBeCloseTo(10 * a[0]!.thetaERad, 12);
  });

  it('sorts and caps by physical α∞ (R500) descending, ignoring significance', () => {
    // significance is deliberately INVERTED vs R500 to prove it no longer
    // drives the ordering — the biggest R500 must win the cap.
    const structures = [
      cluster('small', [0, 0, 10], 0.8, 0.9),
      cluster('big', [0, 0, 20], 2.0, 0.1),
      cluster('mid', [0, 0, 30], 1.4, 0.5),
    ];
    const out = buildClusterLenses(structures, CAM, TARGET, 1, 2);
    // Ordered by R500 desc (big, mid); each cluster sits on +Z so dL = its z.
    expect(out.map((l) => l.dL)).toEqual([20, 30]); // big, mid — small dropped
  });

  it('includes a featured anchor that carries no significance', () => {
    const out = buildClusterLenses([cluster('coma', [0, 0, 10], 1.4)], CAM, TARGET, 1, 16);
    expect(out).toHaveLength(1);
    expect(out[0]!.rsMpc).toBeCloseTo(1.4 / 3.2, 10);
  });
});
