import type { StarField } from '../../../packages/website/src/@types/StarField';
import { STAR_FIELD_FORMAT as F } from '../../../packages/website/src/data/starFieldFormat';

/** A StarField as the bytes of assets/starField.bin, in the layout of `STAR_FIELD_FORMAT`. */
export function encodeStarField(field: StarField): Uint8Array {
  const n = field.along.length;
  const header = 4 + 4 * field.layers.length + 3 * field.palette.length;
  const columns = header + (header % 2);
  const bytes = new Uint8Array(columns + 6 * n);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, F.version);
  view.setUint8(1, field.layers.length);
  view.setUint8(2, field.palette.length);
  let at = 4;
  let start = 0;
  for (const layer of field.layers) {
    view.setUint16(at, Math.round(layer.distancePc), true);
    view.setUint16(at + 2, layer.end - start, true);
    start = layer.end;
    at += 4;
  }
  for (const hex of field.palette) {
    for (let c = 0; c < 3; c++) view.setUint8(at++, parseInt(hex.slice(1 + 2 * c, 3 + 2 * c), 16));
  }
  for (let i = 0; i < n; i++) {
    view.setUint16(columns + 2 * i, Math.round(field.along[i]! * F.alongPerDeg) % 65536, true);
    view.setInt16(columns + 2 * (n + i), Math.round(field.across[i]! * F.acrossPerDeg), true);
    view.setUint8(columns + 4 * n + i, Math.round((field.mag[i]! + F.magOffset) * F.magPerUnit));
    view.setUint8(columns + 5 * n + i, field.tint[i]!);
  }
  return bytes;
}
