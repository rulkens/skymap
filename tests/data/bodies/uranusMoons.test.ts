import { describe, it, expect } from 'vitest';
import { elementsById } from '../../../src/data/bodies/orbitalElements';
import { propagateElements } from '../../../src/utils/orbit/propagateElements';
import { keplerianPositionMpc } from '../../../src/utils/orbit/keplerianPositionMpc';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// JPL Horizons, position relative to Uranus centre (500@799), ICRF equatorial axes (the scene's
// world frame), JD 2451545.0 TDB, km. External contract: a pole on the wrong side of the sky
// (IAU north instead of the angular-momentum pole) runs every orbit backwards and misses by
// tens of degrees. Mean elements are not osculating, hence the loose bounds.
const HORIZONS_KM: Record<string, Vec3> = {
  miranda: [-104329.532, 34868.033, -68865.437],
  ariel: [175677.936, -19272.292, -72960.037],
  umbriel: [100010.324, 45083.264, -242317.517],
  titania: [-63107.002, 128000.323, -411987.194],
  oberon: [-560569.96, 144960.989, -72810.14],
  puck: [5145.623, 21636.616, -82311.82],
};
const MAX_ANGLE_DEG = 4;
const MAX_RANGE_ERR = 0.01;

describe('Uranus moons at J2000', () => {
  it.each(Object.keys(HORIZONS_KM))('%s sits where Horizons puts it', (id) => {
    const p = keplerianPositionMpc(propagateElements(elementsById(id), CONST_J2000));
    const km = p.map((v) => v / SCALE_UNITS.KM_TO_MPC);
    const ref = HORIZONS_KM[id]!;
    const dot = km[0]! * ref[0] + km[1]! * ref[1] + km[2]! * ref[2];
    const angleDeg =
      (Math.acos(dot / (Math.hypot(km[0]!, km[1]!, km[2]!) * Math.hypot(...ref))) * 180) / Math.PI;
    const rangeErr = Math.hypot(...km) / Math.hypot(...ref) - 1;
    expect(angleDeg, `${id} angle`).toBeLessThan(MAX_ANGLE_DEG);
    expect(Math.abs(rangeErr), `${id} range`).toBeLessThan(MAX_RANGE_ERR);
  });
});
