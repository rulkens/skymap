/**
 * LightTimeSpheresRenderer — one screen-rect draw of the Earth-centred
 * light-time spheres, each intersected analytically per pixel.
 */

import type { OrbitCamera } from '../../../../@types/camera/orbitCamera/OrbitCamera';
import type { ViewFrustum } from '../../../../@types/camera/projection/ViewFrustum';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { LightTimeLiveness } from './LightTimeLiveness';
import type { Renderer } from '../../../../@types/rendering/Renderer';

export type LightTimeSpheresRenderer = Renderer & {
  /** `camPos` is the eye in the same absolute Mpc frame as `liveness.centre`. */
  draw(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    camPos: Readonly<Vec3>,
    frustum: ViewFrustum,
    liveness: LightTimeLiveness,
  ): void;
};
