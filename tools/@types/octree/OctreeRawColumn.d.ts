/**
 * One column's raw (already quantised) wire values: integer scalars in their store's array,
 * `f16` as half bits in a Uint16Array, packed vectors as 3·n components in a Uint16Array.
 */
export type OctreeRawColumn =
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | BigUint64Array
  | Int8Array
  | Float32Array;
