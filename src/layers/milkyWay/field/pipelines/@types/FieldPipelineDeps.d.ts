import type { HiiTier } from '../../starFormation/@types/HiiTier';
import type { IsmMapGenerator } from '../../ismMap/@types/IsmMapGenerator';

export type FieldPipelineDeps = {
  readonly device: GPUDevice;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly hdrFormat: GPUTextureFormat;
  readonly dustMapFormat: GPUTextureFormat;
  readonly fieldUbo: GPUBuffer;
  readonly hiiUbo: GPUBuffer;
  readonly tierUbo: Readonly<Record<HiiTier, GPUBuffer>>;
  readonly ismMapGenerator: IsmMapGenerator;
  readonly dustNoiseTex: GPUTexture;
  readonly dustNoiseSampler: GPUSampler;
  readonly warpNoiseTex: GPUTexture;
  readonly warpNoiseSampler: GPUSampler;
  readonly starGrainTex: GPUTexture;
  readonly starGrainSampler: GPUSampler;
  readonly dustMapSampler: GPUSampler;
  /** dustMap/fragment.wesl binding 14 — the Larson renorm scale, GPU-written by `ringReduce.dispatchSurvivorSum`. Fixed-lifetime, never regrows (see `createIsmMapRingReduce.ts`'s own `dustRenormBuffer`), so it rides here like `fieldUbo`/`hiiUbo` rather than in `FieldBindGroupResources`. */
  readonly dustRenormBuffer: GPUBuffer;
  /** fieldSplat/fragment.wesl bindings 15/16 — the arm-cloud/spur-cloud reciprocal-weightSum scales, GPU-written by `ringReduce.dispatchArmCloudFluxWeightSum`/`dispatchArmSpurFluxWeightSum`. Same fixed-lifetime shape as `dustRenormBuffer` above. */
  readonly armRenormBuffer: GPUBuffer;
  readonly spurRenormBuffer: GPUBuffer;
};
