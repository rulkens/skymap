/**
 * The `.npy` v1 header from a file's leading bytes, so a multi-GB file can be read in slabs
 * instead of whole. Format: https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
 */
import type { NpyHeader } from '../@types/parsers/NpyHeader';

const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];
const HEADER_START = 10;

export function readNpyHeader(bytes: Uint8Array): NpyHeader {
  if (bytes.length < HEADER_START) throw new Error('readNpyHeader: too few bytes for the preamble');
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) {
      throw new Error(
        `readNpyHeader: bad magic at offset ${i} (got 0x${bytes[i]!.toString(16)}, expected 0x${MAGIC[i]!.toString(16)})`,
      );
    }
  }
  const major = bytes[6]!;
  if (major !== 1) {
    throw new Error(
      `readNpyHeader: unsupported .npy version ${major}.${bytes[7]} (only v1.x supported)`,
    );
  }
  const headerLen = bytes[8]! | (bytes[9]! << 8);
  const dataOffset = HEADER_START + headerLen;
  if (bytes.length < dataOffset) {
    throw new Error(
      `readNpyHeader: too few bytes for the header (${bytes.length} < ${dataOffset})`,
    );
  }
  const dict = new TextDecoder('ascii').decode(bytes.subarray(HEADER_START, dataOffset)).trim();
  // A Python dict literal; the three keys are all we read.
  const descr = dict.match(/'descr':\s*'([^']+)'/);
  const fortran = dict.match(/'fortran_order':\s*(True|False)/);
  const shape = dict.match(/'shape':\s*\(([^)]*)\)/);
  if (!descr || !fortran || !shape)
    throw new Error(`readNpyHeader: malformed header dict: ${dict}`);
  if (fortran[1] === 'True') {
    throw new Error('readNpyHeader: fortran_order arrays are not supported (only C-order)');
  }
  return {
    dtype: descr[1]!,
    shape: shape[1]!
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number.parseInt(s, 10)),
    dataOffset,
  };
}
