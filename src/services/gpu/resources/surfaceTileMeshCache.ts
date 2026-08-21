import type { SurfaceTileMesh } from '../../../@types/scene/SurfaceTileMesh';
import { bakeSurfaceTileMesh } from '../../../utils/scene/bakeSurfaceTileMesh';

export type SurfaceTileMeshCache = {
  /** Get (baking on first miss) this frame's mesh for `id`, touching its
   *  LRU stamp. Never null — a bake always succeeds for a valid id. */
  get(
    id: { readonly z: number; readonly x: number; readonly y: number },
    frame: number,
  ): SurfaceTileMesh;
};

type Entry = { readonly mesh: SurfaceTileMesh; lastSeenFrame: number };

/**
 * createSurfaceTileMeshCache — an LRU cache of baked CPU `SurfaceTileMesh`
 * objects, keyed by tile id (``${z}/${x}/${y}``). Same LRU-by-lastSeenFrame
 * shape as `TextureAtlas`, but a SECOND, independent cache from the atlas
 * (spec §3.3: this is not itself atlas-resident) and GPU-free — no device,
 * no upload methods. Task 4's renderer reads these CPU arrays and uploads
 * them itself every frame, the shape `starCatalogRenderer` already uses for
 * its own per-frame CPU cut.
 */
export function createSurfaceTileMeshCache(
  capacity: number,
  resolution: number,
): SurfaceTileMeshCache {
  const entries = new Map<string, Entry>();

  return {
    get(id, frame) {
      const key = `${id.z}/${id.x}/${id.y}`;
      const existing = entries.get(key);
      if (existing !== undefined) {
        existing.lastSeenFrame = frame;
        return existing.mesh;
      }

      if (entries.size >= capacity) {
        let lruKey: string | undefined;
        let lruFrame = Infinity;
        for (const [k, e] of entries) {
          if (e.lastSeenFrame < lruFrame) {
            lruFrame = e.lastSeenFrame;
            lruKey = k;
          }
        }
        if (lruKey !== undefined) entries.delete(lruKey);
      }

      const mesh = bakeSurfaceTileMesh(id, resolution);
      entries.set(key, { mesh, lastSeenFrame: frame });
      return mesh;
    },
  };
}
