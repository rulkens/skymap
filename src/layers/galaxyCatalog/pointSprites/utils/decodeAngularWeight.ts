/**
 * decodeAngularWeight — inverse of `encodeAngularWeight`. Raw 0 is a cloud
 * that never baked a weight, so it decodes to 1.0 (unweighted).
 */
export function decodeAngularWeight(raw: number): number {
  return raw === 0 ? 1 : 10 ** ((raw - 128) / 127);
}
