import { f16BitsToFloat } from '../../utils/math/f16BitsToFloat';

// Preallocated array + indexed loop, not `Float32Array.from(bits, mapFn)` —
// that OOMs on the iterator protocol at anchor scale (readTraceCube.ts docs why).
export function decodeF16(bits: Uint16Array): Float32Array {
  const out = new Float32Array(bits.length);
  for (let i = 0; i < bits.length; i++) out[i] = f16BitsToFloat(bits[i]!);
  return out;
}
