/**
 * Minimal NumPy v1.0 .npy reader for flat C-order f64 / f32 / f16 arrays: the CF4++ release
 * `d_mean_CF4pp.npy` is f64, older reconstructions and the test fixtures f32, and the SCFD
 * encoder's own output f16. Hand-rolled because the v1 format is a few dozen lines and the npm
 * readers bring numerical stacks `tools/` does not need.
 * Format: https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
 */
import type { NpyArray } from '../@types/parsers/NpyArray';
import { readNpyHeader } from './readNpyHeader';

export function readNpy(buf: ArrayBuffer): NpyArray {
  const { dtype, shape: headerShape, dataOffset: dataStart } = readNpyHeader(new Uint8Array(buf));
  const shape = [...headerShape];
  const expectedCount = shape.reduce((a, b) => a * b, 1);
  if (dtype === '<f8') {
    // Kept f64 so the build script decides where precision is lost (e.g. averaging cubes first).
    const expectedBytes = expectedCount * 8;
    if (buf.byteLength - dataStart !== expectedBytes) {
      throw new Error(
        `readNpy: f64 byte count mismatch (${buf.byteLength - dataStart} bytes after header, expected ${expectedBytes} for shape ${shape.join('x')})`,
      );
    }
    const values = new Float64Array(buf.slice(dataStart, dataStart + expectedBytes));
    return { dtype, shape, values };
  }
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
  throw new Error(`readNpy: unsupported dtype "${dtype}" (only '<f8', '<f4', and '<f2' supported)`);
}
