/**
 * OcclusionMaskRenderer — writes the occlusion mask (`shaders/occlusionMask`): per pixel,
 * how much the foreground covers and how far its nearest drawn surface is, in km.
 */

import type { Vec2 } from '../math/Vec2';
import type { OverlaySceneOcclusion } from './OverlaySceneOcclusion';
import type { Renderer } from './Renderer';

export type OcclusionMaskRenderer = Renderer & {
  /** `scene`: the overlay joint this view resolved; `viewportPx`: the mask target's size. */
  draw(pass: GPURenderPassEncoder, scene: OverlaySceneOcclusion, viewportPx: Readonly<Vec2>): void;
};
