/**
 * MeshBodyRenderer — handle for the shared lit triangle-mesh renderer: real
 * authored geometry in metres (the whale, the bowl of petunias), not a sphere
 * and not a proxy shell. Per-mesh GPU resources are keyed by body id and make up
 * bind group 0 (group 1 holds the renderer-wide material sampler alone), so
 * `draw` writes a body's uniforms immediately before its own draw, with no
 * shared buffer for a later `writeBuffer` to race against the pending `submit`.
 * No placeholder posture: an id with no asset resident draws NOTHING, so a body
 * in range but not yet loaded is absent rather than a wrong shape.
 */

import type { Renderer } from './Renderer';
import type { MeshAsset } from '../data/mesh/MeshAsset';

export type MeshBodyRenderer = Renderer & {
  /** Albedo is sRGB; the metal-rough and normal maps are LINEAR `rgba8unorm`
   *  — an sRGB decode would corrupt slope and roughness data. */
  setMesh(id: string, asset: MeshAsset): void;
  clearMesh(id: string): void;
  hasMesh(id: string): boolean;
  draw(pass: GPURenderPassEncoder, id: string, uniforms: Float32Array): void;
};
