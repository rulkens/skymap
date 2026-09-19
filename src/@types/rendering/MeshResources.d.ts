/**
 * MeshResources — the GPU objects one resident mesh body owns, keyed by body id
 * inside `meshBodyRenderer`. Every GPU object here is released together with
 * the rest: a partial release leaves `hasMesh` true over dead buffers.
 */

import type { MeshProbe } from './MeshProbe';

export type MeshResources = {
  vertexBuffers: GPUBuffer[];
  indexBuffer: GPUBuffer;
  indexCount: number;
  textures: GPUTexture[];
  probe: MeshProbe;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  /** Ground-contact mask, present only when the asset shipped one; the
   *  contact-shadows pass samples it, not the mesh's own bind group. */
  contactShadow?: GPUTexture;
};
