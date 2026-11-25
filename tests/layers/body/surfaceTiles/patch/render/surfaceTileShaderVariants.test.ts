import vertex from '../../../../../../src/services/gpu/shaders/bodies/surfaceTile/vertex.wesl?static';
import { SURFACE_TILE_LANE_SPECS } from '../../../../../../src/layers/body/surfaceTiles/stream/data/surfaceTileLaneSpecs';
import { describe, expect, it } from 'vitest';
import { SURFACE_TILE_REGISTRY } from '../../../../../../src/layers/body/surfaceTiles/format/data/surfaceTileRegistry';
import { SURFACE_TILE_SHADER_VARIANTS } from '../../../../../../src/layers/body/surfaceTiles/patch/render/surfaceTileShaderVariants';
import { surfaceEffectsKey } from '../../../../../../src/layers/body/surfaceTiles/plan/subsystems/surfaceEffectsKey';

describe('SURFACE_TILE_SHADER_VARIANTS', () => {
  // A row with an unlisted effects combination must fail here, not at
  // pipeline creation on a user's GPU.
  it("every registry row's effects key has a shader variant", () => {
    for (const [bodyId, spec] of Object.entries(SURFACE_TILE_REGISTRY)) {
      const key = surfaceEffectsKey(spec.effects);
      expect(SURFACE_TILE_SHADER_VARIANTS[key], `${bodyId}: '${key}'`).toBeDefined();
    }
  });

  // The renderer's layout is these shared entries plus each variant's list; a
  // shader declaring another binding (or the layout one it lacks) fails only on a
  // real GPU otherwise.
  const SHARED_BINDINGS = [0, 1, 2, 4];
  const declaredBindings = (wgsl: string) =>
    [...wgsl.matchAll(/@group\(0\)\s*@binding\((\d+)\)/g)].map((m) => Number(m[1]));

  it("each variant's WGSL bindings are the shared layout plus its own list, atlases included", () => {
    for (const [key, variant] of Object.entries(SURFACE_TILE_SHADER_VARIANTS)) {
      const declared = new Set([
        ...declaredBindings(vertex),
        ...declaredBindings(variant.fragment),
      ]);
      const layout = new Set([...SHARED_BINDINGS, ...variant.bindings]);
      expect(
        [...declared].sort((a, b) => a - b),
        `'${key}'`,
      ).toEqual([...layout].sort((a, b) => a - b));
      for (const [product, row] of Object.entries(SURFACE_TILE_LANE_SPECS)) {
        // Night's atlas is bound only where the variant shades night.
        if (product === 'night' && !declared.has(row.binding)) continue;
        expect(declared.has(row.binding), `'${key}' ${product}`).toBe(true);
      }
    }
  });
});
