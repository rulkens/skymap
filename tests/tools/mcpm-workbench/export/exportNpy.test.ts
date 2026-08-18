/**
 * exportNpy — the T19 gate fix: a hand-built x-fastest readback (grid.wesl's
 * GPU layout) must round-trip through `exportNpy` + `readNpy` in NumPy
 * C-order, the byte order `buildRhizomeVolume.ts`'s default
 * `packLogTraceVoxels` call expects. Non-cubic dims (2x3x4) so an
 * unpermuted X<->Z swap bug — the exact regression this test guards
 * against — cannot pass by coincidence.
 */
import { describe, expect, it } from 'vitest';
import { readNpy } from '../../../../tools/parsers/npyReader';
import { exportNpy } from '../../../../tools/mcpm-workbench/src/export/exportNpy';
import type { TraceReadback } from '../../../../tools/mcpm-workbench/@types/TraceReadback';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// x-fastest per grid.wesl: raw offset for logical (i, j, k) is
// k*Ny*Nx + j*Nx + i. Tags each cell with a value unique to its (i,j,k) so
// a wrong permutation (including a clean X<->Z swap) is caught, not just a
// wrong total.
function buildXFastestReadback(dims: Vec3): TraceReadback {
  const [nx, ny, nz] = dims;
  const data = new Uint16Array(nx * ny * nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        data[k * ny * nx + j * nx + i] = i * 100 + j * 10 + k;
      }
    }
  }
  return { data, element: 'f16', dims };
}

describe('exportNpy', () => {
  it('writes a .npy whose bytes are C-order, not a straight copy of the x-fastest readback', () => {
    const dims: Vec3 = [2, 3, 4];
    const readback = buildXFastestReadback(dims);

    const buf = exportNpy(readback);
    const npy = readNpy(buf);

    expect(npy.dtype).toBe('<f2');
    expect(npy.shape).toEqual([2, 3, 4]);

    const [nx, ny, nz] = dims;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          // C-order: axis 0 slowest, axis 2 fastest.
          const cOrderIdx = i * ny * nz + j * nz + k;
          expect(npy.values[cOrderIdx]).toBe(i * 100 + j * 10 + k);
        }
      }
    }
  });

  it('preserves raw f16 bits verbatim (permutation only, no value transform)', () => {
    const dims: Vec3 = [2, 2, 2];
    const data = new Uint16Array([0x3c00, 0x4000, 0x4200, 0x4400, 0x4500, 0x4600, 0x4700, 0x4800]);
    const readback: TraceReadback = { data, element: 'f16', dims };

    const npy = readNpy(exportNpy(readback));
    const sorted = [...npy.values].sort((a, b) => a - b);
    expect(sorted).toEqual([...data].sort((a, b) => a - b));
  });
});
