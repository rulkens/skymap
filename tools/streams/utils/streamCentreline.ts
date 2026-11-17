import type { Vec3 } from '../../../src/@types/math/Vec3';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { maxDistanceToPolyline } from '../../utils/math/maxDistanceToPolyline';
import { simplifyPolyline } from '../../utils/math/simplifyPolyline';
import type { StreamCentreline } from '../@types/StreamCentreline';
import { CENTRELINE_MAX_POINTS } from '../data/streamsBuild.constants';

/**
 * A stream's pick centreline, Mpc rounded to 0.1 pc: its kpc track simplified toward half its
 * width, at most `CENTRELINE_MAX_POINTS`. Where the cap leaves the track farther out than that,
 * the ribbon widens to the measured gap, so the drawn stream always takes the click.
 */
export function streamCentreline(
  trackKpc: readonly Readonly<Vec3>[],
  widthKpc: number,
): StreamCentreline {
  const centrelineMpc = simplifyPolyline(trackKpc, widthKpc / 2, CENTRELINE_MAX_POINTS).map(
    (p) => p.map((kpc) => Math.round(kpc * 1e4) / 1e7) as Vec3,
  );
  const lineKpc = centrelineMpc.map((p) => p.map((mpc) => mpc / SCALE_UNITS.KPC_TO_MPC) as Vec3);
  const gapKpc = maxDistanceToPolyline(trackKpc, lineKpc);
  return { centrelineMpc, ribbonWidthKpc: 2 * Math.max(widthKpc / 2, gapKpc) };
}
