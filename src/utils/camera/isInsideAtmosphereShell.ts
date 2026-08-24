/**
 * isInsideAtmosphereShell — the inside/outside classifier `atmosphereShellLayer`
 * switches on: does the camera sit inside the atmosphere-TOP unit sphere, in the
 * shell's own local (atmosphere-top-radius) frame? `camPosLocal` already carries
 * that normalisation (`camPosLocal.ts`'s `radiusMpc` divisor), so this is one
 * comparison, no new per-frame derivation (spec §4.1).
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function isInsideAtmosphereShell(camPosLocal: Readonly<Vec3>): boolean {
  return Math.hypot(camPosLocal[0], camPosLocal[1], camPosLocal[2]) < 1;
}
