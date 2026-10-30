/**
 * createSelectedSatellites — whether a satellite is selected or focused, for the asset row's demand.
 * A hover never counts: hovering sweeps across many dots.
 */
import type { SelectedSatellites } from '../@types/SelectedSatellites';
import type { SelectionState } from '../../../@types/store/SelectionState';

const hasSatellite = ({ select, focus }: SelectionState): boolean =>
  select?.type === 'satellite' || focus?.type === 'satellite';

export function createSelectedSatellites(selection: {
  read(): SelectionState;
  subscribe(changed: () => void): () => void;
}): SelectedSatellites {
  let any = hasSatellite(selection.read());
  const unsubscribe = selection.subscribe(() => {
    any = hasSatellite(selection.read());
  });
  return {
    any: () => any,
    stop: () => {
      unsubscribe();
      any = false;
    },
  };
}
