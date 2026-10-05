/**
 * MeshBodyRenderer — handle for the shared lit triangle-mesh renderer: real
 * authored geometry in metres (the whale, the bowl of petunias), not a sphere
 * and not a proxy shell. Per-mesh GPU resources — including the body's own
 * reflection probe — are keyed by body id and make up bind group 0 (group 1
 * holds the renderer-wide samplers and LUT), so `draw` writes a body's uniforms
 * immediately before its own draw, with no shared buffer for a later
 * `writeBuffer` to race against the pending `submit`. No placeholder posture:
 * an id with no asset resident draws NOTHING, so a body in range but not yet
 * loaded is absent rather than a wrong shape.
 */

import type { Renderer } from './Renderer';
import type { MeshAsset } from '../data/mesh/MeshAsset';
import type { MeshProbe } from './MeshProbe';

export type MeshBodyRenderer = Renderer & {
  /** Albedo is sRGB; the metal-rough and normal maps are LINEAR `rgba8unorm`
   *  — an sRGB decode would corrupt slope and roughness data. */
  setMesh(id: string, asset: MeshAsset): void;
  clearMesh(id: string): void;
  hasMesh(id: string): boolean;
  /** The probe minted with `setMesh`; `null` while the id is not resident. */
  probeOf(id: string): MeshProbe | null;
  draw(pass: GPURenderPassEncoder, id: string, uniforms: Float32Array): void;
  /** Multiplies the body's contact mask onto the target where `depthView`'s
   *  scene falls inside its box; a no-op for a body without one. */
  drawContactShadow(
    pass: GPURenderPassEncoder,
    id: string,
    uniforms: Float32Array,
    depthView: GPUTextureView,
  ): void;
};
