import { describe, expect, it } from 'vitest';

import { quatFromAxisAngle } from '../../../../src/utils/math/quatFromAxisAngle';
import type { SimilarityTransform } from '../../../../tools/scene-workbench/@types/SimilarityTransform';
import { assetToGroupM } from '../../../../tools/scene-workbench/src/scene/assetToGroupM';
import { groupToAssetXY } from '../../../../tools/scene-workbench/src/scene/groupToAssetXY';

describe('groupToAssetXY', () => {
  it('groupToAssetXY undoes a 90° Z rotation, scale 2 and translation', () => {
    const transform: SimilarityTransform = {
      translationM: [10, 20, 5],
      rotation: quatFromAxisAngle([0, 0, 1], Math.PI / 2),
      scale: 2,
    };
    // Asset (3, 1) → scaled (6, 2) → rotated (-2, 6) → translated (8, 26).
    const forward = assetToGroupM(transform, [3, 1, 0]);
    expect(forward[0]).toBeCloseTo(8, 9);
    expect(forward[1]).toBeCloseTo(26, 9);

    const [x, y] = groupToAssetXY(transform, [8, 26]);

    expect(x).toBeCloseTo(3, 9);
    expect(y).toBeCloseTo(1, 9);
  });
});
