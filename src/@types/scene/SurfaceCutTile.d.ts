import type { Vec3 } from '../math/Vec3';

/**
 * SurfaceCutTile — one leaf of `cutSurfaceTiles`'s walk that is actually
 * resident this frame (a leaf with no resident tile anywhere in its
 * ancestor chain is dropped; the base globe covers it instead — see the
 * Task 2 brief). `originLocal` is the direction of the tile's uv-origin
 * corner — `originLocal = equirectUvToDirection([u0, v0])`, `[u0, v0]` the
 * tile's uv footprint origin — a binding cross-task contract Task 3's mesh
 * baker shares.
 */
export type SurfaceCutTile = {
  readonly id: { readonly z: number; readonly x: number; readonly y: number };
  readonly originLocal: Vec3;
  readonly resident: {
    readonly slot: number;
    /** This leaf's OWN atlas rect, already flattened by
     *  `cutSurfaceTiles.ts`'s `resolveCutResidency` to the resolved
     *  ancestor's `1 / 2^levelDelta` sub-rect — never the ancestor's raw
     *  slot rect. There is no `levelDelta` to apply downstream; a
     *  flattened rect is the only fact a consumer needs. */
    readonly atlasUvOrigin: readonly [number, number];
    readonly atlasUvScale: readonly [number, number];
  };
};
