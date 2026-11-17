/**
 * Sagittarius's centrelines from the full snapshot (it has no track). Method: the orbital plane's
 * normal is the snapshot's total angular momentum about the Galactic centre; stripped stars split
 * into arms by orbital energy against the remnant's (`SGR_ARM_SPLIT_V0_KMS`); each arm bins by
 * in-plane angle from the remnant, unwrapped past ±180° so its far wrap stays at its end, and each
 * bin's mean heliocentric position is a point. The bound remnant's mean heads both arms.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { cross3 } from '../../../src/utils/math/cross3';
import { distance3 } from '../../../src/utils/math/distance3';
import { dot3 } from '../../../src/utils/math/dot3';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { raDecDistToEqCart } from '../../../src/utils/math/raDecDistToEqCart';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { meanPoint3 } from '../../utils/math/meanPoint3';
import { median } from '../../utils/perf/median';
import { percentile } from '../../utils/perf/percentile';
import type { SagittariusCentrelines } from '../@types/SagittariusCentrelines';
import type { VasilievStar } from '../@types/VasilievStar';
import {
  SGR_ARM_BIN_MIN,
  SGR_ARM_BINS,
  SGR_ARM_EXTENT_PERCENTILE,
  SGR_ARM_SPLIT_V0_KMS,
} from '../data/streamsBuild.constants';

export function sagittariusCentrelines(stars: readonly VasilievStar[]): SagittariusCentrelines {
  const galactic = (s: VasilievStar): Vec3 => [s.x, s.y, s.z];
  const helioKpc = (s: VasilievStar): Vec3 =>
    raDecDistToEqCart({
      raHours: s.ra / 15,
      decDeg: s.dec,
      distMpc: s.distanceKpc * SCALE_UNITS.KPC_TO_MPC,
    }).map((mpc) => mpc / SCALE_UNITS.KPC_TO_MPC) as Vec3;
  const energy = (s: VasilievStar): number =>
    0.5 * (s.vx ** 2 + s.vy ** 2 + s.vz ** 2) +
    SGR_ARM_SPLIT_V0_KMS ** 2 * Math.log(Math.hypot(s.x, s.y, s.z));

  const bound = stars.filter((s) => s.tStripGyr === 0);
  const remnantEnergy = bound.reduce((sum, s) => sum + energy(s), 0) / bound.length;
  const normal = normalize3(
    stars.reduce<Vec3>(
      (l, s) => {
        const [x, y, z] = cross3(galactic(s), [s.vx, s.vy, s.vz]);
        return [l[0] + x, l[1] + y, l[2] + z];
      },
      [0, 0, 0],
    ),
  );
  const toRemnant = meanPoint3(bound.map(galactic));
  const inPlane = dot3(toRemnant, normal);
  const e1 = normalize3(toRemnant.map((v, c) => v - inPlane * normal[c]!) as Vec3);
  // normal × r points along the motion, so +angle is ahead of the remnant.
  const e2 = cross3(normal, e1);
  const remnantKpc = meanPoint3(bound.map(helioKpc));

  const spreads: number[] = [];
  const arm = (leading: boolean): Vec3[] => {
    const members = stars.flatMap((s) => {
      const moreBound = energy(s) < remnantEnergy;
      if (s.tStripGyr === 0 || moreBound !== leading) return [];
      const p = galactic(s);
      let angle = (leading ? 1 : -1) * Math.atan2(dot3(p, e2), dot3(p, e1));
      if (angle < -Math.PI / 2) angle += 2 * Math.PI;
      // Written so a NaN angle (a degenerate snapshot) is dropped too.
      return angle > 0 ? [{ angle, s }] : [];
    });
    if (members.length === 0) return [remnantKpc];
    const extent = percentile(
      members.map((m) => m.angle),
      SGR_ARM_EXTENT_PERCENTILE,
    );
    const bins = Array.from({ length: SGR_ARM_BINS }, (): Vec3[] => []);
    for (const { angle, s } of members) {
      if (angle > extent) continue;
      const bin = Math.min(SGR_ARM_BINS - 1, Math.floor((angle / extent) * SGR_ARM_BINS));
      bins[bin]!.push(helioKpc(s));
    }
    const points = bins
      .filter((b) => b.length >= SGR_ARM_BIN_MIN)
      .map((b) => {
        const centre = meanPoint3(b);
        const rms = Math.sqrt(b.reduce((sum, p) => sum + distance3(p, centre) ** 2, 0) / b.length);
        spreads.push(rms);
        return centre;
      });
    return [remnantKpc, ...points];
  };
  const leadingKpc = arm(true);
  const trailingKpc = arm(false);
  return { leadingKpc, trailingKpc, widthKpc: spreads.length > 0 ? median(spreads) : 0 };
}
