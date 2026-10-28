import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { ExoplanetOrbitPlane } from './ExoplanetOrbitPlane';

export type ExoplanetOrbitPlaneRenderer = Renderer & {
  draw(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    viewport: Vec2,
    plane: ExoplanetOrbitPlane,
  ): void;
};
