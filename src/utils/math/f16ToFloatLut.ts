/**
 * f16ToFloatLut — table-lookup decode of an IEEE 754 binary16 (half) raw
 * bit pattern, backed by a 65536-entry `Float32Array` (256KB) built once
 * from `f16ToFloat` over every possible bit pattern. Trades that one-time
 * cost for O(1) decode on hot paths like a 1536x512x4-texel readback
 * (3.1M halves) that reruns on every UI tick. The table is built via
 * `f16ToFloat`, so subnormals/NaN/±Inf decode through the same IEEE 754
 * formula as the scalar path — a misbehaving upstream still surfaces as a
 * real NaN/Inf here, not a garbled finite number.
 */
import { f16ToFloat } from './f16ToFloat';

let table: Float32Array | undefined;

export function f16ToFloatLut(bits: number): number {
  if (!table) {
    table = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) table[i] = f16ToFloat(i);
  }
  return table[bits]!;
}
