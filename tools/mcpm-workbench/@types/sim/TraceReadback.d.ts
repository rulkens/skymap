import type { GridElement } from '../grid/GridElement';
import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';

/**
 * TraceReadback — the sim's trace grid copied to the CPU for the .npy and
 * .scfd exports. `data` holds raw f16 BITS (not decoded
 * floats) when `element` is 'f16' — a byte-for-byte mirror of the GPU
 * buffer; exporters that need floats decode with `f16ToFloat` themselves.
 */
export type TraceReadback = {
  readonly data: Uint16Array | Float32Array;
  readonly element: GridElement;
  readonly dims: Vec3;
};
