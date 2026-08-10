/**
 * milkyWayModelMatrix places the GPU-generated Milky Way point cloud at the
 * galaxy's real-world position, in the galactic frame every frame consumer
 * shares. Two contracts hold this in place, guarded here rather than by the
 * compiler:
 *
 *   1. WESL ↔ registry parity: the shader's galactic basis literals (`GAL_X_EQ`
 *      etc. in `util.wesl`) must equal `ORIENTATION_FRAMES.galactic`
 *      (`data/orientation/orientationFrames`), scraped from `util.wesl` as
 *      text (see `constants.parity.test.ts`) rather than re-typed.
 *   2. The matrix's own placement: local +x → `GAL_X_EQ`, +y → `GAL_Z_EQ`
 *      (NGP), +z → `+GAL_Y_EQ` — a deliberate det −1 reflection that diverges
 *      from the registry's `−GAL_Y_EQ`; translation is the MW's world centre.
 *
 * Path resolves from `process.cwd()`, not `__dirname` (Vite/Vitest ESM).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Mat3 } from '../../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { MILKY_WAY_CENTER_WORLD } from '../../../../../src/data/milkyWay/galacticCenter';
import {
  GAL_X_EQ,
  GAL_Y_EQ,
  GAL_Z_EQ,
  ORIENTATION_FRAMES,
} from '../../../../../src/data/orientation/orientationFrames';
import { MILKY_WAY_MODEL_SCALE } from '../../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { milkyWayModelMatrix } from '../../../../../src/services/engine/galaxyGenerator/v1/milkyWayModelMatrix';

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

/** Column `c` (0-based) of a flat column-major `Mat3`. */
const col = (m: Mat3, c: number): Vec3 => [m[c * 3]!, m[c * 3 + 1]!, m[c * 3 + 2]!];

describe('util.wesl galactic basis ↔ orientation-frame registry', () => {
  it('the shader literals equal ORIENTATION_FRAMES.galactic (registry is the pinned TS copy)', () => {
    const scraped = scrapeGalacticBasis();
    const galactic = ORIENTATION_FRAMES.galactic;

    // The registry assembles the galactic frame as (GAL_X_EQ, GAL_Z_EQ,
    // −GAL_Y_EQ) — NGP into the middle (pole) column, the displaced +GAL_Y
    // negated so the basis stays a proper rotation (det +1). Checking the
    // scraped shader literals against those columns pins the WESL copy to the
    // registry; the sign on column 2 is load-bearing, so it is asserted.
    const c0 = col(galactic, 0);
    const pole = col(galactic, 1);
    const c2 = col(galactic, 2);
    for (let i = 0; i < 3; i++) {
      expect(c0[i], `galactic col0[${i}] = GAL_X_EQ`).toBeCloseTo(scraped.GAL_X_EQ[i]!, 8);
      expect(pole[i], `galactic pole[${i}] = GAL_Z_EQ (NGP)`).toBeCloseTo(scraped.GAL_Z_EQ[i]!, 8);
      expect(c2[i], `galactic col2[${i}] = −GAL_Y_EQ`).toBeCloseTo(-scraped.GAL_Y_EQ[i]!, 8);
    }
  });
});

describe('milkyWayModelMatrix', () => {
  const k = MILKY_WAY_MODEL_SCALE;

  it('rotation columns arrange the registry galactic basis (x=GC, y=NGP, z=rotation)', () => {
    const m = milkyWayModelMatrix();

    // The registry constants are what the shader is pinned to (parity test
    // above); this guards how milkyWayModelMatrix arranges them. Column 1 is
    // GAL_Z_EQ (NGP) — the easy-to-invert trap — and column 2 is +GAL_Y_EQ,
    // the deliberate det −1 reflection that diverges from the registry's
    // −GAL_Y_EQ. Both the ordering and that sign are hand-written here, so
    // neither is compiler-checked.

    // Column 0 (local +x, toward the Galactic Centre) = GAL_X_EQ * k.
    expect(m[0]).toBeCloseTo(GAL_X_EQ[0] * k, 8);
    expect(m[1]).toBeCloseTo(GAL_X_EQ[1] * k, 8);
    expect(m[2]).toBeCloseTo(GAL_X_EQ[2] * k, 8);

    // Column 1 (local +y, disk normal) = GAL_Z_EQ * k — the disk normal is the
    // galactic Z axis (NGP), not Y.
    expect(m[4]).toBeCloseTo(GAL_Z_EQ[0] * k, 8);
    expect(m[5]).toBeCloseTo(GAL_Z_EQ[1] * k, 8);
    expect(m[6]).toBeCloseTo(GAL_Z_EQ[2] * k, 8);

    // Column 2 (local +z, in-disk rotation direction) = +GAL_Y_EQ * k.
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
