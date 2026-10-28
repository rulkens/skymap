import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { SkyGridFrame } from '../../../@types/settings/SkyGridFrame';
import type { Renderer } from '../../../@types/rendering/Renderer';

export type SkyGridRenderer = Renderer & {
  draw(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    viewport: Vec2,
    frames: Readonly<Record<SkyGridFrame, boolean>>,
    opacity: number,
  ): void;
};
