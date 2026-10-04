/**
 * ControlScheme — one row of the `CONTROL_SCHEMES` registry: the driver table
 * the frame loop picks its single camera author from.
 */

import type { CameraDriver } from './CameraDriver';

export type ControlScheme = { readonly drivers: readonly CameraDriver[] };
