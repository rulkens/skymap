/**
 * MeshResources — the GPU objects one resident mesh body owns, keyed by body id
 * inside `meshBodyRenderer`. Every field is destroyable and they are released
 * together: a partial release leaves `hasMesh` true over dead buffers.
 */
export type MeshResources = {
  vertexBuffers: GPUBuffer[];
  indexBuffer: GPUBuffer;
  indexCount: number;
  textures: GPUTexture[];
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
};
