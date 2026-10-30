/**
 * selectedSatelliteIndices — catalog indices of the selected and focused satellites, deduped, for
 * the orbit rings. Hover gets no ring: it only needs its card, and hovering sweeps across many dots.
 */
import { catalogIndexOf } from './catalogIndexOf';
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';
import type { SelectionState } from '../../../@types/store/SelectionState';

export function selectedSatelliteIndices(
  { select, focus }: SelectionState,
  cat: SatelliteCatalog | null,
): number[] {
  const ks: number[] = [];
  if (cat === null) return ks;
  for (const ref of [select, focus]) {
    if (ref?.type !== 'satellite') continue;
    const k = catalogIndexOf(cat, ref.noradId);
    if (k >= 0 && !ks.includes(k)) ks.push(k);
  }
  return ks;
}
