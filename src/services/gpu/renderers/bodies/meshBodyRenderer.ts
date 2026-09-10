/**
 * meshBodyRenderer — one shared pipeline for lit triangle-mesh bodies, with
 * per-mesh buffers/textures/uniforms in a `Map`. Unlike the sphere bodies it
 * draws the AUTHORED surface, in metres: standard back-face culling, no proxy
 * inflation, no analytic silhouette recovery. Two module-level tables —
 * `VERTEX_SLOTS` and `TEXTURE_SLOTS` — are the single home for the vertex layout
 * and the material bindings, so the pipeline descriptor and the upload path
 * cannot disagree about a stride, a location or a format. No placeholder
 * posture: an id with no asset draws nothing (see the type).
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { MeshBodyRenderer } from '../../../../@types/rendering/MeshBodyRenderer';
import type { MeshAsset } from '../../../../@types/data/mesh/MeshAsset';
import { MESH_BODY_UNIFORM_FLOATS } from '../../../../utils/gpu/packMeshBodyUniforms';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { generateMipChain, mipLevelCount } from '../../lib/generateMipChain';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import vsCode from '../../shaders/bodies/meshBody/vertex.wesl?static';
import fsCode from '../../shaders/bodies/meshBody/fragment.wesl?static';

const UNIFORM_BUFFER_SIZE = MESH_BODY_UNIFORM_FLOATS * 4;

/**
 * The vertex layout, one buffer slot per de-interleaved attribute array.
 *
 * `MeshAsset` arrives as SoA (`decodeMesh` splits the file's 48-byte interleaved
 * stride apart), and every other body renderer — earth, texturedBody,
 * cloudShell — binds one slot per attribute array. Re-interleaving here would
 * cost a CPU pass per upload purely to undo the decoder; the shader sees the
 * same `@location`s either way.
 */
const VERTEX_SLOTS = [
  { field: 'positions', bytes: 12, format: 'float32x3' },
  { field: 'normals', bytes: 12, format: 'float32x3' },
  { field: 'tangents', bytes: 16, format: 'float32x4' }, // w = handedness
  { field: 'uvs', bytes: 8, format: 'float32x2' },
] as const satisfies readonly {
  field: keyof MeshAsset;
  bytes: number;
  format: GPUVertexFormat;
}[];

/** The three baked material maps. Only albedo is sRGB — a metal-rough or normal
 *  map decoded through sRGB returns wrong roughness and wrong slopes. */
const TEXTURE_SLOTS = [
  { field: 'albedo', binding: 2, format: 'rgba8unorm-srgb' },
  { field: 'metalRough', binding: 3, format: 'rgba8unorm' },
  { field: 'normalMap', binding: 4, format: 'rgba8unorm' },
] as const satisfies readonly {
  field: keyof MeshAsset;
  binding: number;
  format: GPUTextureFormat;
}[];

type MeshResources = {
  vertexBuffers: GPUBuffer[];
  indexBuffer: GPUBuffer;
  indexCount: number;
  textures: GPUTexture[];
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
};

/**
 * @param reversedZ selects this slab's depth convention (single-sourced in
 *   `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
 *   `true` ⇒ reversed-Z greater-wins. Resolved through `resolveDepthCompare`.
 */
export function createMeshBodyRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): MeshBodyRenderer {
  const sampler = device.createSampler({
    label: 'meshBody-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'meshBody-bgl',
    entries: [
      {
        binding: 0,
        // The vertex stage reads mvp + model; the fragment reads the rest.
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ...TEXTURE_SLOTS.map((slot) => ({
        binding: slot.binding,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const },
      })),
    ],
  });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'meshBody.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'meshBody.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'meshBody-pipeline',
    layout: device.createPipelineLayout({
      label: 'meshBody-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: VERTEX_SLOTS.map((slot, location) => ({
        arrayStride: slot.bytes,
        attributes: [{ shaderLocation: location, offset: 0, format: slot.format }],
      })),
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      // No blend descriptor = opaque replace; the foreground composite blends
      // the whole layer.
      targets: [{ format: targetFormat }],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw',
      // Both approved sources declare glTF `doubleSided`: a petal or leaf is a
      // single sheet with no interior, so culling its far side deletes half the
      // plant. A closed mesh loses only the cull. `frontFace` still earns its
      // keep — the fragment stage reads `front_facing` to flip the normal.
      cullMode: 'none',
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  const meshes = new Map<string, MeshResources>();

  function releaseResources(res: MeshResources): void {
    for (const buffer of res.vertexBuffers) buffer.destroy();
    res.indexBuffer.destroy();
    for (const texture of res.textures) texture.destroy();
    res.uniformBuffer.destroy();
  }

  function uploadTexture(id: string, field: string, format: GPUTextureFormat, src: ImageBitmap) {
    const levels = mipLevelCount(src.width, src.height);
    const texture = device.createTexture({
      label: `meshBody-${field}-${id}`,
      size: [src.width, src.height, 1],
      format,
      mipLevelCount: levels,
      // RENDER_ATTACHMENT is required: generateMipChain renders each level
      // below 0 as a downsample pass.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // No `flipY`, unlike the sphere bodies: baked mesh UVs use the glTF/Blender
    // convention (v=0 at the image's top row), which is what an unflipped copy
    // gives.
    device.queue.copyExternalImageToTexture({ source: src }, { texture }, [
      src.width,
      src.height,
      1,
    ]);
    generateMipChain(device, texture);
    return texture;
  }

  function setMesh(id: string, asset: MeshAsset): void {
    const existing = meshes.get(id);
    if (existing !== undefined) releaseResources(existing);

    const vertexBuffers = VERTEX_SLOTS.map((slot) => {
      const data = asset[slot.field] as Float32Array;
      const buffer = device.createBuffer({
        label: `meshBody-${slot.field}-${id}`,
        size: data.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(buffer, 0, data);
      return buffer;
    });

    const indexBuffer = device.createBuffer({
      label: `meshBody-index-${id}`,
      size: asset.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(indexBuffer, 0, asset.indices);

    const textures = TEXTURE_SLOTS.map((slot) =>
      uploadTexture(id, slot.field, slot.format, asset[slot.field] as ImageBitmap),
    );

    const uniformBuffer = device.createBuffer({
      label: `meshBody-uniform-${id}`,
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    meshes.set(id, {
      vertexBuffers,
      indexBuffer,
      indexCount: asset.indexCount,
      textures,
      uniformBuffer,
      bindGroup: device.createBindGroup({
        label: `meshBody-bg-${id}`,
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: sampler },
          ...TEXTURE_SLOTS.map((slot, i) => ({
            binding: slot.binding,
            resource: textures[i]!.createView(),
          })),
        ],
      }),
    });
  }

  function clearMesh(id: string): void {
    const res = meshes.get(id);
    if (res === undefined) return;
    releaseResources(res);
    meshes.delete(id);
  }

  function hasMesh(id: string): boolean {
    return meshes.has(id);
  }

  function draw(pass: GPURenderPassEncoder, id: string, uniforms: Float32Array): void {
    const res = meshes.get(id);
    if (res === undefined) return;
    // Write THIS id's own uniform buffer immediately before its draw:
    // interleaving `writeBuffer` with `submit` does not preserve order, so a
    // shared buffer would let a later body's write decide this body's matrix.
    device.queue.writeBuffer(res.uniformBuffer, 0, uniforms);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, res.bindGroup);
    for (let slot = 0; slot < res.vertexBuffers.length; slot++) {
      pass.setVertexBuffer(slot, res.vertexBuffers[slot]!);
    }
    pass.setIndexBuffer(res.indexBuffer, 'uint32');
    pass.drawIndexed(res.indexCount);
  }

  function destroy(): void {
    for (const res of meshes.values()) releaseResources(res);
    meshes.clear();
  }

  const renderer: MeshBodyRenderer = {
    label: 'meshBodyRenderer',
    setMesh,
    clearMesh,
    hasMesh,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
