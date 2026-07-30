/**
 * PlanetRenderer — handle for a flat-lit albedo planet drawn into the opaque
 * near-field foreground target.
 *
 * The planet is the same UV-sphere mesh the Earth and star renderers use
 * (`uvSphereMesh`), shaded by one lambert dot product against the per-instance
 * sun direction (rotated into the body's local frame) plus a small ambient
 * floor (see `planet/fragment.wesl` and the shared `lib/bodyLighting.wesl`).
 * No texture: the per-instance albedo is enough for the descent's fly-past
 * distances; per-planet texturing would follow the Earth's `setMap`
 * pattern when a body earns it.
 *
 * ONE instanced draw paints every seeded planet: each body's MVP + albedo +
 * sun direction rides in a per-instance vertex-buffer record, so the renderer
 * needs neither a per-body bind nor a per-draw uniform — see `planetRenderer`'s
 * header for why instancing beats dynamic-offset uniforms here.
 */

import type { Renderer } from './Renderer';

export type PlanetRenderer = Renderer & {
  /**
   * Draw `count` planets into the current (opaque, depth-tested) pass with a
   * single instanced `drawIndexed`. `instances` is a packed Float32Array of
   * `count` per-instance records, each 24 floats: floats 0..15 are the body's
   * column-major MVP (model T·R·S + view + projection), floats 16..18 its
   * linear-RGB albedo, float 19 a pad, floats 20..22 the sun direction in the
   * body's local frame, float 23 a pad. The caller reuses one
   * staging array across frames; `draw` uploads the first `count` records in
   * ONE `queue.writeBuffer` and issues ONE draw, so there is no per-body
   * uniform for a later write to clobber (the writeBuffer-vs-submit landmine is
   * avoided by construction). The instance buffer grows to fit the largest
   * `count` seen so far — there is no fixed cap on how many planets can be
   * drawn; `count` must not exceed `instances.length / 24`, or `draw` throws
   * rather than read past the caller's array. A zero count is a no-op.
   */
  draw(pass: GPURenderPassEncoder, instances: Float32Array, count: number): void;
};
