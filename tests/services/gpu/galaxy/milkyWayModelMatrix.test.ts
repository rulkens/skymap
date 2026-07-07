/**
 * milkyWayModelMatrix places the GPU-generated Milky Way point cloud at the
 * galaxy's real world position, in the exact frame the old impostor rendered
 * in. Two things have to stay pinned for that placement to be correct, and a
 * test — not the compiler — is what keeps them from drifting:
 *
 *   1. The rotation columns ARE the WESL galactic basis (`GAL_X_EQ` etc.),
 *      swizzled so local +y is the disk normal (NGP). We scrape those literals
 *      straight out of `util.wesl` (the `constants.parity.test.ts` pattern —
 *      read the `.wesl` as text, regex the `vec3<f32>(...)` literal, `parseFloat`)
 *      rather than re-typing them here, so the shader and the model matrix can
 *      never quietly disagree about which way the disk points.
 *   2. The translation lanes are the Milky Way's world centre.
 *
 * Path is resolved from `process.cwd()` (repo root under Vitest), matching the
 * convention `constants.parity.test.ts` documents — `__dirname` would not work
 * under the Vite/Vitest ESM runner.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { MILKY_WAY_CENTER_WORLD } from '../../../../src/data/milkyWay/galacticCenter';
import { MILKY_WAY_MODEL_SCALE } from '../../../../src/services/gpu/galaxy/milkyWayCalibration';
import { milkyWayModelMatrix } from '../../../../src/services/gpu/galaxy/milkyWayModelMatrix';

/**
 * Scrape the three galactic basis vectors from `util.wesl`. Each is declared
 * `const GAL_?_EQ = vec3<f32>(x, y, z);` — the literals carry mixed sign and
 * padding whitespace (`vec3<f32>( 0.494109, ...`), so the regex tolerates
 * optional spaces and a leading minus.
 */
function scrapeGalacticBasis(): Record<'GAL_X_EQ' | 'GAL_Y_EQ' | 'GAL_Z_EQ', Vec3> {
  const path = join(process.cwd(), 'src/services/gpu/shaders/lib/util.wesl');
  const text = readFileSync(path, 'utf-8');
  const re =
    /const\s+(GAL_[XYZ]_EQ)\s*=\s*vec3<f32>\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*\)/g;
  const out: Partial<Record<string, Vec3>> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out[m[1]!] = [parseFloat(m[2]!), parseFloat(m[3]!), parseFloat(m[4]!)];
  }
  const basis = out as Record<'GAL_X_EQ' | 'GAL_Y_EQ' | 'GAL_Z_EQ', Vec3>;
  expect(basis.GAL_X_EQ, 'GAL_X_EQ missing from util.wesl').toBeDefined();
  expect(basis.GAL_Y_EQ, 'GAL_Y_EQ missing from util.wesl').toBeDefined();
  expect(basis.GAL_Z_EQ, 'GAL_Z_EQ missing from util.wesl').toBeDefined();
  return basis;
}

describe('milkyWayModelMatrix', () => {
  const k = MILKY_WAY_MODEL_SCALE;

  it('rotation columns are the WESL galactic basis, swizzled (x=GC, y=NGP, z=rotation)', () => {
    const { GAL_X_EQ, GAL_Y_EQ, GAL_Z_EQ } = scrapeGalacticBasis();
    const m = milkyWayModelMatrix();

    // Column 0 (local +x, toward the Galactic Centre) = GAL_X_EQ * k.
    expect(m[0]).toBeCloseTo(GAL_X_EQ[0] * k, 8);
    expect(m[1]).toBeCloseTo(GAL_X_EQ[1] * k, 8);
    expect(m[2]).toBeCloseTo(GAL_X_EQ[2] * k, 8);

    // Column 1 (local +y, disk normal) = GAL_Z_EQ * k — the swizzle: the disk
    // normal is the galactic Z axis (NGP), not Y.
    expect(m[4]).toBeCloseTo(GAL_Z_EQ[0] * k, 8);
    expect(m[5]).toBeCloseTo(GAL_Z_EQ[1] * k, 8);
    expect(m[6]).toBeCloseTo(GAL_Z_EQ[2] * k, 8);

    // Column 2 (local +z, in-disk rotation direction) = GAL_Y_EQ * k.
    expect(m[8]).toBeCloseTo(GAL_Y_EQ[0] * k, 8);
    expect(m[9]).toBeCloseTo(GAL_Y_EQ[1] * k, 8);
    expect(m[10]).toBeCloseTo(GAL_Y_EQ[2] * k, 8);
  });

  it('translation lanes are MILKY_WAY_CENTER_WORLD', () => {
    const m = milkyWayModelMatrix();
    expect(m[12]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[0], 8);
    expect(m[13]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[1], 8);
    expect(m[14]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[2], 8);
  });

  it('a local +y unit vector lands on the NGP direction scaled by k, offset by the centre', () => {
    const { GAL_Z_EQ } = scrapeGalacticBasis();
    const m = milkyWayModelMatrix();

    // Transform the point [0,1,0] (column-major, w = 1):
    //   result[i] = col0[i]*0 + col1[i]*1 + col2[i]*0 + col3[i]*1
    const p: Vec3 = [0, 1, 0];
    const out: Vec3 = [
      m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
      m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
      m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
    ];

    expect(out[0]).toBeCloseTo(GAL_Z_EQ[0] * k + MILKY_WAY_CENTER_WORLD[0], 8);
    expect(out[1]).toBeCloseTo(GAL_Z_EQ[1] * k + MILKY_WAY_CENTER_WORLD[1], 8);
    expect(out[2]).toBeCloseTo(GAL_Z_EQ[2] * k + MILKY_WAY_CENTER_WORLD[2], 8);
  });

  it('bottom row is 0, 0, 0, 1', () => {
    const m = milkyWayModelMatrix();
    expect(m[3]).toBe(0);
    expect(m[7]).toBe(0);
    expect(m[11]).toBe(0);
    expect(m[15]).toBe(1);
  });
});
