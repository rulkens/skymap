import { describe, it, expect } from 'vitest';
import { buildClusterLenses } from '../../../src/utils/lensing/buildClusterLenses';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

// Camera at the origin looking down +Z. "In front" means worldPos.z > 0.
const CAM = [0, 0, 0] as const;
const TARGET = [0, 0, 1] as const;

function cluster(id: string, worldPos: [number, number, number], significance?: number): StructureInfo {
  return {
    type: 'structure',
    category: 'cluster',
    id,
    name: id,
    worldPos,
    featured: false,
    physicalRadiusMpc: 1,
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
  it('returns no lenses when the master strength is zero', () => {
    const out = buildClusterLenses([cluster('a', [0, 0, 10], 1)], CAM, TARGET, 0, 16);
    expect(out).toEqual([]);
  });

  it('drops clusters behind the camera', () => {
    const out = buildClusterLenses([cluster('behind', [0, 0, -10], 1)], CAM, TARGET, 0.1, 16);
    expect(out).toEqual([]);
  });

  it('only lenses clusters, not superclusters', () => {
    const out = buildClusterLenses([supercluster('sc', [0, 0, 10])], CAM, TARGET, 0.1, 16);
    expect(out).toEqual([]);
  });

  it('scales the Einstein radius by significance', () => {
    const out = buildClusterLenses([cluster('a', [0, 0, 10], 0.5)], CAM, TARGET, 0.2, 16);
    expect(out).toHaveLength(1);
    expect(out[0]!.center).toEqual([0, 0, 10]);
    expect(out[0]!.thetaERad).toBeCloseTo(0.1, 6); // 0.2 master × 0.5 significance
  });

  it('keeps only the most-significant maxLenses, sorted descending', () => {
    const structures = [
      cluster('weak', [0, 0, 10], 0.2),
      cluster('strong', [0, 0, 20], 0.9),
      cluster('mid', [0, 0, 30], 0.5),
    ];
    const out = buildClusterLenses(structures, CAM, TARGET, 0.1, 2);
    expect(out.map((l) => l.center[2])).toEqual([20, 30]); // strong, mid — weak dropped
  });

  it('skips clusters with no significance (no mass proxy → no lens)', () => {
    const out = buildClusterLenses([cluster('unknown', [0, 0, 10])], CAM, TARGET, 0.1, 16);
    expect(out).toEqual([]);
  });
});
