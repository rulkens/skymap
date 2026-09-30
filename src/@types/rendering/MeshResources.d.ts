/**
 * MeshResources — the GPU objects one resident mesh body owns, keyed by body id
 * inside `meshBodyRenderer`. Every GPU object here is released together with
 * the rest: a partial release leaves `hasMesh` true over dead buffers.
 */

import type { MeshProbe } from './MeshProbe';
import type { ContactShadowResources } from './ContactShadowResources';

export type MeshResources = {
  vertexBuffers: GPUBuffer[];
  indexBuffer: GPUBuffer;
  indexCount: number;
  textures: GPUTexture[];
  probe: MeshProbe;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  /** Present only when the asset shipped a ground-contact mask; the
   *  contact-shadows pass binds it, not the mesh's own bind group. */
  contactShadow?: ContactShadowResources;
};
