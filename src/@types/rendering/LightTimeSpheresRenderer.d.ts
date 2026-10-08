/**
 * LightTimeSpheresRenderer — one screen-rect draw of the Earth-centred
 * light-time spheres, each intersected analytically per pixel.
 */

import type { OrbitCamera } from '../camera/OrbitCamera';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';
import type { LightTimeLiveness } from '../../layers/lightTime/@types/LightTimeLiveness';
import type { Renderer } from './Renderer';

export type LightTimeSpheresRenderer = Renderer & {
  /** `camPos` is the eye in the same absolute Mpc frame as `liveness.centre`. */
  draw(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    camPos: Readonly<Vec3>,
    viewport: Vec2,
    liveness: LightTimeLiveness,
  ): void;
};
