import type { GridElement } from '../../@types/GridElement';
import type { TraceReadback } from '../../@types/TraceReadback';
import { writeNpy } from '../../../parsers/npyWriter';

const DTYPE_FOR_ELEMENT: Record<GridElement, '<f2' | '<f4'> = { f16: '<f2', f32: '<f4' };

/**
 * exportNpy — `writeNpy` at the readback's own dtype (raw f16 bits for an f16
 * grid, no widening) and `dims` as the shape, in the same axis order
 * `buildRhizomeVolume` compares 1:1 against the sidecar's `dims`.
 */
export function exportNpy(readback: TraceReadback): ArrayBuffer {
  return writeNpy(readback.data, readback.dims, DTYPE_FOR_ELEMENT[readback.element]);
}
