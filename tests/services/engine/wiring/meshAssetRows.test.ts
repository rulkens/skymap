/** meshAssetRows — core's mesh body rows: the request each one builds. */

import { describe, it, expect } from 'vitest';
import { meshAssetRows } from '../../../../src/services/engine/wiring/meshAssetRows';
import { meshBodySlotKey } from '../../../../src/utils/meshBodies/meshBodySlotKey';

describe('meshAssetRows', () => {
  it("clamps a mesh body's tier to its tierCeiling", () => {
    // Every SCENE_MESH_BODIES entry ships `small` only today, so any app tier
    // above it must still fetch the `small` files.
    const row = meshAssetRows({ gpu: { meshBodyRenderer: null } } as never).find(
      (r) => r.key === meshBodySlotKey('curiosity'),
    )!;
    expect(row.req('large')).toEqual({ meshKey: 'curiosity', tier: 'small' });
  });
});
