/**
 * PlanetRenderer: a flat-lit albedo planet drawn into the opaque near-field
 * foreground target (lambert against the body-local sun direction plus a small
 * ambient floor; no texture). `draw` is called once per body-m slab row, each
 * `hostId` with its own instance buffer, so same-submit writes never clobber.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { PositionedId } from '../../../@types/scene/PositionedId';

export type PlanetRenderer = Renderer & {
  /**
   * Draw the slab host's planet into the current (opaque, depth-tested) pass.
   * `instance` is 28 floats: 0..15 column-major MVP, 16..18 linear-RGB albedo,
   * 20..22 sun direction in the body's local frame, 24..26 camPosLocal; each
   * vec3 is followed by one pad float.
   */
  draw(pass: GPURenderPassEncoder, hostId: PositionedId, instance: Float32Array): void;
};
