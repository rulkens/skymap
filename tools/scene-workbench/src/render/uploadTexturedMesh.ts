import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import type { TexturedMeshGeometry } from '../../../scene-recon/pack/packMeshGlb';
import { meshEdgeIndices } from './meshEdgeIndices';
import type { MeshGpuAsset } from './renderResources';

/**
 * Uploads the `mesh.glb` subset as the two vertex buffers, index buffer and
 * atlas the mesh pipeline binds. `flipY: false` is the landmine: glTF's uv
 * origin is the image's top-left, as WebGPU's is — the inverse of the
 * whole-globe uploads `docs/RENDERER.md` describes, and flipping here would
 * smear the atlas rather than fail.
 */
export function uploadTexturedMesh(
  gpu: GpuContext,
  geometry: TexturedMeshGeometry,
  image: ImageBitmap,
): MeshGpuAsset {
  const { device } = gpu;
  const indexCount = geometry.indices.length;

  const vertexCount = geometry.positions.length / 3;

  const uploadBuffer = (
    source: Float32Array | Uint32Array,
    usage: GPUBufferUsageFlags,
    name: string,
    count: number,
  ): GPUBuffer => {
    const buffer = device.createBuffer({
      label: `scene-workbench-mesh-${name}-${count}`,
      size: source.byteLength,
      usage: usage | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, source);
    return buffer;
  };

  const positions = uploadBuffer(
    geometry.positions,
    GPUBufferUsage.VERTEX,
    'positions',
    vertexCount,
  );
  const uvs = uploadBuffer(geometry.uvs, GPUBufferUsage.VERTEX, 'uvs', vertexCount);
  const indices = uploadBuffer(geometry.indices, GPUBufferUsage.INDEX, 'indices', indexCount);
  const edgeIndices = meshEdgeIndices(geometry.indices);
  const edges = uploadBuffer(edgeIndices, GPUBufferUsage.INDEX, 'edges', edgeIndices.length);

  const texture = device.createTexture({
    label: `scene-workbench-mesh-atlas-${image.width}x${image.height}`,
    size: [image.width, image.height],
    format: 'rgba8unorm',
    // RENDER_ATTACHMENT looks surplus on a sampled-only texture; WebGPU
    // validates copyExternalImageToTexture destinations for it.
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: image, flipY: false }, { texture }, [
    image.width,
    image.height,
  ]);

  return {
    kind: 'mesh',
    positions,
    uvs,
    indices,
    indexCount,
    edges,
    edgeIndexCount: edgeIndices.length,
    texture,
    dispose: () => {
      positions.destroy();
      uvs.destroy();
      indices.destroy();
      edges.destroy();
      texture.destroy();
    },
  };
}
