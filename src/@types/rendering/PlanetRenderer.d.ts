/**
 * PlanetRenderer — handle for a flat-lit albedo planet drawn into the opaque
 * near-field foreground target.
 *
 * The planet is the same UV-sphere mesh the Earth and star renderers use
 * (`uvSphereMesh`), shaded by one lambert dot product against a fixed light
 * direction plus a small ambient floor (see `planet/fragment.wesl` — the
 * fixed direction is a documented stand-in for real sun-relative lighting).
 * No texture: the uniform albedo is enough for the descent's fly-past
 * distances; per-planet texturing would follow the Earth's `setTexture`
 * pattern when a body earns it.
 *
 * It shares `lib/sphere.wesl`'s `TintedSphereUniforms` (80 bytes:
 * mat4x4<f32> MVP + vec3<f32> colour, padded to 80) with the star renderer,
 * so the CPU-side matrix+colour layout stays a single source of truth.
 */

import type { Renderer } from './Renderer';
import type { Vec3 } from '../math/Vec3';

export type PlanetRenderer = Renderer & {
  /**
   * Draw one planet into the current (opaque, depth-tested) pass. `mvp` is a
   * length-16 Float32Array (column-major mat4x4<f32>) folding the planet's
   * model scale + translate + view + projection; `albedo` is the surface
   * colour in linear RGB. Both are written into the single
   * `TintedSphereUniforms` buffer before the indexed draw, so consecutive
   * same-frame calls would race `queue.writeBuffer` against the pending
   * submit — the caller issues at most one draw per renderer instance per
   * frame (one instance per body, or a future dynamic-offset upgrade, when
   * multiple planets draw).
   */
  draw(pass: GPURenderPassEncoder, mvp: Float32Array, albedo: Vec3): void;
};
