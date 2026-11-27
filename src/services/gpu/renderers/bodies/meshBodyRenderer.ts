/**
 * meshBodyRenderer — one shared pipeline for lit triangle-mesh bodies, with
 * per-mesh buffers/textures/uniforms in a `Map`. Unlike the sphere bodies it
 * draws the AUTHORED surface, in metres: unculled (glTF `doubleSided` sheets —
 * see the pipeline's `cullMode`), no proxy inflation, no analytic silhouette
 * recovery. The vertex layout and the material bindings come from
 * `MESH_VERTEX_SLOTS` / `MESH_TEXTURE_SLOTS`, so the pipeline descriptor and
 * the upload path cannot disagree about a stride, a location or a format. An id
 * with no asset draws nothing. It also owns the sun shadow array: one depth layer per
 * slot, re-rendered only when its body's mesh or mesh-frame sun moves (`renderShadows`).
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { MeshBodyRenderer } from '../../../../@types/rendering/MeshBodyRenderer';
import type { MeshResources } from '../../../../@types/rendering/MeshResources';
import type { MeshProbe } from '../../../../@types/rendering/MeshProbe';
import type { MeshAsset } from '../../../../@types/data/mesh/MeshAsset';
import type { MeshShadowCaster } from '../../../../@types/rendering/MeshShadowCaster';
import type { MeshShadowSlot } from '../../../../@types/rendering/MeshShadowSlot';
import type { MeshGroundCaster } from '../../../../@types/rendering/MeshGroundCaster';
import type { MeshShadowLayer } from '../../../../@types/rendering/MeshShadowLayer';
import type { ClaimTimestampWrites } from '../../../../@types/gpu/timing/ClaimTimestampWrites';
import type { Vec3 } from '../../../../@types/math/Vec3';
import {
  MESH_SHADOW_DEPTH_BIAS,
  MESH_SHADOW_DEPTH_BIAS_SLOPE,
  MESH_SHADOW_GROUND_CASTERS,
  MESH_SHADOW_MAP_PX,
  MESH_SHADOW_NORMAL_OFFSET_TEXELS,
  MESH_SHADOW_SAMPLER,
  MESH_SHADOW_SLOTS,
} from '../../../../data/mesh/meshShadowMap';
import { assignMeshShadowSlots } from '../../../../utils/meshBodies/assignMeshShadowSlots';
import { meshShadowLightFromMesh } from '../../../../utils/meshBodies/meshShadowLightFromMesh';
import { meshShadowLightFromLocal } from '../../../../utils/meshBodies/meshShadowLightFromLocal';
import { meshShadowLightFromEye } from '../../../../utils/meshBodies/meshShadowLightFromEye';
import { meshShadowNeedsRender } from '../../../../utils/meshBodies/meshShadowNeedsRender';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { MESH_BODY_UNIFORM_BYTES } from '../../../../data/mesh/meshBodyUniformLayout';
import { APP_CUBEMAP_CAPTURE_REGISTRY } from '../../../../compositions/appCubemapCaptures';
import { MESH_TEXTURE_SLOTS } from '../../../../data/mesh/meshTextureSlots';
import { MESH_VERTEX_SLOTS } from '../../../../data/mesh/meshVertexSlots';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { horizonLookupConstants } from '../../../../utils/gpu/horizonLookupConstants';
import { generateMipChain, mipLevelCount } from '../../lib/generateMipChain';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import type { ContactShadowResources } from '../../../../@types/rendering/ContactShadowResources';
import { CONTACT_SHADOW_UNIFORM_BYTES } from '../../../../data/mesh/contactShadowUniformLayout';
import vsCode from '../../shaders/bodies/meshBody/vertex.wesl?static';
import fsCode from '../../shaders/bodies/meshBody/fragment.wesl?static';
import contactVsCode from '../../shaders/bodies/contactShadow/vertex.wesl?static';
import contactFsCode from '../../shaders/bodies/contactShadow/fragment.wesl?static';
import shadowVsCode from '../../shaders/bodies/meshShadow/vertex.wesl?static';

// The unit cube as 12 non-indexed triangles, generated in the vertex stage.
const CUBE_VERTEX_COUNT = 36;

// The body's reflection probe, after the material maps; the fragment's
// `@group(0) @binding(5)` decoration mirrors this by hand.
const PROBE_BINDING = 5;

// `MeshShadowDepthUniforms` (shaders/bodies/meshShadow/io.wesl): one mat4.
const SHADOW_DEPTH_UNIFORM_BYTES = 64;

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

  // The sun shadow array: a 2D view per layer to render into, one array view to read.
  const shadowMap = device.createTexture({
    label: 'meshBody-shadow-map',
    size: [MESH_SHADOW_MAP_PX, MESH_SHADOW_MAP_PX, MESH_SHADOW_SLOTS],
    format: 'depth16unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const shadowMapView = shadowMap.createView({
    label: 'meshBody-shadow-map-view',
    dimension: '2d-array',
  });
  const shadowLayerViews = Array.from({ length: MESH_SHADOW_SLOTS }, (_, layer) =>
    shadowMap.createView({
      label: `meshBody-shadow-layer-${layer}`,
      dimension: '2d',
      baseArrayLayer: layer,
      arrayLayerCount: 1,
    }),
  );
  const shadowSampler = device.createSampler(MESH_SHADOW_SAMPLER);

  // Group 2: the host's horizon atlas, read with `textureLoad` (`lib/horizonLookup.wesl`),
  // and the shadow array with its comparison sampler (`lib/meshShadow.wesl`).
  const horizonBindGroupLayout = device.createBindGroupLayout({
    label: 'meshBody-horizon-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'depth', viewDimension: '2d-array' },
      },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
    ],
  });
  const horizonBindGroupOf = (view: GPUTextureView, label: string) =>
    device.createBindGroup({
      label,
      layout: horizonBindGroupLayout,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: shadowMapView },
        { binding: 2, resource: shadowSampler },
      ],
    });
  // Bound off the ground, where every rect is zero and the lookup reads nothing.
  const horizonStandIn = device.createTexture({
    label: 'meshBody-horizon-stand-in',
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING,
  });
  const horizonStandInBindGroup = horizonBindGroupOf(
    horizonStandIn.createView(),
    'meshBody-horizon-stand-in-bg',
  );
  // Cached on the atlas view's identity, as `drawContactShadow` caches its own.
  let horizonAtlasBinding: { view: GPUTextureView; bindGroup: GPUBindGroup } | null = null;

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'meshBody.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'meshBody.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'meshBody-pipeline',
    layout: device.createPipelineLayout({
      label: 'meshBody-pipeline-layout',
      bindGroupLayouts: [bodyBindGroupLayout, globalBindGroupLayout, horizonBindGroupLayout],
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
      // The sun alone: a mesh body has no sky term to dim.
      constants: horizonLookupConstants(false),
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

  const contactBindGroupLayout = device.createBindGroupLayout({
    label: 'meshBody-contact-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', minBindingSize: CONTACT_SHADOW_UNIFORM_BYTES },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
    ],
  });

  const contactPipeline = device.createRenderPipeline({
    label: 'meshBody-contact-pipeline',
    layout: device.createPipelineLayout({
      label: 'meshBody-contact-pipeline-layout',
      bindGroupLayouts: [contactBindGroupLayout],
    }),
    vertex: {
      module: createShaderModuleWithDevLog(device, contactVsCode, 'contactShadow.vertex'),
      entryPoint: 'vs',
    },
    fragment: {
      module: createShaderModuleWithDevLog(device, contactFsCode, 'contactShadow.fragment'),
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // colour × shade. Alpha is the overlays' transmittance and stays put.
          blend: {
            color: { srcFactor: 'dst', dstFactor: 'zero' },
            alpha: { srcFactor: 'zero', dstFactor: 'one' },
          },
        },
      ],
    },
    // Back faces only, so the box still rasterises with the eye inside it. No
    // depthStencil: this draws in a 'sample' step, which attaches no depth.
    primitive: { topology: 'triangle-list', frontFace: 'ccw', cullMode: 'front' },
  });

  // Depth only, from the position stream alone. Unculled for the main pipeline's reason
  // (single sheets); the bias is the caster's half of the acne guard, the fragment's normal
  // offset the receiver's.
  const shadowBindGroupLayout = device.createBindGroupLayout({
    label: 'meshBody-shadow-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform', minBindingSize: SHADOW_DEPTH_UNIFORM_BYTES },
      },
    ],
  });
  const shadowPipeline = device.createRenderPipeline({
    label: 'meshBody-shadow-pipeline',
    layout: device.createPipelineLayout({
      label: 'meshBody-shadow-pipeline-layout',
      bindGroupLayouts: [shadowBindGroupLayout],
    }),
    vertex: {
      module: createShaderModuleWithDevLog(device, shadowVsCode, 'meshShadow.vertex'),
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: MESH_VERTEX_SLOTS[0].bytes,
          attributes: [{ shaderLocation: 0, offset: 0, format: MESH_VERTEX_SLOTS[0].format }],
        },
      ],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: 'depth16unorm',
      depthWriteEnabled: true,
      depthCompare: 'less',
      depthBias: MESH_SHADOW_DEPTH_BIAS,
      depthBiasSlopeScale: MESH_SHADOW_DEPTH_BIAS_SLOPE,
    },
  });
  // One uniform buffer per layer: every dirty layer is encoded into the same submit, so a
  // shared buffer would hand all of them the last layer's matrix.
  const shadowUniforms = Array.from({ length: MESH_SHADOW_SLOTS }, (_, layer) => {
    const buffer = device.createBuffer({
      label: `meshBody-shadow-uniform-${layer}`,
      size: SHADOW_DEPTH_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      label: `meshBody-shadow-bg-${layer}`,
      layout: shadowBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer } }],
    });
    return { buffer, bindGroup };
  });

  // What each layer holds, null when free; `rankedLayers` the held ones nearest first, the
  // order ground casters are taken in.
  let shadowLayers: (MeshShadowLayer | null)[] = new Array<MeshShadowLayer | null>(
    MESH_SHADOW_SLOTS,
  ).fill(null);
  let rankedLayers: readonly MeshShadowLayer[] = [];

  // A reloaded or cleared mesh drops its layer, so the next `renderShadows` redraws or frees it.
  function dropShadowLayer(id: string): void {
    shadowLayers = shadowLayers.map((layer) => (layer?.id === id ? null : layer));
    rankedLayers = rankedLayers.filter((layer) => layer.id !== id);
  }

  const meshes = new Map<string, MeshResources>();

  function releaseResources(res: MeshResources): void {
    for (const buffer of res.vertexBuffers) buffer.destroy();
    res.indexBuffer.destroy();
    for (const texture of res.textures) texture.destroy();
    res.probe.cube.destroy();
    res.probe.depth.destroy();
    res.uniformBuffer.destroy();
    res.contactShadow?.texture.destroy();
    res.contactShadow?.uniformBuffer.destroy();
  }

  // The capture writes the cube's mip 0 face by face and `prefilterCubeGgx`
  // renders the mips below it, so both textures are colour/depth attachments
  // as well as sampled. The chain runs to 1 px: its last mip is the
  // roughness-1 level the fragment's diffuse term reads.
  const probeFaceSizePx = APP_CUBEMAP_CAPTURE_REGISTRY.probe.faceSizePx;
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

  // No mip chain: the contact-shadows pass samples mip 0 only. RENDER_ATTACHMENT
  // is still required — copyExternalImageToTexture rejects a destination
  // without it, which silently leaves the mask all zeros.
  function uploadContactShadow(id: string, src: ImageBitmap): ContactShadowResources {
    const texture = device.createTexture({
      label: `meshBody-contact-${id}`,
      size: [src.width, src.height, 1],
      format: 'r8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: src }, { texture }, [
      src.width,
      src.height,
      1,
    ]);
    const uniformBuffer = device.createBuffer({
      label: `meshBody-contact-uniform-${id}`,
      size: CONTACT_SHADOW_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    return { texture, uniformBuffer, bindGroup: null, depthView: null };
  }

  function setMesh(id: string, asset: MeshAsset): void {
    const existing = meshes.get(id);
    if (existing !== undefined) {
      releaseResources(existing);
      // Drop the entry BEFORE rebuilding: a throw below would otherwise leave
      // `hasMesh` true over destroyed buffers.
      meshes.delete(id);
      dropShadowLayer(id);
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
      boundingRadiusM: asset.boundingRadiusM,
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
    dropShadowLayer(id);
  }

  function hasMesh(id: string): boolean {
    return meshes.has(id);
  }

  function horizonBindGroup(view: GPUTextureView | null): GPUBindGroup {
    if (view === null) return horizonStandInBindGroup;
    if (horizonAtlasBinding?.view !== view) {
      horizonAtlasBinding = { view, bindGroup: horizonBindGroupOf(view, 'meshBody-horizon-bg') };
    }
    return horizonAtlasBinding.bindGroup;
  }

  function draw(
    pass: GPURenderPassEncoder,
    id: string,
    uniforms: Float32Array,
    horizonAtlas: GPUTextureView | null,
  ): void {
    const res = meshes.get(id);
    if (res === undefined) return;
    // Write THIS id's own uniform buffer immediately before its draw:
    // interleaving `writeBuffer` with `submit` does not preserve order, so a
    // shared buffer would let a later body's write decide this body's matrix.
    device.queue.writeBuffer(res.uniformBuffer, 0, uniforms);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, res.bindGroup);
    pass.setBindGroup(1, globalBindGroup);
    pass.setBindGroup(2, horizonBindGroup(horizonAtlas));
    for (let slot = 0; slot < res.vertexBuffers.length; slot++) {
      pass.setVertexBuffer(slot, res.vertexBuffers[slot]!);
    }
    pass.setIndexBuffer(res.indexBuffer, 'uint32');
    pass.drawIndexed(res.indexCount);
  }

  function drawContactShadow(
    pass: GPURenderPassEncoder,
    id: string,
    uniforms: Float32Array,
    depthView: GPUTextureView,
  ): void {
    const contact = meshes.get(id)?.contactShadow;
    if (contact === undefined) return;
    if (contact.depthView !== depthView) {
      contact.depthView = depthView;
      contact.bindGroup = device.createBindGroup({
        label: `meshBody-contact-bg-${id}`,
        layout: contactBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: contact.uniformBuffer } },
          { binding: 1, resource: contact.texture.createView() },
          // The LUT's sampler is exactly the mask's: linear, clamp-to-edge.
          { binding: 2, resource: lutSampler },
          { binding: 3, resource: depthView },
        ],
      });
    }
    // Own buffer per body, written right before its draw — the `draw` rule above.
    device.queue.writeBuffer(contact.uniformBuffer, 0, uniforms);
    pass.setPipeline(contactPipeline);
    pass.setBindGroup(0, contact.bindGroup);
    pass.draw(CUBE_VERTEX_COUNT);
  }

  function renderShadows(
    encoder: GPUCommandEncoder,
    casters: readonly MeshShadowCaster[],
    claimTimestampWrites: ClaimTimestampWrites,
  ): void {
    const ranked = casters
      .filter((caster) => meshes.has(caster.id))
      .sort((a, b) => a.cameraDistanceSq - b.cameraDistanceSq)
      .slice(0, MESH_SHADOW_SLOTS);
    const casterOf = new Map(ranked.map((caster) => [caster.id, caster]));
    const owners = assignMeshShadowSlots(
      shadowLayers.map((layer) => layer?.id ?? null),
      ranked.map((caster) => caster.id),
    );
    const dirty: number[] = [];
    shadowLayers = owners.map((id, slot) => {
      if (id === null) return null;
      const caster = casterOf.get(id)!;
      const held = shadowLayers[slot];
      if (held?.id === id && !meshShadowNeedsRender(held.rendered, caster.sunDirMesh)) {
        return { ...held, caster };
      }
      dirty.push(slot);
      const radiusM = meshes.get(id)!.boundingRadiusM;
      return {
        id,
        rendered: caster.sunDirMesh,
        slot: {
          slot,
          lightFromMesh: meshShadowLightFromMesh(caster.sunDirMesh, radiusM),
          normalOffsetM: (MESH_SHADOW_NORMAL_OFFSET_TEXELS * 2 * radiusM) / MESH_SHADOW_MAP_PX,
        },
        caster,
      };
    });
    rankedLayers = ranked.map((caster) => shadowLayers.find((layer) => layer?.id === caster.id)!);
    if (dirty.length === 0) return;

    // One timing slot spans every layer drawn: it opens on the first pass, closes on the last.
    const timestampWrites = claimTimestampWrites().timestampWrites;
    dirty.forEach((slot, i) => {
      const layer = shadowLayers[slot]!;
      const res = meshes.get(layer.id)!;
      const uniform = shadowUniforms[slot]!;
      device.queue.writeBuffer(uniform.buffer, 0, narrowMat4(layer.slot.lightFromMesh));
      const pass = encoder.beginRenderPass({
        label: `meshBody-shadow-pass-${slot}`,
        colorAttachments: [],
        depthStencilAttachment: {
          view: shadowLayerViews[slot]!,
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
        // A middle pass carries none: WebGPU rejects timestampWrites naming no index.
        ...(timestampWrites &&
          (i === 0 || i === dirty.length - 1) && {
            timestampWrites: {
              querySet: timestampWrites.querySet,
              ...(i === 0 && {
                beginningOfPassWriteIndex: timestampWrites.beginningOfPassWriteIndex,
              }),
              ...(i === dirty.length - 1 && {
                endOfPassWriteIndex: timestampWrites.endOfPassWriteIndex,
              }),
            },
          }),
      });
      pass.setPipeline(shadowPipeline);
      pass.setBindGroup(0, uniform.bindGroup);
      pass.setVertexBuffer(0, res.vertexBuffers[0]!);
      pass.setIndexBuffer(res.indexBuffer, 'uint32');
      pass.drawIndexed(res.indexCount);
      pass.end();
    });
  }

  function shadowOf(id: string): MeshShadowSlot | null {
    return rankedLayers.find((layer) => layer.id === id)?.slot ?? null;
  }

  function groundCasters(hostId: string, eyeRelBodyM: Readonly<Vec3>): readonly MeshGroundCaster[] {
    return rankedLayers
      .filter((layer) => layer.caster.groundHostId === hostId)
      .slice(0, MESH_SHADOW_GROUND_CASTERS)
      .map(({ slot, caster }) => ({
        slot: slot.slot,
        lightFromEye: narrowMat4(
          meshShadowLightFromEye(
            meshShadowLightFromLocal(slot.lightFromMesh, caster.rotM),
            eyeRelBodyM,
            caster.posM,
          ),
        ),
      }));
  }

  function destroy(): void {
    for (const res of meshes.values()) releaseResources(res);
    meshes.clear();
    horizonStandIn.destroy();
    horizonAtlasBinding = null;
    shadowMap.destroy();
    for (const uniform of shadowUniforms) uniform.buffer.destroy();
    shadowLayers = shadowLayers.map(() => null);
    rankedLayers = [];
  }

  const renderer: MeshBodyRenderer = {
    label: 'meshBodyRenderer',
    setMesh,
    clearMesh,
    hasMesh,
    probeOf,
    draw,
    drawContactShadow,
    renderShadows,
    shadowOf,
    groundCasters,
    shadowMapView,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
