/**
 * MeshBodyRenderer — handle for the shared lit triangle-mesh renderer: real
 * authored geometry in metres (a spacecraft, a station), not a sphere and not a
 * ray-traced proxy shell. One pipeline, one `Map<string, …>` of per-mesh GPU
 * resources — vertex + index buffers, three material textures, a uniform buffer
 * and a bind group per mesh id — so `draw` can write a body's uniforms
 * immediately before that body's own draw and no shared buffer exists for a
 * later `writeBuffer` to race against the pending `submit`.
 *
 * There is no placeholder posture: a mesh body with no asset resident draws
 * NOTHING (`draw` is a no-op), so a body in range but not yet loaded is absent
 * rather than a wrong shape. `hasMesh` is the residency predicate the demand
 * row and the pass both ask.
 */

import type { Renderer } from './Renderer';
import type { MeshAsset } from '../data/mesh/MeshAsset';

export type MeshBodyRenderer = Renderer & {
  /**
   * Upload a decoded `.mesh` asset plus its three baked maps for one mesh id,
   * replacing (and destroying) whatever that id held. Geometry goes up as four
   * per-attribute vertex buffers straight from the asset's de-interleaved
   * arrays; albedo is sRGB, the metal-rough and normal maps are LINEAR
   * `rgba8unorm` (an sRGB decode would corrupt slope and roughness data).
   */
  setMesh(id: string, asset: MeshAsset): void;
  /**
   * Free everything one mesh id owns — the eviction inverse of `setMesh`,
   * called from the mesh slot's `onRelease` when the body leaves its load
   * radius. A no-op if the id holds nothing.
   */
  clearMesh(id: string): void;
  /** True iff this id has an asset uploaded — the residency predicate. */
  hasMesh(id: string): boolean;
  /**
   * Draw one mesh body into the current pass: the 44-float `MeshBodyUniforms`
   * block (176 bytes) from `packMeshBodyUniforms` is written to that id's own
   * uniform buffer, then the mesh is drawn indexed with back-face culling. A
   * no-op while the id has no asset. Draw each id at most once per frame.
   */
  draw(pass: GPURenderPassEncoder, id: string, uniforms: Float32Array): void;
};
