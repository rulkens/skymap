import type { Vec3 } from '../../math/Vec3';
import type { NearSphere } from './NearSphere';

/** Every Layer's `NearSphereSource` bound to this frame's body sample and settings;
 *  the caller supplies the camera, so each view (and the occluder set) asks at its own. */
export type NearSphereProvider = (
  camPosMpc: Readonly<Vec3>,
  pxPerRad: number,
) => readonly NearSphere[];
