import type { GridElement } from './GridElement';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * TraceReadback — the sim's trace grid copied to the CPU for the T16 (.npy)
 * and T17 (.scfd) export legs. `data` holds raw f16 BITS (not decoded
 * floats) when `element` is 'f16' — a byte-for-byte mirror of the GPU
 * buffer; exporters that need floats decode with `f16ToFloat` themselves.
 */
export type TraceReadback = {
  readonly data: Uint16Array | Float32Array;
  readonly element: GridElement;
  readonly dims: Vec3;
};
