/**
 * foldBoostIntoSlab — `slab` with its vp folded on the right by the boost's Lorentz contraction,
 * vp · C, with C built in the slab's own frame so the ship stays the fixed point on every slab:
 * COSMO is absolute world Mpc, NEAR0 is world Mpc less `RENDER_ORIGIN_MPC`, and a `body-m` row is
 * metres about the view's eye on its host's fixed axes (`bodyRelativePose`), so there both the
 * ship and `dir` turn by the host orientationᵀ. Returns `slab` itself, untouched, for the rest
 * frame or with contraction off — the "no boost is bitwise unchanged" contract.
 */

import { mat4d } from 'wgpu-matrix';
import type { FrameBoost } from '../../@types/engine/frame/FrameBoost';
import type { Slab } from '../../@types/engine/frame/Slab';
import type { SlabHostId } from '../../@types/engine/frame/SlabHostId';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { RENDER_ORIGIN_MPC } from '../../data/renderOrigin';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { rotateByTranspose } from '../math/rotateByTranspose';
import { contractionMat4 } from '../relativity/contractionMat4';

export function foldBoostIntoSlab(
  slab: Slab,
  boost: FrameBoost | null,
  eyeMpc: Readonly<Vec3>,
  hostOrientationOf: (hostId: SlabHostId) => Readonly<Mat3> | undefined,
): Slab {
  if (boost === null || !boost.contraction) return slab;
  const { shipMpc, dir, gamma } = boost;
  let shipRel: Vec3;
  let dirRel: Readonly<Vec3> = dir;
  if (slab.frame.kind === 'world-mpc') {
    const origin = slab.frame.originRelative ? RENDER_ORIGIN_MPC : [0, 0, 0];
    shipRel = [shipMpc[0] - origin[0]!, shipMpc[1] - origin[1]!, shipMpc[2] - origin[2]!];
  } else {
    const orientation = hostOrientationOf(slab.frame.hostId);
    if (orientation === undefined) {
      throw new Error(`foldBoostIntoSlab: no orientation for body-m host ${slab.frame.hostId}`);
    }
    // Subtract in Mpc first, then scale, as `bodyRelativePose` does: f64 cancels the shared magnitude.
    const m = SCALE_UNITS.MPC_TO_M;
    shipRel = rotateByTranspose(orientation, [
      (shipMpc[0] - eyeMpc[0]) * m,
      (shipMpc[1] - eyeMpc[1]) * m,
      (shipMpc[2] - eyeMpc[2]) * m,
    ]);
    dirRel = rotateByTranspose(orientation, dir);
  }
  const vp = mat4d.multiply(slab.vp, contractionMat4(shipRel, dirRel, gamma)) as Float64Array;
  return { ...slab, vp };
}
