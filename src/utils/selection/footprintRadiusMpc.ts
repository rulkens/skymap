import { SCALE_UNITS } from '../../data/scaleUnits';
import type { DriverGeometry } from '../../@types/engine/camera/DriverGeometry';

/**
 * A driven row's `radiusMpc`: its driver's footprint, in Mpc. Here, off the body-slab path, so
 * the Layers' selection rows never touch the Mpc↔m constants `oneMpcSeam.test.ts` gates.
 */
export function footprintRadiusMpc(driver: Pick<DriverGeometry, 'footprintRadiusM'>): number {
  return driver.footprintRadiusM * SCALE_UNITS.M_TO_MPC;
}
