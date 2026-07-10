/**
 * StarPointRenderer — handle for the neighbourhood's distant stars drawn as
 * additive point sprites into the depthless HDR accumulation.
 *
 * This is the far half of the star LOD: a star too small to resolve as a
 * sphere renders as a screen-aligned soft dot, sized from its absolute
 * magnitude and tinted by its spectral colour — the same visual species as
 * the survey point cloud, but through a thin dedicated pipeline (see the
 * `starPointRenderer.ts` module header for why it does NOT wrap
 * `createPointRenderer`). It draws into the depthless `hdr` target with
 * one/one additive blending, NOT the opaque foreground pass, so overlapping
 * stars brighten long-exposure style like every other additive layer.
 *
 * Star data is late-bound like the Earth's texture: the factory builds the
 * pipeline immediately, and the layer calls `setStars` once the seeded
 * bodies are known. Positions upload as f32 — sub-pixel error for anything
 * drawn as a point; the f64 compose path matters only for sphere-filling
 * bodies (see the renderer module header).
 */

import type { Renderer } from './Renderer';
import type { Vec2 } from '../math/Vec2';
import type { StarBody } from '../scene/StarBody';

export type StarPointRenderer = Renderer & {
  /**
   * Upload the instance buffer from the seeded star bodies — position
   * (`positionMpc` narrowed to f32), linear-RGB `color`, and `absMag` per
   * star, 28 bytes each. Replaces any previous upload; an empty array
   * clears the renderer back to drawing nothing.
   */
  setStars(stars: readonly StarBody[]): void;
  /**
   * Draw every uploaded star as an instanced billboard into the current
   * (depthless, additive) pass. `viewProj` is the slab's f32 length-16
   * view-projection; `viewportPx` feeds the pixel-size-to-clip-offset
   * conversion. No-op until `setStars` has delivered a non-empty upload.
   */
  draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2): void;
};
