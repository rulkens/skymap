import type { PointCloud } from '../types';

const MAGIC = 0x504d4b53; // "SKMP" little-endian
const VERSION = 1;
const HEADER_BYTES = 16;
const FLOATS_PER_POINT = 5;

export function encodePointCloud(cloud: PointCloud): ArrayBuffer {
  const { count, positions, magnitudes, colorIndex } = cloud;
  if (positions.length !== count * 3) throw new Error('positions length mismatch');
  if (magnitudes.length !== count) throw new Error('magnitudes length mismatch');
  if (colorIndex.length !== count) throw new Error('colorIndex length mismatch');

  const buf = new ArrayBuffer(HEADER_BYTES + count * FLOATS_PER_POINT * 4);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, count, true);
  dv.setUint32(12, 0, true);

  const floats = new Float32Array(buf, HEADER_BYTES, count * FLOATS_PER_POINT);
  for (let i = 0; i < count; i++) {
    const o = i * FLOATS_PER_POINT;
    floats[o + 0] = positions[i * 3 + 0]!;
    floats[o + 1] = positions[i * 3 + 1]!;
    floats[o + 2] = positions[i * 3 + 2]!;
    floats[o + 3] = magnitudes[i]!;
    floats[o + 4] = colorIndex[i]!;
  }
  return buf;
}

export function decodePointCloud(buf: ArrayBuffer): PointCloud {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad magic');
  const version = dv.getUint32(4, true);
  if (version !== VERSION) throw new Error(`unsupported version: ${version}`);
  const count = dv.getUint32(8, true);

  const floats = new Float32Array(buf, HEADER_BYTES, count * FLOATS_PER_POINT);
  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndex = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * FLOATS_PER_POINT;
    positions[i * 3 + 0] = floats[o + 0]!;
    positions[i * 3 + 1] = floats[o + 1]!;
    positions[i * 3 + 2] = floats[o + 2]!;
    magnitudes[i] = floats[o + 3]!;
    colorIndex[i] = floats[o + 4]!;
  }
  return { count, positions, magnitudes, colorIndex };
}
