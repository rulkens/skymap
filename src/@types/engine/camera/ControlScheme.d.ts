/**
 * ControlScheme — one row of the `composeControlSchemes` registry: the driver table
 * the frame loop picks its single camera author from.
 */

import type { CameraDriver } from './CameraDriver';

export type ControlScheme = { readonly drivers: readonly CameraDriver[] };
