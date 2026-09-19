/**
 * meshBodyRenderer — one shared pipeline for lit triangle-mesh bodies, with
 * per-mesh buffers/textures/uniforms in a `Map`. Unlike the sphere bodies it
 * draws the AUTHORED surface, in metres: unculled (glTF `doubleSided` sheets —
 * see the pipeline's `cullMode`), no proxy inflation, no analytic silhouette
 * recovery. The vertex layout and the material bindings come from
 * `MESH_VERTEX_SLOTS` / `MESH_TEXTURE_SLOTS`, so the pipeline descriptor and
 * the upload path cannot disagree about a stride, a location or a format. An id
 * with no asset draws nothing.
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { MeshBodyRenderer } from '../../../../@types/rendering/MeshBodyRenderer';
import type { MeshResources } from '../../../../@types/rendering/MeshResources';
import type { MeshProbe } from '../../../../@types/rendering/MeshProbe';
import type { MeshAsset } from '../../../../@types/data/mesh/MeshAsset';
import { MESH_BODY_UNIFORM_BYTES } from '../../../../data/mesh/meshBodyUniformLayout';
import { CUBEMAP_CAPTURES } from '../../../../data/rendering/cubemapCaptures';
import { MESH_TEXTURE_SLOTS } from '../../../../data/mesh/meshTextureSlots';
import { MESH_VERTEX_SLOTS } from '../../../../data/mesh/meshVertexSlots';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { generateMipChain, mipLevelCount } from '../../lib/generateMipChain';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import vsCode from '../../shaders/bodies/meshBody/vertex.wesl?static';
import fsCode from '../../shaders/bodies/meshBody/fragment.wesl?static';

// The body's reflection probe, after the material maps; the fragment's
// `@group(0) @binding(5)` decoration mirrors this by hand.
const PROBE_BINDING = 5;

/**
 * @param init.reversedZ selects this slab's depth convention (single-sourced in
 *   `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
 *   `true` ⇒ reversed-Z greater-wins. Resolved through `resolveDepthCompare`.
 * @param init.envBrdfLut the split-sum LUT loaded once at boot
 *   (`resources/loadEnvBrdfLut.ts`) and shared by every mesh body.
 */
export function createMeshBodyRenderer(init: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
  readonly depthFormat: GPUTextureFormat;
  readonly reversedZ: boolean;
  readonly envBrdfLut: GPUTexture;
}): MeshBodyRenderer {
  const { device, targetFormat, depthFormat, reversedZ, envBrdfLut } = init;

  const sampler = device.createSampler({
    label: 'meshBody-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
  });

  // Clamp-to-edge is load-bearing, not a default: the LUT is read at
  // (NoV, roughness), and a wrapping sampler turns grazing NoV → 0 into the
  // NoV = 1 column — a bright rim exactly where the Fresnel term should peak.
  const lutSampler = device.createSampler({
    label: 'meshBody-lut-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // Group 0 holds what a body owns, group 1 what the renderer owns. Binding 1
  // of group 0 is vacant: the sampler lives in group 1, and renumbering the
  // texture bindings would desync this layout from `MESH_TEXTURE_SLOTS`, which
  // the shader's decorations mirror by hand.
  const bodyBindGroupLayout = device.createBindGroupLayout({
    label: 'meshBody-body-bgl',
    entries: [
      {
        binding: 0,
        // The vertex stage reads mvp + model; the fragment reads the rest.
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', minBindingSize: MESH_BODY_UNIFORM_BYTES },
      },
      ...MESH_TEXTURE_SLOTS.map((slot) => ({
        binding: slot.binding,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const },
      })),
      {
        binding: PROBE_BINDING,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: 'cube' },
      },
    ],
  });

  const globalBindGroupLayout = device.createBindGroupLayout({
    label: 'meshBody-global-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const globalBindGroup = device.createBindGroup({
    label: 'meshBody-global-bg',
    layout: globalBindGroupLayout,
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: envBrdfLut.createView({ label: 'meshBody-envBrdf-view' }) },
      { binding: 2, resource: lutSampler },
    ],
  });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'meshBody.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'meshBody.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'meshBody-pipeline',
    layout: device.createPipelineLayout({
      label: 'meshBody-pipeline-layout',
      bindGroupLayouts: [bodyBindGroupLayout, globalBindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: MESH_VERTEX_SLOTS.map((slot, location) => ({
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
    res.probe.cube.destroy();
    res.probe.depth.destroy();
    res.uniformBuffer.destroy();
    res.contactShadow?.destroy();
  }

  // The capture writes the cube's mip 0 face by face and `prefilterCubeGgx`
  // renders the mips below it, so both textures are colour/depth attachments
  // as well as sampled. The chain runs to 1 px: its last mip is the
  // roughness-1 level the fragment's diffuse term reads.
  const probeFaceSizePx = CUBEMAP_CAPTURES.probe.faceSizePx;
  const probeMipLevelCount = mipLevelCount(probeFaceSizePx, probeFaceSizePx);

  function mintProbe(id: string): MeshProbe {
    const cube = device.createTexture({
      label: `meshBody-probe-${id}`,
      size: [probeFaceSizePx, probeFaceSizePx, 6],
      format: 'rgba16float',
      mipLevelCount: probeMipLevelCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const depth = device.createTexture({
      label: `meshBody-probe-depth-${id}`,
      size: [probeFaceSizePx, probeFaceSizePx, 1],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    return { cube, depth };
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

  // No mip chain and no RENDER_ATTACHMENT usage: the contact-shadows pass
  // samples mip 0 only (`textureSampleLevel(..., 0)`), unlike the material
  // maps `uploadTexture` mips for trilinear filtering across the mesh.
  function uploadContactShadow(id: string, src: ImageBitmap): GPUTexture {
    const texture = device.createTexture({
      label: `meshBody-contact-${id}`,
      size: [src.width, src.height, 1],
      format: 'r8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.copyExternalImageToTexture({ source: src }, { texture }, [
      src.width,
      src.height,
      1,
    ]);
    return texture;
  }

  function setMesh(id: string, asset: MeshAsset): void {
    const existing = meshes.get(id);
    if (existing !== undefined) {
      releaseResources(existing);
      // Drop the entry BEFORE rebuilding: a throw below would otherwise leave
      // `hasMesh` true over destroyed buffers.
      meshes.delete(id);
    }

    const vertexBuffers = MESH_VERTEX_SLOTS.map((slot) => {
      const data = asset[slot.field];
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

    const textures = MESH_TEXTURE_SLOTS.map((slot) =>
      uploadTexture(id, slot.field, slot.format, asset[slot.field]),
    );

    const probe = mintProbe(id);
    const contactShadow = asset.contactShadow && uploadContactShadow(id, asset.contactShadow);

    const uniformBuffer = device.createBuffer({
      label: `meshBody-uniform-${id}`,
      size: MESH_BODY_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    meshes.set(id, {
      vertexBuffers,
      indexBuffer,
      indexCount: asset.indexCount,
      textures,
      probe,
      uniformBuffer,
      contactShadow,
      bindGroup: device.createBindGroup({
        label: `meshBody-bg-${id}`,
        layout: bodyBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          ...MESH_TEXTURE_SLOTS.map((slot, i) => ({
            binding: slot.binding,
            resource: textures[i]!.createView(),
          })),
          {
            binding: PROBE_BINDING,
            resource: probe.cube.createView({
              label: `meshBody-probe-view-${id}`,
              dimension: 'cube',
            }),
          },
        ],
      }),
    });
  }

  function probeOf(id: string): MeshProbe | null {
    return meshes.get(id)?.probe ?? null;
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
    pass.setBindGroup(1, globalBindGroup);
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
    probeOf,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
