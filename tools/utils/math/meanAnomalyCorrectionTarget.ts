/**
 * meanAnomalyCorrectionTarget — the ΔM (rad) that best aligns the app's conic with one Horizons
 * vector: Gauss–Newton on |kepler({...propagated, meanAnomalyRad: M + ΔM}) − horizonsKm|, seeded
 * by the in-plane angle between the two (about the orbit normal A×B). The seed is a true-anomaly
 * difference, close enough to ΔM for the iteration to land even half an orbit away. Returns the
 * value wrapped into [−π, π]; unwrapping across samples is the caller's job.
 */
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { cross3 } from '../../../src/utils/math/cross3';
import { dot3 } from '../../../src/utils/math/dot3';
import { keplerianEllipse } from '../../../src/utils/orbit/keplerianEllipse';
import { keplerianPositionMpc } from '../../../src/utils/orbit/keplerianPositionMpc';
import type { OrbitalElements } from '../../../src/@types/scene/OrbitalElements';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const MAX_ITERATIONS = 30;
const CONVERGED_RAD = 1e-13;
const DIFF_STEP_RAD = 1e-6;

export function meanAnomalyCorrectionTarget(propagated: OrbitalElements, horizonsKm: Vec3): number {
  const at = (dM: number): Vec3 => {
    const p = keplerianPositionMpc({
      ...propagated,
      meanAnomalyRad: propagated.meanAnomalyRad + dM,
    });
    return [
      p[0] / SCALE_UNITS.KM_TO_MPC,
      p[1] / SCALE_UNITS.KM_TO_MPC,
      p[2] / SCALE_UNITS.KM_TO_MPC,
    ];
  };
  const { semiMajorMpc, semiMinorMpc } = keplerianEllipse(propagated);
  const normal = cross3(semiMajorMpc, semiMinorMpc);
  const p0 = at(0);
  let dM = Math.atan2(
    dot3(normal, cross3(p0, horizonsKm)) / Math.hypot(...normal),
    dot3(p0, horizonsKm),
  );

  for (let it = 0; it < MAX_ITERATIONS; it++) {
    const p = at(dM);
    const plus = at(dM + DIFF_STEP_RAD);
    const minus = at(dM - DIFF_STEP_RAD);
    const g: Vec3 = [0, 1, 2].map((a) => (plus[a]! - minus[a]!) / (2 * DIFF_STEP_RAD)) as Vec3;
    const step =
      dot3([p[0] - horizonsKm[0], p[1] - horizonsKm[1], p[2] - horizonsKm[2]], g) / dot3(g, g);
    dM -= step;
    if (Math.abs(step) < CONVERGED_RAD) break;
  }
  return dM - 2 * Math.PI * Math.round(dM / (2 * Math.PI));
}
