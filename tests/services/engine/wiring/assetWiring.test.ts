/** ASSET_WIRING — core's mesh body rows: the request each one builds. */

import { describe, it, expect } from 'vitest';
import { ASSET_WIRING } from '../../../../src/services/engine/wiring/assetWiring';
import { expandCompanionRows } from '../../../../src/utils/loading/expandCompanionRows';
import { meshBodySlotKey } from '../../../../src/utils/meshBodies/meshBodySlotKey';

describe('ASSET_WIRING', () => {
  it("clamps a mesh body's tier to its tierCeiling", () => {
    // Every SCENE_MESH_BODIES entry ships `small` only today, so any app tier
    // above it must still fetch the `small` files.
    const row = expandCompanionRows(ASSET_WIRING).find(
      (r) => r.key === meshBodySlotKey('curiosity'),
    )!;
    expect(row.req('large')).toEqual({ meshKey: 'curiosity', tier: 'small' });
  });
});
