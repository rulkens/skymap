import { describe, it, expect } from 'vitest';
import { elementsById } from '../../../src/data/bodies/orbitalElements';
import { propagateElements } from '../../../src/utils/orbit/propagateElements';
import { keplerianPositionMpc } from '../../../src/utils/orbit/keplerianPositionMpc';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// JPL Horizons, position relative to Neptune centre (500@899), ICRF equatorial axes (the scene's
// world frame), km. External contract: Nereid is given on the ecliptic at 2020, so a wrong plane
// or epoch shows up as tens of degrees. Mean elements are not osculating, hence the loose bounds:
// the Sun perturbs it. Triton and Proteus are pinned in `ephemerisCorrections.test.ts`.
const JD = { j2000: 2451545.0, voyager: 2447763.5, now: 2461318.5 };
const HORIZONS_KM: Record<string, Record<keyof typeof JD, Vec3>> = {
  nereid: {
    j2000: [893764.5622070211, 8278569.61123076, 4329907.699022511],
    voyager: [4149828.930011556, 1780865.269851427, 1185080.230387541],
    now: [-1066087.5536643, 7069677.499115557, 3575544.128237794],
  },
};
const MAX_ANGLE_DEG: Record<string, number> = { nereid: 0.5 };
const MAX_RANGE_ERR: Record<string, number> = { nereid: 0.015 };

describe('Neptune moons against Horizons', () => {
  const cases = Object.keys(HORIZONS_KM).flatMap((id) =>
    (Object.keys(JD) as (keyof typeof JD)[]).map((when) => [id, when] as const),
  );
  it.each(cases)('%s at %s sits where Horizons puts it', (id, when) => {
    const p = keplerianPositionMpc(propagateElements(elementsById(id), JD[when]));
    const km = p.map((v) => v / SCALE_UNITS.KM_TO_MPC);
    const ref = HORIZONS_KM[id]![when];
    const dot = km[0]! * ref[0] + km[1]! * ref[1] + km[2]! * ref[2];
    const angleDeg =
      (Math.acos(dot / (Math.hypot(km[0]!, km[1]!, km[2]!) * Math.hypot(...ref))) * 180) / Math.PI;
    const rangeErr = Math.hypot(...km) / Math.hypot(...ref) - 1;
    expect(angleDeg, `${id} ${when} angle`).toBeLessThan(MAX_ANGLE_DEG[id]!);
    expect(Math.abs(rangeErr), `${id} ${when} range`).toBeLessThan(MAX_RANGE_ERR[id]!);
  });
});
