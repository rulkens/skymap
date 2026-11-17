/**
 * selectionHaloOf — the selected row's halo: a ring of the kind's `radii × radiusMpc` at its
 * position, tagged with the depth slab it projects through. `slab` lets the COSMO and NEAR0
 * ring passes share one `selectionRingRenderer` without racing: each draws only its own
 * slab's halos, so one writes the shared uniform buffers per frame (`near0SelectionRingPass`).
 */
import { selectionKindOf } from '../selection/selectionKindOf';
import { NEAR0, COSMO } from '../frame/slabs';
import type { PlacedRow } from '../../../@types/engine/selection/PlacedRow';
import type { SelectionRowBase } from '../../../@types/engine/selection/SelectionRowBase';
import type { SelectionHalo } from '../../../@types/engine/selection/SelectionHalo';

export function selectionHaloOf(row: SelectionRowBase | null): SelectionHalo | null {
  if (row === null) return null;
  const ring = selectionKindOf(row.type).focus?.ring ?? null;
  if (ring === null) return null;
  // A kind with a focus places its rows (`SelectionKindFacts.focus`).
  const { positionMpc, radiusMpc } = row as PlacedRow;
  return {
    radiusMpc: ring.radii * radiusMpc,
    worldPos: [positionMpc[0], positionMpc[1], positionMpc[2]],
    slab: ring.slab === 'near0' ? NEAR0 : COSMO,
  };
}
