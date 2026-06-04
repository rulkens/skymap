import type { FilamentStore } from '../../../@types/engine/data/FilamentStore';

/**
 * createFilamentStore — factory for the (thin) filament status store.
 *
 * Same factory + closure shape as the other stores. Holds three scalars
 * behind getters; `setLoaded` is the single mutation seam, called by the
 * filament slot commit.
 */
export function createFilamentStore(): FilamentStore {
  let loaded = false;
  let stripCount = 0;
  let vertexCount = 0;

  return Object.freeze({
    get loaded(): boolean {
      return loaded;
    },
    get stripCount(): number {
      return stripCount;
    },
    get vertexCount(): number {
      return vertexCount;
    },
    setLoaded(strips: number, vertices: number): void {
      loaded = true;
      stripCount = strips;
      vertexCount = vertices;
    },
  });
}
