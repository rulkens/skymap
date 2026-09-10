/**
 * assetCount — the dispatch itself. `tsc` already proves the table exhaustive
 * and each row well-typed; what can still break is a row wired to the wrong
 * field or unit, which no compiler check catches.
 */
import { describe, expect, it } from 'vitest';

import { assetCount } from '../../../../tools/scene-workbench/src/scene/assetCount';
import type { AssetCommon } from '../../../../tools/scene-workbench/@types/AssetCommon';
import type { GaussianSplatAsset } from '../../../../tools/scene-workbench/@types/GaussianSplatAsset';
import type { PointCloudAsset } from '../../../../tools/scene-workbench/@types/PointCloudAsset';

const COMMON: AssetCommon = {
  id: 'a1',
  label: 'Facade scan',
  transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
  provenance: {
    source: 'nationalGeodataApi',
    sourceVintage: '2024-01-01',
    pipeline: [{ step: 'bake', version: '1' }],
  },
};

describe('assetCount', () => {
  it('reports pts for a pointCloud asset and splats for a gaussianSplat asset', () => {
    const pointCloud: PointCloudAsset = {
      ...COMMON,
      kind: 'pointCloud',
      pointCount: 1_234_567,
      artifactUrl: 'geo3d/g1/a1/points.bin',
    };
    const gaussianSplat: GaussianSplatAsset = {
      ...COMMON,
      kind: 'gaussianSplat',
      splatCount: 42_000,
      shDegree: 0,
      artifactUrl: 'geo3d/g1/a1/splats.bin',
    };

    expect(assetCount(pointCloud)).toEqual({ count: 1_234_567, unit: 'pts' });
    expect(assetCount(gaussianSplat)).toEqual({ count: 42_000, unit: 'splats' });
  });
});
