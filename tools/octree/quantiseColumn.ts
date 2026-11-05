import type { ColumnSchema } from '../../src/@types/octree/ColumnSchema';
import type { OctreeRawColumn } from '../@types/octree/OctreeRawColumn';
import { OFFSET_FRACTION_LEVELS } from '../../src/data/octree/octreeFormat';
import { f32ToF16Bits } from '../../src/utils/math/f32ToF16Bits';

const INTEGER_STORES = {
  u8: { array: Uint8Array, min: 0, max: 0xff },
  u16: { array: Uint16Array, min: 0, max: 0xffff },
  u32: { array: Uint32Array, min: 0, max: 0xffffffff },
  i8: { array: Int8Array, min: -0x80, max: 0x7f },
} as const;

/** One column's dequantised values to its store's raw wire values; integers are `round((v − q0) / q1)`, clamped. */
export function quantiseColumn(values: Float32Array, c: ColumnSchema): OctreeRawColumn {
  switch (c.store) {
    case 'f32':
      return values;
    case 'f16':
      return Uint16Array.from(values, f32ToF16Bits);
    case 'u16x3':
      return Uint16Array.from(values, (f) =>
        clamp(Math.round(f * OFFSET_FRACTION_LEVELS), 0, OFFSET_FRACTION_LEVELS - 1),
      );
    case 'u64':
      // An f32 cannot hold a pgc: ids reach the encoder as a BigUint64Array, never through here.
      throw new Error(`column ${c.id}: u64 ids are never quantised from f32 values`);
    default: {
      const { array, min, max } = INTEGER_STORES[c.store];
      const out = new array(values.length);
      values.forEach((v, i) => (out[i] = clamp(Math.round((v - c.q0) / c.q1), min, max)));
      return out;
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
