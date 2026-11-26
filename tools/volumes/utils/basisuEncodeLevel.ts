import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import { BASISU_ARGS } from '../data/basisuArgs';
import { DDS_DX10_HEADER_BYTES } from '../data/ddsDx10HeaderBytes';
import { GREY_PNG } from '../data/greyPng';
import { KTX2_LEVEL0_INDEX } from '../data/ktx2Level0Index';

/** One r8 level through basisu as a 2D array of grey z-slices; returns the headerless blocks. */
export async function basisuEncodeLevel(
  r8: Uint8Array,
  dims: Vec3,
  format: 'astc6' | 'bc4',
): Promise<Uint8Array> {
  const [w, h, d] = dims;
  const dir = mkdtempSync(join(tmpdir(), 'volume-pyramid-'));
  try {
    const slices = Array.from({ length: d }, (_, z) => {
      const path = join(dir, `z${String(z).padStart(4, '0')}.png`);
      const data = Buffer.from(r8.buffer, r8.byteOffset + z * w * h, w * h);
      writeFileSync(path, PNG.sync.write({ width: w, height: h, data }, GREY_PNG));
      return path;
    });
    const { flags, ext } = BASISU_ARGS[format];
    const out = join(dir, `level.${ext}`);
    await promisify(execFile)(
      'basisu',
      [...flags, '-tex_type', '2darray', ...slices, '-output_file', out],
      { maxBuffer: 256 * 1024 * 1024 },
    );
    const file = readFileSync(out);
    if (format === 'bc4') return file.subarray(DDS_DX10_HEADER_BYTES);
    const offset = Number(file.readBigUInt64LE(KTX2_LEVEL0_INDEX));
    const length = Number(file.readBigUInt64LE(KTX2_LEVEL0_INDEX + 8));
    return file.subarray(offset, offset + length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
