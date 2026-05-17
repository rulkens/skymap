/**
 * One-shot generator for the SCFD format's regression fixture.
 *
 * Run manually: `npx tsx tools/buildScalarVolumeFixture.ts`.
 *
 * Re-run only when:
 *   - SCFD version bumps (the fixture must match the current decoder)
 *   - The fixture's content needs to change for new test coverage
 *
 * The output bytes are checked into git at the path below.  Tests
 * round-trip them through `decodeScalarField` to detect drift between
 * the encoder and the on-disk byte format.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { encodeScalarField } from '../../src/data/scalarFieldFormat';
import type { ScalarCube } from '../../src/@types/data/ScalarCube';

const OUT = 'tests/fixtures/scalar-volume/tiny-8x8x8.scfd';

// 8×8×8 = 512 voxels.  Each voxel = its linear index, stored as raw
// uint16 (NOT a real f16 encoding — we just need a deterministic byte
// pattern the decoder can read back without needing to compute f16
// values for the assertion).  The fixture's purpose is structural
// (header bytes + voxel byte order), not numerical.
const voxels = new Uint16Array(8 * 8 * 8);
for (let i = 0; i < voxels.length; i++) voxels[i] = i;

// Note: SCFD v2 removed `paletteId` and `densityScale` from `ScalarCube`
// (palette/scale belong on the consumer side, not in the binary).  The
// fixture stays minimal — header + raw voxel bytes.
const cube: ScalarCube = {
  dims: [8, 8, 8],
  voxels,
  frameKind: 'equatorial-cartesian',
  origin: [-200, -200, -200],
  voxelSize: 50,
  rotation: [0, 0, 0, 1],
  valueMin: 0,
  valueMax: 1,
};

const buf = encodeScalarField(cube);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(buf));
console.log(`Wrote ${buf.byteLength} bytes to ${OUT}`);
