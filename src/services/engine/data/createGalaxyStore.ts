import type { GalaxyStore } from '../../../@types/engine/data/GalaxyStore';
import type { SourceType } from '../../../@types/data/SourceType';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';

/**
 * createGalaxyStore — factory for the galaxy data store.
 *
 * A plain factory closing over private mutable state, not a class: the
 * engine is a singleton, so the only thing a class would add is a `this.`
 * access pattern. Closing over a `Map` and returning a frozen object of
 * accessors keeps the mutable surface tiny and invisible to consumers —
 * they receive a `ReadonlyMap` view and can only change state through the
 * setters, which the slot commits own.
 *
 * The `catalogs` getter returns the live private state, so a reader always
 * sees the current contents without the store handing out a defensive copy
 * on every frame.
 */
export function createGalaxyStore(): GalaxyStore {
  const catalogs = new Map<SourceType, GalaxyCatalog>();

  return Object.freeze({
    get catalogs(): ReadonlyMap<SourceType, GalaxyCatalog> {
      return catalogs;
    },
    setCatalog(source: SourceType, catalog: GalaxyCatalog): void {
      catalogs.set(source, catalog);
    },
    removeCatalog(source: SourceType): void {
      catalogs.delete(source);
    },
    get(source: SourceType): GalaxyCatalog | undefined {
      return catalogs.get(source);
    },
  });
}
