/**
 * Encodes baked LiDAR points as `points.bin` (spec §5) — a fixed 16-byte
 * header followed by one 16-byte record per point, little-endian
 * throughout. Pure — no I/O; the caller writes the returned bytes to disk.
 */
import {
  POINTS_MAGIC,
  POINTS_FORMAT_VERSION,
  POINTS_HEADER_BYTES,
  POINTS_RECORD_BYTES,
} from './pointCloudFormat';

export type ScenePoint = {
  readonly xM: number;
  readonly yM: number;
  readonly zM: number;
  readonly r: number; // 0..255
  readonly g: number; // 0..255
  readonly b: number; // 0..255
  readonly classification: number; // 0..255, ASPRS class
};

export function packPoints(points: readonly ScenePoint[]): Uint8Array {
  const buffer = new ArrayBuffer(POINTS_HEADER_BYTES + points.length * POINTS_RECORD_BYTES);
  const dv = new DataView(buffer);

  for (let i = 0; i < POINTS_MAGIC.length; i++) {
    dv.setUint8(i, POINTS_MAGIC.charCodeAt(i));
  }
  dv.setUint32(4, POINTS_FORMAT_VERSION, true);
  dv.setUint32(8, points.length, true);
  // Bytes 12..15 are the reserved alignment pad — ArrayBuffer already
  // zero-initializes them, so there is nothing to write.

  points.forEach((point, i) => {
    const offset = POINTS_HEADER_BYTES + i * POINTS_RECORD_BYTES;
    dv.setFloat32(offset + 0, point.xM, true);
    dv.setFloat32(offset + 4, point.yM, true);
    dv.setFloat32(offset + 8, point.zM, true);
    dv.setUint8(offset + 12, point.r);
    dv.setUint8(offset + 13, point.g);
    dv.setUint8(offset + 14, point.b);
    dv.setUint8(offset + 15, point.classification);
  });

  return new Uint8Array(buffer);
}
