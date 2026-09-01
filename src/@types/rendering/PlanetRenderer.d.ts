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
 * Each body's MVP + albedo + sun direction rides in a per-instance
 * vertex-buffer record, needing neither a per-body bind nor a per-draw
 * uniform — but `draw` is called once per body-m slab row (own instance
 * buffer per `bodyId`), not once for the whole roster; see `planetRenderer`'s
 * header for the per-body-buffer race and its fix.
 */

import type { Renderer } from './Renderer';
import type { BodyId } from '../data/body/BodyId';

export type PlanetRenderer = Renderer & {
  /**
   * Draw the one planet belonging to `bodyId` into the current (opaque,
   * depth-tested) pass. `instance` is a packed Float32Array of 28 floats:
   * floats 0..15 the body's column-major MVP (model T·R·S + view +
   * projection), 16..18 linear-RGB albedo (+ pad at 19), 20..22 the sun
   * direction in the body's local frame (+ pad at 23), 24..26 camPosLocal (+
   * pad at 27). `planetsLayer` calls `draw` once per body-m slab row, all
   * inside one submit, so each `bodyId` gets its OWN instance buffer (the
   * `texturedBodyRenderer` own-buffer-per-body precedent): two same-submit
   * calls for different ids never share a write target, so neither can
   * clobber the other before the GPU runs either draw.
   */
  draw(pass: GPURenderPassEncoder, bodyId: BodyId, instance: Float32Array): void;
};
