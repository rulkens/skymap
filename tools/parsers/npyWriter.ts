/**
 * NumPy v1.0 .npy writer — the write-side mirror of `readNpy`
 * (tools/parsers/npyReader.ts:34). Produces exactly the subset that
 * reader accepts: C-order, little-endian, dtype '<f2' | '<f4' | '<f8'.
 *
 * Format spec: https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
 */

const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];

export function writeNpy(
  values: Uint16Array | Float32Array | Float64Array,
  shape: readonly number[],
  dtype: '<f2' | '<f4' | '<f8',
): ArrayBuffer {
  const expectedCount = shape.reduce((a, b) => a * b, 1);
  if (values.length !== expectedCount) {
    throw new Error(
      `writeNpy: values.length (${values.length}) does not match shape ${shape.join('x')} (expected ${expectedCount})`,
    );
  }
  const bytesPerElement = dtype === '<f2' ? 2 : dtype === '<f4' ? 4 : 8;
  const headerDict = `{'descr': '${dtype}', 'fortran_order': False, 'shape': (${shape.join(', ')}${shape.length === 1 ? ',' : ''}), }`;
  // NumPy requires the data start (10 + headerLen) to land on a 64-byte
  // boundary — mmap-friendly for third-party readers. readNpy doesn't
  // check this, but a writer that skips it produces files other tools
  // reject, so pad the header with spaces then a trailing newline.
  const unpadded = 10 + headerDict.length + 1;
  const dataStart = unpadded + ((64 - (unpadded % 64)) % 64);
  const headerLen = dataStart - 10;
  const headerStr = headerDict + ' '.repeat(headerLen - headerDict.length - 1) + '\n';

  const dataBytes = values.length * bytesPerElement;
  const buf = new ArrayBuffer(dataStart + dataBytes);
  const u8 = new Uint8Array(buf);
  u8.set(MAGIC);
  u8[6] = 1; // major version
  u8[7] = 0; // minor version
  new DataView(buf).setUint16(8, headerLen, true);
  for (let i = 0; i < headerStr.length; i++) u8[10 + i] = headerStr.charCodeAt(i);

  if (dtype === '<f2') {
    new Uint16Array(buf, dataStart, values.length).set(values as Uint16Array);
  } else if (dtype === '<f4') {
    new Float32Array(buf, dataStart, values.length).set(values as Float32Array);
  } else {
    new Float64Array(buf, dataStart, values.length).set(values as Float64Array);
  }
  return buf;
}
