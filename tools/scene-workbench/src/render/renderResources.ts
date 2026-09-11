import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';

/**
 * RenderResources — the engine-side objects a scene rebuild owns, held in
 * saga context. `gpu` outlives a dispose; `gpuAssets` is keyed by
 * `SceneAsset.id` (see `disposeScene` for the `epoch` contract).
 */
export type LidarGpuAsset = {
  readonly kind: 'pointCloud';
  readonly vertexBuffer: GPUBuffer;
  readonly pointCount: number;
  dispose(): void;
};

/**
 * `data`/`sh1` are read as `array<u32>` (7 and 3 words per record, spec §5);
 * `order` is the per-instance draw order the depth sort rewrites, so the
 * renderer steps it as a vertex buffer. `positionsM` stays CPU-side — the
 * sort re-reads it every frame.
 */
export type SplatGpuAsset = {
  readonly kind: 'gaussianSplat';
  readonly data: GPUBuffer;
  readonly sh1: GPUBuffer | null;
  readonly order: GPUBuffer;
  readonly positionsM: Float32Array;
  readonly splatCount: number;
  readonly shDegree: 0 | 1;
  dispose(): void;
};

/**
 * MVS mesh: one indexed primitive plus its atlas (spec §5). `texture` is plain `rgba8unorm` — the
 * swapchain is non-sRGB, siblings pass encoded colour through; `-srgb` looks right, renders dark.
 * `edges` indexes the same `positions` as a line list, for the wireframe overlay.
 */
export type MeshGpuAsset = {
  readonly kind: 'mesh';
  readonly positions: GPUBuffer;
  readonly uvs: GPUBuffer;
  readonly indices: GPUBuffer;
  readonly indexCount: number;
  readonly edges: GPUBuffer;
  readonly edgeIndexCount: number;
  readonly texture: GPUTexture;
  dispose(): void;
};

export type GpuAsset = LidarGpuAsset | SplatGpuAsset | MeshGpuAsset;

export type RenderResources = {
  gpu: GpuContext | null;
  gpuAssets: Map<string, GpuAsset>;
  depthTexture: GPUTexture | null;
  epoch: number;
};

export function createRenderResources(): RenderResources {
  return { gpu: null, gpuAssets: new Map(), depthTexture: null, epoch: 0 };
}

/**
 * Frees the previous group's device memory before the next group's uploads
 * allocate. `gpu` outlives a dispose; `epoch` bumps unconditionally (even
 * over an empty scene) because it is the staleness token an in-flight upload
 * compares against — see `acceptLoadedAsset`.
 */
export function disposeScene(resources: RenderResources): void {
  for (const asset of resources.gpuAssets.values()) asset.dispose();
  resources.gpuAssets.clear();
  resources.depthTexture?.destroy();
  resources.depthTexture = null;
  resources.epoch += 1;
}
