import { describe, expect, it } from 'vitest';
import { SURFACE_TILE_REGISTRY } from '../../../../../../src/layers/body/surfaceTiles/format/data/surfaceTileRegistry';
import { surfaceTileSpecOf } from '../../../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileSpecOf';
import { asSceneBodyId } from '../../../../../../src/utils/scene/asSceneBodyId';

describe('surfaceTileSpecOf', () => {
  it('returns the registry row for every registered body', () => {
    for (const [id, spec] of Object.entries(SURFACE_TILE_REGISTRY)) {
      expect(surfaceTileSpecOf(asSceneBodyId(id))).toBe(spec);
    }
  });

  it('returns null for a body with no row', () => {
    expect(surfaceTileSpecOf(asSceneBodyId('jupiter'))).toBeNull();
  });
});
