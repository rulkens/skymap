import type { GridElement } from '../../@types/GridElement';
import type { TraceReadback } from '../../@types/TraceReadback';
import { writeNpy } from '../../../parsers/npyWriter';
import { xFastestToCOrder } from './xFastestToCOrder';

const DTYPE_FOR_ELEMENT: Record<GridElement, '<f2' | '<f4'> = { f16: '<f2', f32: '<f4' };

/**
 * exportNpy — `writeNpy` at the readback's own dtype (raw f16 bits for an f16
 * grid, no widening) and `dims` as the shape, in the same axis order
 * `buildRhizomeVolume` compares 1:1 against the sidecar's `dims`. The
 * readback itself is grid.wesl's x-fastest GPU layout; `xFastestToCOrder`
 * transposes it to NumPy C-order before writing, so this `.npy`'s BYTES
 * (not just its declared shape) match what `buildRhizomeVolume.ts`'s
 * default `packLogTraceVoxels` call — and a real PolyPhy-fork export —
 * already expect (T19 gate finding: without this, 100% of non-background
 * voxels round-tripped wrong).
 */
export function exportNpy(readback: TraceReadback): ArrayBuffer {
  const cOrder = xFastestToCOrder(readback.data, readback.dims);
  return writeNpy(cOrder, readback.dims, DTYPE_FOR_ELEMENT[readback.element]);
}
