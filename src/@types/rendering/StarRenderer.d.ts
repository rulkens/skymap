/**
 * StarRenderer — handle for a resolved (sphere-filling) star drawn into the
 * opaque near-field foreground target.
 *
 * The star is the same UV-sphere mesh the Earth and planet renderers use
 * (`uvSphereMesh`), shaded flat emissive: every fragment emits the star's
 * spectral colour scaled by a fixed HDR multiplier (see
 * `star/fragment.wesl`) — a star is a light source, not a lit surface, so
 * there is no lambert term and no texture. It shares `lib/sphere.wesl`'s
 * `TintedSphereUniforms` (80 bytes: mat4x4<f32> MVP + vec3<f32> colour,
 * padded to 80) with the planet renderer, so the CPU-side matrix+colour
 * layout stays a single source of truth.
 *
 * This is the close-approach half of the star LOD: far out the same body
 * renders as an additive point via `StarPointRenderer`; the crossover is
 * plan-03 work.
 */

import type { Renderer } from './Renderer';
import type { Vec3 } from '../math/Vec3';

export type StarRenderer = Renderer & {
  /**
   * Draw the star into the current (opaque, depth-tested) pass. `mvp` is a
   * length-16 Float32Array (column-major mat4x4<f32>) folding the star's
   * model scale + translate + view + projection; `color` is the spectral
   * emissive tint in linear RGB (0..1 — the shader applies the HDR
   * multiplier). Both are written into the single `TintedSphereUniforms`
   * buffer, so issue at most one star draw per frame.
   */
  draw(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3): void;
};
