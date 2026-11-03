import type { StarField } from '../@types/StarField';
import type { StarFieldLayer } from '../@types/StarFieldLayer';
import { STAR_FIELD_FORMAT as F } from '../data/starFieldFormat';

/** assets/starField.bin read back into a StarField; throws on a version this reader does not know. */
export function decodeStarField(buffer: ArrayBuffer): StarField {
  const view = new DataView(buffer);
  const version = view.getUint8(0);
  if (version !== F.version) throw new Error(`starField.bin is version ${version}, expected ${F.version}`);
  const layerCount = view.getUint8(1);
  const paletteCount = view.getUint8(2);
  let at = 4;
  const layers: StarFieldLayer[] = [];
  let end = 0;
  for (let i = 0; i < layerCount; i++, at += 4) {
    end += view.getUint16(at + 2, true);
    layers.push({ distancePc: view.getUint16(at, true), end });
  }
  const palette: string[] = [];
  for (let i = 0; i < paletteCount; i++, at += 3) {
    const rgb = (view.getUint8(at) << 16) | (view.getUint8(at + 1) << 8) | view.getUint8(at + 2);
    palette.push(`#${rgb.toString(16).padStart(6, '0')}`);
  }
  at += at % 2;

  const n = end;
  const field: StarField = {
    layers,
    palette,
    along: new Float32Array(n),
    across: new Float32Array(n),
    mag: new Float32Array(n),
    tint: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    field.along[i] = view.getUint16(at + 2 * i, true) / F.alongPerDeg;
    field.across[i] = view.getInt16(at + 2 * (n + i), true) / F.acrossPerDeg;
    field.mag[i] = view.getUint8(at + 4 * n + i) / F.magPerUnit - F.magOffset;
    field.tint[i] = view.getUint8(at + 5 * n + i);
  }
  return field;
}
