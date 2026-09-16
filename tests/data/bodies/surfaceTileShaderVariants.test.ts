import { describe, expect, it } from 'vitest';
import { SURFACE_TILE_REGISTRY } from '../../../src/data/bodies/surfaceTileRegistry';
import { SURFACE_TILE_SHADER_VARIANTS } from '../../../src/data/bodies/surfaceTileShaderVariants';
import { surfaceEffectsKey } from '../../../src/utils/surfaceTiles/surfaceEffectsKey';

describe('SURFACE_TILE_SHADER_VARIANTS', () => {
  // A row with an unlisted effects combination must fail here, not at
  // pipeline creation on a user's GPU.
  it("every registry row's effects key has a shader variant", () => {
    for (const [bodyId, spec] of Object.entries(SURFACE_TILE_REGISTRY)) {
      const key = surfaceEffectsKey(spec.effects);
      expect(SURFACE_TILE_SHADER_VARIANTS[key], `${bodyId}: '${key}'`).toBeDefined();
    }
  });
});
