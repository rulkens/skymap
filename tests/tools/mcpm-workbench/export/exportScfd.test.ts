/**
 * exportScfd — MAJOR-2 fix pin (review-final.md). A rotated `GridBox` must
 * round-trip through the `.scfd` header's own rotation slot, not the
 * frame-conversion identity `buildRhizomeVolume.ts` ships. See
 * `buildCubeModelMatrix.ts`: `box.rotation` composes on top of
 * `FRAME_TO_WORLD['equatorial-cartesian']` (identity for this leg), so
 * writing it is single-apply, not compounding.
 */
import { describe, expect, it } from 'vitest';
import { decodeScalarField } from '../../../../src/data/volume/scalarFieldFormat';
import { exportScfd } from '../../../../tools/mcpm-workbench/src/export/exportScfd';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';

describe('exportScfd', () => {
  it('writes the box rotation into the header, not identity', () => {
    const box: GridBox = {
      centerMpc: [0, 0, 0],
      sizeMpc: [16, 16, 16],
      dims: [8, 8, 8],
      voxelSizeMpc: 2,
      // 90° about Y: [0, sin(45°), 0, cos(45°)]
      rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
    };
    const values = new Float32Array(8 * 8 * 8);

    const buf = exportScfd(values, box);
    const cube = decodeScalarField(buf);

    // f32 header slot: exact equality would fail on the round-trip's
    // f64 → f32 → f64 precision loss, not the value itself.
    cube.rotation.forEach((v, i) => expect(v).toBeCloseTo(box.rotation[i]!, 6));
  });
});
