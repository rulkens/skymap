/**
 * Minimal NumPy v1.0 .npy reader. Only enough to read flat C-order
 * f32 / f16 arrays — which is all the CF-4 ingest pipeline emits.
 *
 * Format spec: https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
 *
 * Why hand-roll instead of adding a dep: the v1 format is ~50 LOC of
 * parsing; the npm packages that read it bring in heavier numerical
 * stacks for features we don't use. Keeps `tools/` zero-dep beyond
 * what's already there.
 */

export type NpyArray = {
  /** dtype string from the header, e.g. '<f4'. */
  dtype: string;
  /** Shape tuple, e.g. [256, 256, 256]. */
  shape: number[];
  /**
   * Decoded values. f32 → Float32Array; f16 → Uint16Array (raw f16
   * bits, the same shape consumed by SCFD encode).
   */
  values: Float32Array | Uint16Array;
};

const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];

export function readNpy(buf: ArrayBuffer): NpyArray {
  const u8 = new Uint8Array(buf);
  if (u8.length < 10) throw new Error('readNpy: buffer too small for .npy header');
  for (let i = 0; i < 6; i++) {
    // noUncheckedIndexedAccess: both sides are `number | undefined` at these
    // in-range indices. Non-null assertions are safe — we checked u8.length
    // above and MAGIC has exactly 6 elements.
    if (u8[i]! !== MAGIC[i]!) {
      throw new Error(
        `readNpy: bad magic at offset ${i} (got 0x${u8[i]!.toString(16)}, expected 0x${MAGIC[i]!.toString(16)})`,
      );
    }
  }
  const major = u8[6]!;
  const minor = u8[7]!;
  if (major !== 1) {
    throw new Error(`readNpy: unsupported .npy version ${major}.${minor} (only v1.x supported)`);
  }
  const dv = new DataView(buf);
  const headerLen = dv.getUint16(8, true);
  const headerStart = 10;
  const headerBytes = u8.slice(headerStart, headerStart + headerLen);
  const headerStr = new TextDecoder('ascii').decode(headerBytes).trim();
  // Header is a Python-style dict literal; we don't need full parsing —
  // three regex extractions cover everything we use.
  const descrMatch = headerStr.match(/'descr':\s*'([^']+)'/);
  const fortranMatch = headerStr.match(/'fortran_order':\s*(True|False)/);
  const shapeMatch = headerStr.match(/'shape':\s*\(([^)]*)\)/);
  if (!descrMatch || !fortranMatch || !shapeMatch) {
    throw new Error(`readNpy: malformed header dict: ${headerStr}`);
  }
  const dtype = descrMatch[1]!;
  if (fortranMatch[1] === 'True') {
    throw new Error('readNpy: fortran_order arrays are not supported (only C-order)');
  }
  const shape = shapeMatch[1]!
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number.parseInt(s, 10));
  const dataStart = headerStart + headerLen;
  const expectedCount = shape.reduce((a, b) => a * b, 1);
  if (dtype === '<f4') {
    const expectedBytes = expectedCount * 4;
    if (buf.byteLength - dataStart !== expectedBytes) {
      throw new Error(
        `readNpy: f32 byte count mismatch (${buf.byteLength - dataStart} bytes after header, expected ${expectedBytes} for shape ${shape.join('x')})`,
      );
    }
    const values = new Float32Array(buf.slice(dataStart, dataStart + expectedBytes));
    return { dtype, shape, values };
  }
  if (dtype === '<f2') {
    const expectedBytes = expectedCount * 2;
    if (buf.byteLength - dataStart !== expectedBytes) {
      throw new Error(
        `readNpy: f16 byte count mismatch (${buf.byteLength - dataStart} bytes after header, expected ${expectedBytes} for shape ${shape.join('x')})`,
      );
    }
    const values = new Uint16Array(buf.slice(dataStart, dataStart + expectedBytes));
    return { dtype, shape, values };
  }
  throw new Error(`readNpy: unsupported dtype "${dtype}" (only '<f4' and '<f2' supported)`);
}
