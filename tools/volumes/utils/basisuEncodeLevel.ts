import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// basisu flags as the spike measured them (spec §5); never hand-fill a block, since an all-zero
// ASTC block decodes as an error block.
const BASISU_ARGS = {
  bc4: { flags: ['-dds', '-dds_format', 'BC4', '-linear'], ext: 'dds' },
  astc6: { flags: ['-ldr_6x6', '-tl', '-effort', '3', '-ktx2_no_zstandard'], ext: 'ktx2' },
} as const;
const DDS_DX10_HEADER_BYTES = 148; // magic 4 + DDS_HEADER 124 + DDS_HEADER_DXT10 20
const KTX2_LEVEL0_INDEX = 80; // after the 48 B header and the 32 B dfd/kvd/sgd index
const GREY = { colorType: 0, inputColorType: 0 } as const; // one byte per texel in, as stored

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
      writeFileSync(path, PNG.sync.write({ width: w, height: h, data }, GREY));
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
