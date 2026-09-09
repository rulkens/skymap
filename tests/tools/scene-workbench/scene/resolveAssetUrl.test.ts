/**
 * The `?probe` scene's blob: URLs and a baked scene's logical paths meet at
 * the same two fetch sites, so this pins both branches of the split.
 */
import { describe, expect, it } from 'vitest';

import { resolveAssetUrl } from '../../../../tools/scene-workbench/src/scene/resolveAssetUrl';
import { dataUrl } from '../../../../src/services/loading/fetchWithProgress';

describe('resolveAssetUrl', () => {
  it('passes an absolute blob: URL through untouched', () => {
    const blob = 'blob:http://localhost:5600/9f3c7a10-0b2e-4f1a-9c00-1d2e3f405060';
    expect(resolveAssetUrl(blob)).toBe(blob);
  });

  it('resolves a logical path through dataUrl', () => {
    const path = 'geo3d/groups/soendermarken/assets/lidar/points.bin';
    expect(resolveAssetUrl(path)).toBe(dataUrl(path));
  });
});
