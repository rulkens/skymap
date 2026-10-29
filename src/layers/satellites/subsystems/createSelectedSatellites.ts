/**
 * createSelectedSatellites — owns the satellites' entries in `transientPositions`, the way
 * `loadSpacecraftTracksSaga` owns the craft's in `trajectoryRegistry`: one entry per selected or
 * focused satellite, set once the catalog holds it and deleted when the selection lets go. A hover
 * gets none: it only needs its card, and hovering sweeps across many dots.
 */
import { transientPositions } from '../../../services/bodies/transientPositions';
import { satelliteTransientId } from '../present/satelliteTransientId';
import { catalogIndexOf } from './catalogIndexOf';
import { satellitePositioner } from './satellitePositioner';
import type { SatellitesRuntime } from '../@types/SatellitesRuntime';
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';
import type { SelectedSatellites } from '../@types/SelectedSatellites';
import type { SelectionState } from '../../../@types/store/SelectionState';

const selectedNoradIds = ({ select, focus }: SelectionState): Set<number> => {
  const ids = new Set<number>();
  for (const ref of [select, focus]) if (ref?.type === 'satellite') ids.add(ref.noradId);
  return ids;
};

export function createSelectedSatellites(
  selection: { read(): SelectionState; subscribe(changed: () => void): () => void },
  runtime: {
    readonly slot: { subscribe(changed: () => void): () => void };
    readonly propagator: Pick<SatellitesRuntime['propagator'], 'catalog'>;
  },
): SelectedSatellites {
  // The catalog each entry was built from, so a reloaded catalog rebuilds it.
  const set = new Map<number, SatelliteCatalog>();
  let wanted = new Set<number>();
  let lastSelection: unknown = null;

  const sync = (): void => {
    const catalog = runtime.propagator.catalog();
    for (const [noradId, built] of set) {
      if (wanted.has(noradId) && built === catalog) continue;
      transientPositions.delete(satelliteTransientId(noradId));
      set.delete(noradId);
    }
    if (catalog === null) return;
    for (const noradId of wanted) {
      const k = set.has(noradId) ? -1 : catalogIndexOf(catalog, noradId);
      if (k < 0) continue;
      transientPositions.set(satelliteTransientId(noradId), satellitePositioner(catalog, k));
      set.set(noradId, catalog);
    }
  };

  const onSelection = (): void => {
    const current = selection.read();
    if (current === lastSelection) return;
    lastSelection = current;
    wanted = selectedNoradIds(current);
    sync();
  };

  const unsubscribes = [selection.subscribe(onSelection), runtime.slot.subscribe(sync)];
  onSelection();
  return {
    any: () => wanted.size > 0,
    stop: () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      wanted = new Set();
      sync();
    },
  };
}
