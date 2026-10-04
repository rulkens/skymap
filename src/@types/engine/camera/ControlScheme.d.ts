/**
 * ControlScheme — one row of the `CONTROL_SCHEMES` registry: the driver table
 * the frame loop picks its single camera author from, and the press binding
 * that latches a navigator axis (null keeps the gesture on the drag path).
 */

import type { AxisPress } from '../../camera/AxisPress';
import type { CameraDriver } from './CameraDriver';
import type { NavAxis } from '../../camera/NavAxis';

export type ControlScheme = {
  readonly drivers: readonly CameraDriver[];
  readonly bindAxis: (press: AxisPress) => NavAxis | null;
};
