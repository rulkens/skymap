import type { Vec3 } from '../../../src/@types/math/Vec3';
import { readFileChunked } from './readFileChunked';
import { decodeF16 } from './decodeF16';

// Pooled small reads can land misaligned (TypedArray views need alignment);
// a full-file read is always a fresh offset-0 allocation — zero-copy in practice.
function alignedTypedArrayBuffer(
  buf: Buffer,
  elementBytes: number,
): { buffer: ArrayBufferLike; byteOffset: number } {
  if (buf.byteOffset % elementBytes === 0)
    return { buffer: buf.buffer, byteOffset: buf.byteOffset };
  return {
    buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    byteOffset: 0,
  };
}

/**
 * readTraceCube — load a headerless trace `.bin` given its dims. Element
 * size is NEVER assumed: derived from `fileLength / voxelCount` because
 * upstream docs disagree (plan says f16, README says f32, anchor is ~4
 * bytes/voxel) — see task-T22-brief.md. Anything but exactly 2 or 4
 * bytes/voxel is a hard error carrying the numbers needed to diagnose it.
 *
 * Reads chunked (readFileSync refuses files >2 GiB; the anchor is 2.49 GB)
 * and decodes f16 with a plain loop, not `.from(bits, mapFn)` (OOMs on the
 * iterator protocol at ~622M elements) — both confirmed failures, T23's
 * report. Peak RSS at that scale: f32 is one zero-copy view (~2.5 GB); f16
 * additionally holds the raw buffer (~1.25 GB) until the decoded ~2.5 GB
 * array replaces it. Both cubes stay live at once in `compareTraceCubes`:
 * budget ~5-8 GB peak per run.
 */
export function readTraceCube(filePath: string, dims: Vec3): Float32Array {
  const raw = readFileChunked(filePath);
  const voxelCount = dims[0] * dims[1] * dims[2];
  const bytesPerVoxel = raw.byteLength / voxelCount;

  if (bytesPerVoxel === 2) {
    const { buffer, byteOffset } = alignedTypedArrayBuffer(raw, 2);
    const bits = new Uint16Array(buffer, byteOffset, voxelCount);
    return decodeF16(bits);
  }
  if (bytesPerVoxel === 4) {
    const { buffer, byteOffset } = alignedTypedArrayBuffer(raw, 4);
    return new Float32Array(buffer, byteOffset, voxelCount);
  }

  const f16Bytes = voxelCount * 2;
  const f32Bytes = voxelCount * 4;
  throw new Error(
    `readTraceCube: ${filePath} is ${raw.byteLength} bytes for dims ${dims.join('x')} ` +
      `(${voxelCount} voxels) — that's neither f16 (${f16Bytes} bytes expected) nor ` +
      `f32 (${f32Bytes} bytes expected). Observed bytes/voxel: ${bytesPerVoxel}.`,
  );
}
