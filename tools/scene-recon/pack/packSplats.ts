/**
 * Encodes Gaussian splats as `splats.bin` (spec §5) — a 16-byte header,
 * one 28-byte core record per splat, then (only at shDegree 1) a
 * trailing block of 12-byte SH degree-1 records, never interleaved.
 * Little-endian throughout. Pure — no I/O; the caller writes the bytes.
 *
 * The in-record offsets exist so the shader can read each field with a
 * whole-word unpack builtin (`unpack4x8snorm`, `unpack2x16float`,
 * `unpack4x8unorm`); the two pad bytes are what keep those words intact.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../src/@types/math/Vec4';
import { f32ToF16Bits } from '../../../src/utils/math/f32ToF16Bits';
import {
  SPLATS_MAGIC,
  SPLATS_FORMAT_VERSION,
  SPLATS_HEADER_BYTES,
  SPLATS_RECORD_BYTES,
  SPLATS_SH1_RECORD_BYTES,
} from './splatFormat';

export type GaussianSplatRecord = {
  readonly xM: number;
  readonly yM: number;
  readonly zM: number;
  readonly rotation: Vec4; // unit quaternion [x, y, z, w]
  readonly logScale: Vec3; // natural log of the Gaussian's axis half-lengths, metres
  readonly opacity: number; // 0..1, post-sigmoid
  readonly dcColor: readonly [number, number, number]; // 0..255
  readonly fRest: readonly number[] | null; // 9 values (R, G, B × 3), null at shDegree 0
};

// `unpack4x8snorm` divides by 127, so -128 is unreachable by construction.
const snorm8 = (value: number): number => Math.max(-127, Math.min(127, Math.round(value * 127)));
const u8 = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

export function packSplats(splats: readonly GaussianSplatRecord[], shDegree: 0 | 1): Uint8Array {
  const coreBytes = splats.length * SPLATS_RECORD_BYTES;
  const sh1Bytes = shDegree === 1 ? splats.length * SPLATS_SH1_RECORD_BYTES : 0;
  const buffer = new ArrayBuffer(SPLATS_HEADER_BYTES + coreBytes + sh1Bytes);
  const dv = new DataView(buffer);

  for (let i = 0; i < SPLATS_MAGIC.length; i++) {
    dv.setUint8(i, SPLATS_MAGIC.charCodeAt(i));
  }
  dv.setUint32(4, SPLATS_FORMAT_VERSION, true);
  dv.setUint32(8, splats.length, true);
  dv.setUint32(12, shDegree, true);

  splats.forEach((splat, i) => {
    const offset = SPLATS_HEADER_BYTES + i * SPLATS_RECORD_BYTES;
    dv.setFloat32(offset + 0, splat.xM, true);
    dv.setFloat32(offset + 4, splat.yM, true);
    dv.setFloat32(offset + 8, splat.zM, true);
    for (let c = 0; c < 4; c++) {
      dv.setInt8(offset + 12 + c, snorm8(splat.rotation[c]!));
    }
    dv.setUint16(offset + 16, f32ToF16Bits(splat.logScale[0]), true);
    dv.setUint16(offset + 18, f32ToF16Bits(splat.logScale[1]), true);
    dv.setUint16(offset + 20, f32ToF16Bits(splat.logScale[2]), true);
    dv.setUint8(offset + 22, u8(splat.opacity * 255));
    dv.setUint8(offset + 24, u8(splat.dcColor[0]));
    dv.setUint8(offset + 25, u8(splat.dcColor[1]));
    dv.setUint8(offset + 26, u8(splat.dcColor[2]));
    // Bytes 23 and 27 are pads — the ArrayBuffer already zeroed them.
  });

  if (shDegree === 1) {
    const sh1Base = SPLATS_HEADER_BYTES + coreBytes;
    splats.forEach((splat, i) => {
      const fRest = splat.fRest;
      if (!fRest) return; // absent coefficients stay zero
      const offset = sh1Base + i * SPLATS_SH1_RECORD_BYTES;
      for (let channel = 0; channel < 3; channel++) {
        for (let k = 0; k < 3; k++) {
          // Channel-major, one padded word per channel: R[0..2] _, G[0..2] _, B[0..2] _.
          dv.setInt8(offset + channel * 4 + k, snorm8(fRest[channel * 3 + k]!));
        }
      }
    });
  }

  return new Uint8Array(buffer);
}
