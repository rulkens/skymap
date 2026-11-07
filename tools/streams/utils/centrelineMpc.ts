import type { Vec3 } from '../../../src/@types/math/Vec3';
import { cumulativeLengths } from '../../utils/math/cumulativeLengths';
import { simplifyPolyline } from '../../utils/math/simplifyPolyline';
import { CENTRELINE_LENGTH_TOLERANCE } from '../data/streamsBuild.constants';

/** A stream's pick centreline, Mpc rounded to 0.1 pc: its kpc track simplified (Douglas–Peucker). */
export function centrelineMpc(pointsKpc: readonly Readonly<Vec3>[], widthKpc: number): Vec3[] {
  const lengthKpc = cumulativeLengths(pointsKpc).at(-1)!;
  const tolerance = Math.max(widthKpc / 2, CENTRELINE_LENGTH_TOLERANCE * lengthKpc);
  return simplifyPolyline(pointsKpc, tolerance).map(
    (p) => p.map((kpc) => Math.round(kpc * 1e4) / 1e7) as Vec3,
  );
}
