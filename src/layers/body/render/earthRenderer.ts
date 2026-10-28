/**
 * earthRenderer: the true-scale textured Earth in the opaque near-field foreground
 * target. A cube-sphere (six level-0 `cubeSphereMesh` faces, one indexed mesh), not
 * `uvSphereMesh`, whose pole caps degenerate and pucker the equirectangular map.
 * Draw at most once per frame: the single non-dynamic uniform slot would race
 * `queue.writeBuffer` against the pending `queue.submit`.
 *
 * Each map kind has a 1x1 placeholder layer (`placeholders`) under a `committed`
 * layer; `setMap` writes the latter, `setPlaceholderMap` the former, so neither can
 * free the other's texture and arrival order is irrelevant. Explicit bind-group
 * layout, never 'auto'. Bitmaps upload with `flipY: true` to match the south-first v.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { EarthRenderer } from '../@types/EarthRenderer';
import type { AtlasTileRect } from '../../../@types/data/AtlasTileRect';
import type { TextureKind } from '../../../@types/data/TextureKind';
import { cubeSphereMesh } from '../../../utils/math/cubeSphereMesh';
import { generateMipChain, mipLevelCount } from '../../../services/gpu/lib/generateMipChain';
import { isLinearTextureKind } from '../../../utils/bodyTextures/isLinearTextureKind';
import { EARTH_SURFACE_UNIFORM_FLOATS } from './packEarthSurfaceUniforms';
import { resolveDepthCompare } from '../../../utils/gpu/resolveDepthCompare';
import vsCode from '../../../services/gpu/shaders/bodies/earth/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/bodies/earth/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';

/** Per-face grid subdivision: 6 x 48^2 quads in total. */
const CUBESPHERE_FACE_RESOLUTION = 48;

/** Derived from the packer's f32 count so it cannot drift from the layout. */
const UNIFORM_BUFFER_SIZE = EARTH_SURFACE_UNIFORM_FLOATS * 4;

/**
 * Per-kind binding and 1x1 placeholder texel; the layout, placeholders and bind
 * group all iterate it. Format is not a row: `isLinearTextureKind` picks it, so a
 * placeholder cannot contradict the real map. Total over `TextureKind`.
 */
const KIND_CFG = {
  // Mid-blue, opaque.
  surface: { binding: 2, placeholder: [70, 110, 160, 255] },
  // roughness=1 (R), ocean mask=0 (G): matte, glint-free.
  material: { binding: 3, placeholder: [255, 0, 0, 255] },
  // Black: no emissive term.
  night: { binding: 4, placeholder: [0, 0, 0, 255] },
  // Flat tangent-space normal: RG=128 gives nxy=(0,0), nz=1.
  normal: { binding: 5, placeholder: [128, 128, 255, 255] },
  // Transparent: cloud alpha 0 keeps the fragment's cloud shadow and night occlusion inert.
  clouds: { binding: 6, placeholder: [0, 0, 0, 0] },
} as const satisfies Record<
  TextureKind,
  { binding: number; placeholder: readonly [number, number, number, number] }
>;

/** Every `TextureKind`, in `KIND_CFG` order. */
const MAP_KINDS = Object.keys(KIND_CFG) as TextureKind[];

/** Concatenate the six faces into one indexed mesh. Two passes because per-triangle seam duplication makes sizes unknown up front. */
function concatCubeSphereFaces(resolution: number): {
  positions: Float32Array;
  uvs: Float32Array;
  tangents: Float32Array;
  indices: Uint32Array;
} {
  const faces: ReturnType<typeof cubeSphereMesh>[] = [];
  for (let face = 0; face < 6; face++) {
    faces.push(cubeSphereMesh(face, 0, 0, 0, resolution));
  }

  let totalPos = 0;
  let totalUv = 0;
  let totalTan = 0;
  let totalIdx = 0;
  for (const f of faces) {
    totalPos += f.positions.length;
    totalUv += f.uvs.length;
    totalTan += f.tangents.length;
    totalIdx += f.indices.length;
  }

  const positions = new Float32Array(totalPos);
  const uvs = new Float32Array(totalUv);
  const tangents = new Float32Array(totalTan);
  const indices = new Uint32Array(totalIdx);

  let posOff = 0;
  let uvOff = 0;
  let tanOff = 0;
  let idxOff = 0;
  let vertexBase = 0; // running vertex count = index rebase offset for this face
  for (const f of faces) {
    positions.set(f.positions, posOff);
    uvs.set(f.uvs, uvOff);
    tangents.set(f.tangents, tanOff);
    for (let k = 0; k < f.indices.length; k++) {
      indices[idxOff + k] = (f.indices[k] as number) + vertexBase;
    }
    posOff += f.positions.length;
    uvOff += f.uvs.length;
    tanOff += f.tangents.length;
    idxOff += f.indices.length;
    vertexBase += f.positions.length / 3;
  }

  return { positions, uvs, tangents, indices };
}

/** @param reversedZ this slab's depth convention (`SLAB_REVERSED_Z`), resolved by `resolveDepthCompare`. */
export function createEarthRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): EarthRenderer {
  // Tangents (unit +u=east) feed the fragment's tangent-space normal mapping.
  const mesh = concatCubeSphereFaces(CUBESPHERE_FACE_RESOLUTION);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'earth-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const uvBuffer = device.createBuffer({
    label: 'earth-uv-vbo',
    size: mesh.uvs.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uvBuffer, 0, mesh.uvs);

  const tangentBuffer = device.createBuffer({
    label: 'earth-tangent-vbo',
    size: mesh.tangents.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(tangentBuffer, 0, mesh.tangents);

  const indexBuffer = device.createBuffer({
    label: 'earth-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  const uniformBuffer = device.createBuffer({
    label: 'earth-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // `repeat` on u wraps the duplicated seam column; `clamp-to-edge` on v avoids
  // sampling past the poles.
  const sampler = device.createSampler({
    label: 'earth-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
  });

  const placeholders = new Map<TextureKind, GPUTexture>();
  for (const kind of MAP_KINDS) {
    const placeholder = device.createTexture({
      label: `earth-placeholder-${kind}`,
      size: [1, 1, 1],
      format: isLinearTextureKind(kind) ? 'rgba8unorm' : 'rgba8unorm-srgb',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: placeholder },
      new Uint8Array(KIND_CFG[kind].placeholder),
      { bytesPerRow: 4, rowsPerImage: 1 },
      [1, 1, 1],
    );
    placeholders.set(kind, placeholder);
  }

  const committed = new Map<TextureKind, GPUTexture>();

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'earth-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
      ...MAP_KINDS.map((kind) => ({
        binding: KIND_CFG[kind].binding,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const },
      })),
    ],
  });

  function buildBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'earth-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        ...MAP_KINDS.map((kind) => ({
          binding: KIND_CFG[kind].binding,
          resource: (committed.get(kind) ?? placeholders.get(kind)!).createView(),
        })),
      ],
    });
  }
  let bindGroup = buildBindGroup();

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'earth.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'earth.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'earth-pipeline',
    layout: device.createPipelineLayout({
      label: 'earth-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 12, // 3 × f32 position
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
        {
          arrayStride: 8, // 2 × f32 uv
          attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
        },
        {
          arrayStride: 12, // 3 × f32 tangent (unit +u=east)
          attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [{ format: targetFormat }],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw', // CCW = outward-facing (matches cubeSphereMesh winding)
      cullMode: 'back', // discard inward-facing (inner-surface) triangles
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  function setMap(kind: TextureKind, bitmap: ImageBitmap): void {
    // `isLinearTextureKind` is shared with the fetcher's decode path and the filename helper.
    const format: GPUTextureFormat = isLinearTextureKind(kind) ? 'rgba8unorm' : 'rgba8unorm-srgb';
    const levels = mipLevelCount(bitmap.width, bitmap.height);
    const fresh = device.createTexture({
      label: `earth-${kind}`,
      size: [bitmap.width, bitmap.height, 1],
      format,
      mipLevelCount: levels,
      // RENDER_ATTACHMENT: generateMipChain renders each level below 0.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // flipY so v=0 is the south row; the material map is co-registered with the albedo.
    device.queue.copyExternalImageToTexture({ source: bitmap, flipY: true }, { texture: fresh }, [
      bitmap.width,
      bitmap.height,
      1,
    ]);
    generateMipChain(device, fresh);
    // Retire ONLY a prior committed texture, never the placeholder underneath.
    committed.get(kind)?.destroy();
    committed.set(kind, fresh);
    bindGroup = buildBindGroup();
  }

  /** Free a kind's committed map; the placeholder underneath binds again. */
  function clearMap(kind: TextureKind): void {
    const texture = committed.get(kind);
    if (texture === undefined) return;
    texture.destroy();
    committed.delete(kind);
    bindGroup = buildBindGroup();
  }

  /** `setMap`'s twin: the texture lands in `placeholders`, and only `rect` of the bitmap is copied. */
  function setPlaceholderMap(kind: TextureKind, atlas: ImageBitmap, rect: AtlasTileRect): void {
    const format: GPUTextureFormat = isLinearTextureKind(kind) ? 'rgba8unorm' : 'rgba8unorm-srgb';
    const levels = mipLevelCount(rect.w, rect.h);
    const fresh = device.createTexture({
      label: `earth-placeholder-${kind}`,
      size: [rect.w, rect.h, 1],
      format,
      mipLevelCount: levels,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // `origin` is in UNFLIPPED source coordinates; `flipY` then applies to the selected
    // region alone, matching a standalone `setMap`. The mock device rasterises
    // nothing, so a wrong-row crop passes CI and is visibly wrong on screen.
    device.queue.copyExternalImageToTexture(
      { source: atlas, origin: { x: rect.x, y: rect.y }, flipY: true },
      { texture: fresh },
      [rect.w, rect.h, 1],
    );
    generateMipChain(device, fresh);
    // Retire ONLY the prior PLACEHOLDER, never the committed map.
    placeholders.get(kind)?.destroy();
    placeholders.set(kind, fresh);
    bindGroup = buildBindGroup();
  }

  /** How `surfaceTileRenderer` shares this renderer's maps; same resolution as `buildBindGroup`. */
  function getMapView(kind: TextureKind): GPUTextureView {
    return (committed.get(kind) ?? placeholders.get(kind)!).createView();
  }

  function draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void {
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, uvBuffer);
    pass.setVertexBuffer(2, tangentBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(indexCount);
  }

  function destroy(): void {
    positionBuffer.destroy();
    uvBuffer.destroy();
    tangentBuffer.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
    // Neither setter frees the other's layer, so teardown releases both.
    for (const texture of committed.values()) texture.destroy();
    for (const placeholder of placeholders.values()) placeholder.destroy();
    committed.clear();
    placeholders.clear();
  }

  const renderer: EarthRenderer = {
    label: 'earthRenderer',
    setMap,
    clearMap,
    setPlaceholderMap,
    getMapView,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
