import type { GroundSample } from '../../../textures/@types/GroundSample';
import type { SiteSeat } from '../../../textures/@types/SiteSeat';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { seatHeightM } from './seatHeightM';

/** Below this, the contacts' spread is a line (or a point) and the cross-slope is unconstrained. */
const COLLINEAR_RATIO = 1e-6;

/**
 * contactPlaneSeat — the seat for a body resting on `contacts`: the
 * least-squares plane z = a + b·east + c·north through the ground under them
 * gives the up, normalize(−b, −c, 1), and the plane's height at the body
 * centre. Null for fewer than three contacts or a collinear set.
 */
export function contactPlaneSeat(
  contacts: readonly GroundSample[],
  liftM: number,
): SiteSeat | null {
  const n = contacts.length;
  if (n < 3) return null;
  const meanE = contacts.reduce((s, p) => s + p.eastM, 0) / n;
  const meanN = contacts.reduce((s, p) => s + p.northM, 0) / n;
  const meanH = contacts.reduce((s, p) => s + p.heightM, 0) / n;
  let ee = 0;
  let en = 0;
  let nn = 0;
  let eh = 0;
  let nh = 0;
  for (const p of contacts) {
    const e = p.eastM - meanE;
    const no = p.northM - meanN;
    const h = p.heightM - meanH;
    ee += e * e;
    en += e * no;
    nn += no * no;
    eh += e * h;
    nh += no * h;
  }
  const det = ee * nn - en * en;
  if (det <= COLLINEAR_RATIO * (ee + nn) ** 2) return null;
  const b = (eh * nn - nh * en) / det;
  const c = (nh * ee - eh * en) / det;
  const up = normalize3([-b, -c, 1]);
  // The body tilts about its lifted origin, so seatHeightM adds that pivot's sink back.
  const centreM = meanH - b * meanE - c * meanN;
  return { heightM: seatHeightM([{ eastM: 0, northM: 0, heightM: centreM }], up, liftM), up };
}
