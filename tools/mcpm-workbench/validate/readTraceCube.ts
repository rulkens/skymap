import { readFileSync } from 'node:fs';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { f16BitsToFloat } from '../../utils/math/f16BitsToFloat';

/**
 * readTraceCube — load a headerless trace `.bin` given its dims. Element
 * size is NEVER assumed: it's derived from `fileLength / voxelCount`
 * because upstream docs disagree (plan text says f16, the data README says
 * f32, the real anchor is ~4 bytes/voxel) — see task-T22-brief.md. Anything
 * other than exactly 2 or 4 bytes/voxel is a hard error carrying the
 * numbers needed to diagnose it, since that's the only lead into whatever
 * discrepancy produced it.
 */
export function readTraceCube(filePath: string, dims: Vec3): Float32Array {
  const raw = readFileSync(filePath);
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const voxelCount = dims[0] * dims[1] * dims[2];
  const bytesPerVoxel = buf.byteLength / voxelCount;

  if (bytesPerVoxel === 2) {
    const bits = new Uint16Array(buf);
    return Float32Array.from(bits, (b) => f16BitsToFloat(b));
  }
  if (bytesPerVoxel === 4) {
    return new Float32Array(buf);
  }

  const f16Bytes = voxelCount * 2;
  const f32Bytes = voxelCount * 4;
  throw new Error(
    `readTraceCube: ${filePath} is ${buf.byteLength} bytes for dims ${dims.join('x')} ` +
      `(${voxelCount} voxels) — that's neither f16 (${f16Bytes} bytes expected) nor ` +
      `f32 (${f32Bytes} bytes expected). Observed bytes/voxel: ${bytesPerVoxel}.`,
  );
}
