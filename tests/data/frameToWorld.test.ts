/**
 * FRAME_TO_WORLD — pins the galactic entry against the published J2000
 * galactic pole/centre positions (the values `superGalacticTransform.ts`
 * itself is built from), so a rotation-convention regression fails loudly
 * rather than silently mis-placing the Local Bubble shell.
 */
import { describe, expect, it } from 'vitest';
import { vec3 } from 'wgpu-matrix';

import { FRAME_TO_WORLD } from '../../src/data/frameToWorld';
import { angleBetween } from '../helpers/math/angleBetween';

const RAD = Math.PI / 180;

function raDecToUnitVec(raDeg: number, decDeg: number): [number, number, number] {
  const ra = raDeg * RAD;
  const dec = decDeg * RAD;
  return [Math.cos(ra) * Math.cos(dec), Math.sin(ra) * Math.cos(dec), Math.sin(dec)];
}

describe('FRAME_TO_WORLD.galactic', () => {
  it('maps the galactic north pole to J2000 RA 192.85948°, Dec +27.12825°', () => {
    const galNorthPole = vec3.create(0, 0, 1);
    const eq = vec3.transformMat4(galNorthPole, FRAME_TO_WORLD.galactic);
    const expected = raDecToUnitVec(192.85948, 27.12825);
    expect(angleBetween([eq[0]!, eq[1]!, eq[2]!], expected)).toBeLessThan(1e-5);
  });

  it('maps galactic l=0, b=0 to RA 266.40499°, Dec −28.93617°', () => {
    const galCentre = vec3.create(1, 0, 0);
    const eq = vec3.transformMat4(galCentre, FRAME_TO_WORLD.galactic);
    const expected = raDecToUnitVec(266.40499, -28.93617);
    expect(angleBetween([eq[0]!, eq[1]!, eq[2]!], expected)).toBeLessThan(1e-5);
  });
});
